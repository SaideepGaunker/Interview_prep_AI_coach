"""
Interview Service - Business logic for interview session management
"""
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status

from app.db.models import InterviewSession, Question, PerformanceMetrics, User
from app.schemas.interview import (
    InterviewSessionCreate, InterviewSessionUpdate, SessionConfigRequest,
    AnswerSubmission, SessionType, SessionStatus
)
from app.services.question_service import QuestionService
from app.services.gemini_service import GeminiService
from app.crud.interview import (
    create_interview_session, get_interview_session, update_interview_session,
    get_user_sessions, create_performance_metric
)


class InterviewService:
    """Service for managing interview sessions"""
    
    def __init__(self, db: Session):
        self.db = db
        self.question_service = QuestionService(db)
        self.gemini_service = GeminiService(db)
        self.active_sessions = {}  # In-memory session state (use Redis in production)
    
    def start_interview_session(
        self, 
        user: User, 
        session_data: InterviewSessionCreate
    ) -> Dict[str, Any]:
        """Start a new interview session"""
        
        # Create session
        session = create_interview_session(self.db, user.id, session_data)
        
        # Get questions for the session
        questions = self.question_service.get_questions_for_session(
            role=session_data.target_role,
            difficulty="intermediate",  # Default difficulty
            session_type=session_data.session_type.value,
            count=5  # Default question count
        )
        
        # Initialize session state
        self.active_sessions[session.id] = {
            "questions": [q.id for q in questions],
            "current_question_index": 0,
            "start_time": datetime.utcnow(),
            "answers": {},
            "paused_time": 0
        }
        
        return {
            "session": session,
            "questions": questions,
            "configuration": {
                "total_questions": len(questions),
                "estimated_duration": sum(q.expected_duration for q in questions)
            }
        }
    
    def start_test_session(
        self, 
        user: User, 
        session_data: InterviewSessionCreate
    ) -> Dict[str, Any]:
        """Start a new test session (without recording)"""
        
        # Create session with test status
        session = create_interview_session(self.db, user.id, session_data)
        
        # Get questions for the session
        questions = self.question_service.get_questions_for_session(
            role=session_data.target_role,
            difficulty="intermediate",  # Default difficulty
            session_type=session_data.session_type.value,
            count=5  # Default question count
        )
        
        # Initialize session state for test mode
        self.active_sessions[session.id] = {
            "questions": [q.id for q in questions],
            "current_question_index": 0,
            "start_time": datetime.utcnow(),
            "answers": {},
            "paused_time": 0,
            "is_test_mode": True
        }
        
        return {
            "session": session,
            "questions": questions,
            "configuration": {
                "total_questions": len(questions),
                "estimated_duration": sum(q.expected_duration for q in questions)
            }
        }
    
    def get_session_by_id(self, session_id: int, user_id: int) -> Optional[InterviewSession]:
        """Get interview session by ID"""
        session = get_interview_session(self.db, session_id)
        
        # Verify ownership
        if session and session.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this session"
            )
        
        return session
    
    def get_current_question(self, session_id: int, user_id: int) -> Optional[Question]:
        """Get current question for the session"""
        session = self.get_session_by_id(session_id, user_id)
        if not session or session.status != SessionStatus.ACTIVE:
            return None
        
        session_state = self.active_sessions.get(session_id)
        if not session_state:
            return None
        
        current_index = session_state["current_question_index"]
        if current_index >= len(session_state["questions"]):
            return None
        
        question_id = session_state["questions"][current_index]
        return self.question_service.get_question_by_id(question_id)
    
    def submit_answer(
        self, 
        session_id: int, 
        user_id: int, 
        answer_data: AnswerSubmission
    ) -> Dict[str, Any]:
        """Submit answer for current question"""
        session = self.get_session_by_id(session_id, user_id)
        if not session or session.status != SessionStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session is not active"
            )
        
        session_state = self.active_sessions.get(session_id)
        if not session_state:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session state not found"
            )
        
        # Get question
        question = self.question_service.get_question_by_id(answer_data.question_id)
        if not question:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Question not found"
            )
        
        # Evaluate answer using Gemini API
        user = self.db.query(User).filter(User.id == user_id).first()
        context = {
            "role": user.role,
            "experience_level": user.experience_level,
            "target_role": session.target_role
        }
        
        evaluation = self.gemini_service.evaluate_answer(
            question=question.content,
            answer=answer_data.answer_text,
            context=context
        )
        
        # Store performance metrics
        performance_metric = create_performance_metric(
            self.db,
            session_id=session_id,
            question_id=answer_data.question_id,
            answer_text=answer_data.answer_text,
            response_time=answer_data.response_time,
            content_quality_score=evaluation.get('overall_score', 0),
            improvement_suggestions=evaluation.get('suggestions', [])
        )
        
        # Update session state
        session_state["answers"][answer_data.question_id] = {
            "answer": answer_data.answer_text,
            "evaluation": evaluation,
            "timestamp": datetime.utcnow()
        }
        
        # Move to next question
        session_state["current_question_index"] += 1
        
        # Check if session is complete
        is_complete = session_state["current_question_index"] >= len(session_state["questions"])
        next_question_id = None
        
        if not is_complete:
            next_question_id = session_state["questions"][session_state["current_question_index"]]
        else:
            # Complete the session
            self._complete_session(session_id, user_id)
        
        return {
            "question_id": answer_data.question_id,
            "submitted": True,
            "next_question_id": next_question_id,
            "session_completed": is_complete,
            "real_time_feedback": {
                "score": evaluation.get('overall_score', 0),
                "quick_tip": evaluation.get('suggestions', [''])[0] if evaluation.get('suggestions') else None
            }
        }
    
    def pause_session(self, session_id: int, user_id: int) -> bool:
        """Pause interview session"""
        session = self.get_session_by_id(session_id, user_id)
        if not session or session.status != SessionStatus.ACTIVE:
            return False
        
        # Update session status
        update_data = InterviewSessionUpdate(status=SessionStatus.PAUSED)
        update_interview_session(self.db, session_id, update_data)
        
        # Update session state
        if session_id in self.active_sessions:
            self.active_sessions[session_id]["paused_at"] = datetime.utcnow()
        
        return True
    
    def resume_session(self, session_id: int, user_id: int) -> bool:
        """Resume paused interview session"""
        session = self.get_session_by_id(session_id, user_id)
        if not session or session.status != SessionStatus.PAUSED:
            return False
        
        # Update session status
        update_data = InterviewSessionUpdate(status=SessionStatus.ACTIVE)
        update_interview_session(self.db, session_id, update_data)
        
        # Update session state
        if session_id in self.active_sessions:
            paused_at = self.active_sessions[session_id].get("paused_at")
            if paused_at:
                pause_duration = (datetime.utcnow() - paused_at).total_seconds()
                self.active_sessions[session_id]["paused_time"] += pause_duration
                del self.active_sessions[session_id]["paused_at"]
        
        return True
    
    def complete_session(self, session_id: int, user_id: int) -> Dict[str, Any]:
        """Manually complete interview session"""
        return self._complete_session(session_id, user_id)
    
    def _complete_session(self, session_id: int, user_id: int) -> Dict[str, Any]:
        """Internal method to complete session"""
        session = self.get_session_by_id(session_id, user_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        # Calculate overall score
        performance_metrics = self.db.query(PerformanceMetrics).filter(
            PerformanceMetrics.session_id == session_id
        ).all()
        
        if performance_metrics:
            overall_score = sum(m.content_quality_score for m in performance_metrics) / len(performance_metrics)
        else:
            overall_score = 0.0
        
        # Update session
        update_data = InterviewSessionUpdate(
            status=SessionStatus.COMPLETED,
            overall_score=overall_score,
            completed_at=datetime.utcnow()
        )
        update_interview_session(self.db, session_id, update_data)
        
        # Generate comprehensive feedback
        session_state = self.active_sessions.get(session_id, {})
        performance_data = {
            "session_id": session_id,
            "answers": session_state.get("answers", {}),
            "overall_score": overall_score,
            "metrics": [
                {
                    "question_id": m.question_id,
                    "content_score": m.content_quality_score,
                    "body_language_score": m.body_language_score,
                    "tone_score": m.tone_confidence_score,
                    "response_time": m.response_time
                }
                for m in performance_metrics
            ]
        }
        
        feedback = self.gemini_service.generate_feedback(performance_data)
        
        # Clean up session state
        if session_id in self.active_sessions:
            del self.active_sessions[session_id]
        
        return {
            "session_id": session_id,
            "overall_score": overall_score,
            "feedback": feedback,
            "completed_at": datetime.utcnow().isoformat()
        }
    
    def get_session_progress(self, session_id: int, user_id: int) -> Dict[str, Any]:
        """Get current session progress"""
        session = self.get_session_by_id(session_id, user_id)
        if not session:
            return {}
        
        session_state = self.active_sessions.get(session_id, {})
        if not session_state:
            return {}
        
        start_time = session_state.get("start_time", datetime.utcnow())
        elapsed_time = (datetime.utcnow() - start_time).total_seconds() - session_state.get("paused_time", 0)
        remaining_time = max(0, (session.duration * 60) - elapsed_time)
        
        current_question = session_state.get("current_question_index", 0)
        total_questions = len(session_state.get("questions", []))
        completion_percentage = (current_question / total_questions * 100) if total_questions > 0 else 0
        
        return {
            "session_id": session_id,
            "current_question": current_question + 1,  # 1-based for UI
            "total_questions": total_questions,
            "elapsed_time": int(elapsed_time),
            "remaining_time": int(remaining_time),
            "completion_percentage": completion_percentage
        }
    
    def get_user_session_history(self, user_id: int, limit: int = 10) -> List[InterviewSession]:
        """Get user's interview session history"""
        return get_user_sessions(self.db, user_id, limit)
    
    def get_session_summary(self, session_id: int, user_id: int) -> Dict[str, Any]:
        """Get comprehensive session summary"""
        session = self.get_session_by_id(session_id, user_id)
        if not session or session.status != SessionStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session not completed"
            )
        
        # Get performance metrics
        performance_metrics = self.db.query(PerformanceMetrics).filter(
            PerformanceMetrics.session_id == session_id
        ).all()
        
        # Calculate statistics
        total_questions = len(performance_metrics)
        questions_answered = len([m for m in performance_metrics if m.answer_text])
        
        if performance_metrics:
            avg_content_score = sum(m.content_quality_score for m in performance_metrics) / len(performance_metrics)
            avg_body_language = sum(m.body_language_score or 0 for m in performance_metrics) / len(performance_metrics)
            avg_tone_score = sum(m.tone_confidence_score or 0 for m in performance_metrics) / len(performance_metrics)
            total_response_time = sum(m.response_time for m in performance_metrics)
        else:
            avg_content_score = avg_body_language = avg_tone_score = total_response_time = 0
        
        # Collect improvement suggestions
        all_suggestions = []
        for metric in performance_metrics:
            if metric.improvement_suggestions:
                all_suggestions.extend(metric.improvement_suggestions)
        
        # Get unique suggestions
        unique_suggestions = list(set(all_suggestions))
        
        return {
            "session": session,
            "total_questions": total_questions,
            "questions_answered": questions_answered,
            "average_scores": {
                "content_quality": avg_content_score,
                "body_language": avg_body_language,
                "tone_confidence": avg_tone_score
            },
            "time_breakdown": {
                "total_time": session.duration * 60,
                "response_time": total_response_time,
                "average_per_question": total_response_time / total_questions if total_questions > 0 else 0
            },
            "improvements": unique_suggestions[:5],  # Top 5 suggestions
            "recommendations": self._generate_recommendations(session, performance_metrics)
        }
    
    def _generate_recommendations(self, session: InterviewSession, metrics: List[PerformanceMetrics]) -> List[str]:
        """Generate personalized recommendations based on session performance"""
        recommendations = []
        
        if not metrics:
            return ["Complete more practice sessions to get personalized recommendations"]
        
        avg_score = sum(m.content_quality_score for m in metrics) / len(metrics)
        avg_response_time = sum(m.response_time for m in metrics) / len(metrics)
        
        # Score-based recommendations
        if avg_score < 50:
            recommendations.append("Focus on improving answer quality with specific examples and structured responses")
        elif avg_score < 70:
            recommendations.append("Practice using the STAR method (Situation, Task, Action, Result) for better answers")
        
        # Time-based recommendations
        if avg_response_time > 180:  # 3 minutes
            recommendations.append("Work on being more concise - aim for 2-3 minute responses")
        elif avg_response_time < 60:  # 1 minute
            recommendations.append("Provide more detailed answers with specific examples")
        
        # Session type specific recommendations
        if session.session_type == "technical":
            recommendations.append("Practice more technical problems in your domain")
        elif session.session_type == "hr":
            recommendations.append("Prepare more behavioral examples using the STAR method")
        
        return recommendations[:3]  # Return top 3 recommendations  
    
    def get_user_sessions(
        self, 
        user_id: int, 
        skip: int = 0, 
        limit: int = 100, 
        status: Optional[str] = None
    ) -> List[InterviewSession]:
        """Get user's interview sessions with filtering"""
        query = self.db.query(InterviewSession).filter(InterviewSession.user_id == user_id)
        
        if status:
            query = query.filter(InterviewSession.status == status)
        
        return query.order_by(InterviewSession.created_at.desc()).offset(skip).limit(limit).all()
    
    def get_user_statistics(self, user_id: int) -> Dict[str, Any]:
        """Get user's session statistics"""
        total_sessions = self.db.query(InterviewSession).filter(
            InterviewSession.user_id == user_id
        ).count()
        
        completed_sessions = self.db.query(InterviewSession).filter(
            InterviewSession.user_id == user_id,
            InterviewSession.status == "completed"
        ).count()
        
        avg_score = self.db.query(
            func.avg(InterviewSession.overall_score)
        ).filter(
            InterviewSession.user_id == user_id,
            InterviewSession.status == "completed"
        ).scalar() or 0.0
        
        return {
            "total_sessions": total_sessions,
            "completed_sessions": completed_sessions,
            "completion_rate": (completed_sessions / total_sessions * 100) if total_sessions > 0 else 0,
            "average_score": float(avg_score)
        }
    
    def get_session_details(self, session_id: int, user_id: int) -> Optional[Dict[str, Any]]:
        """Get detailed session information"""
        session = self.get_session_by_id(session_id, user_id)
        if not session:
            return None
        
        # Get performance metrics
        metrics = self.db.query(PerformanceMetrics).filter(
            PerformanceMetrics.session_id == session_id
        ).all()
        
        return {
            "session": session,
            "metrics": metrics,
            "questions_answered": len(metrics),
            "progress": self.get_session_progress(session_id, user_id)
        }
    
    def pause_interview_session(self, session_id: int, user_id: int) -> Optional[InterviewSession]:
        """Pause interview session"""
        if self.pause_session(session_id, user_id):
            return self.get_session_by_id(session_id, user_id)
        return None
    
    def resume_interview_session(self, session_id: int, user_id: int) -> Optional[InterviewSession]:
        """Resume interview session"""
        if self.resume_session(session_id, user_id):
            return self.get_session_by_id(session_id, user_id)
        return None
    
    def complete_interview_session(
        self, 
        session_id: int, 
        user_id: int, 
        final_score: Optional[float] = None
    ) -> Optional[Dict[str, Any]]:
        """Complete interview session"""
        session = self.get_session_by_id(session_id, user_id)
        if not session:
            return None
        
        # Use provided score or calculate from metrics
        if final_score is not None:
            overall_score = final_score
        else:
            metrics = self.db.query(PerformanceMetrics).filter(
                PerformanceMetrics.session_id == session_id
            ).all()
            
            if metrics:
                overall_score = sum(m.content_quality_score for m in metrics) / len(metrics)
            else:
                overall_score = 0.0
        
        # Update session
        update_data = InterviewSessionUpdate(
            status=SessionStatus.COMPLETED,
            overall_score=overall_score,
            completed_at=datetime.utcnow()
        )
        updated_session = update_interview_session(self.db, session_id, update_data)
        
        # Generate summary
        summary = self.get_session_summary(session_id, user_id)
        
        # Clean up session state
        if session_id in self.active_sessions:
            del self.active_sessions[session_id]
        
        return {
            "session": updated_session,
            "summary": summary
        }