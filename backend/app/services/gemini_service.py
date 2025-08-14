"""
Gemini AI Service for question generation and answer evaluation
"""
import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import google.generativeai as genai
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Question, User
from app.schemas.question import QuestionCreate

logger = logging.getLogger(__name__)

# Configure Gemini API only if an API key is provided
if settings.GEMINI_API_KEY:
    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
    except Exception:
        # Fallback: leave unconfigured to force offline behavior
        pass


class GeminiService:
    """Service for interacting with Google Gemini API"""
    
    def __init__(self, db: Session):
        self.db = db
        try:
            # Create model only when API is available
            self.model = genai.GenerativeModel('gemini-pro') if settings.GEMINI_API_KEY else None
        except Exception:
            self.model = None
        self.cache = {}  # Simple in-memory cache
        self.cache_ttl = timedelta(hours=1)
    
    def generate_questions(
        self, 
        role: str, 
        difficulty: str = "intermediate", 
        question_type: str = "mixed",
        count: int = 5
    ) -> List[Dict[str, Any]]:
        """Generate interview questions using Gemini API"""
        
        # Check cache first
        cache_key = f"{role}_{difficulty}_{question_type}_{count}"
        if self._is_cached(cache_key):
            logger.info(f"Returning cached questions for {cache_key}")
            return self.cache[cache_key]["data"]
        
        try:
            prompt = self._build_question_prompt(role, difficulty, question_type, count)
            
            if not self.model:
                raise RuntimeError("Gemini model not available")
            response = self.model.generate_content(prompt)
            questions_data = self._parse_questions_response(getattr(response, 'text', '') or '')
            
            # Cache the results
            self._cache_data(cache_key, questions_data)
            
            # Store questions in database
            self._store_questions(questions_data, role, difficulty, question_type)
            
            return questions_data
            
        except Exception as e:
            logger.error(f"Error generating questions: {str(e)}")
            # Return fallback questions
            return self._get_fallback_questions(role, difficulty, question_type, count)
    
    def evaluate_answer(
        self, 
        question: str, 
        answer: str, 
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Evaluate user's answer using Gemini API"""
        
        try:
            prompt = self._build_evaluation_prompt(question, answer, context)
            
            if not self.model:
                raise RuntimeError("Gemini model not available")
            response = self.model.generate_content(prompt)
            evaluation = self._parse_evaluation_response(getattr(response, 'text', '') or '')
            
            return evaluation
            
        except Exception as e:
            logger.error(f"Error evaluating answer: {str(e)}")
            return self._get_fallback_evaluation()
    
    def generate_feedback(
        self, 
        performance_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate personalized feedback based on performance data"""
        
        try:
            prompt = self._build_feedback_prompt(performance_data)
            
            if not self.model:
                raise RuntimeError("Gemini model not available")
            response = self.model.generate_content(prompt)
            feedback = self._parse_feedback_response(getattr(response, 'text', '') or '')
            
            return feedback
            
        except Exception as e:
            logger.error(f"Error generating feedback: {str(e)}")
            return self._get_fallback_feedback()
    
    def generate_follow_up_questions(
        self, 
        original_question: str, 
        user_answer: str, 
        context: Dict[str, Any]
    ) -> List[str]:
        """Generate follow-up questions based on user's answer"""
        
        try:
            prompt = self._build_followup_prompt(original_question, user_answer, context)
            
            if not self.model:
                raise RuntimeError("Gemini model not available")
            response = self.model.generate_content(prompt)
            follow_ups = self._parse_followup_response(getattr(response, 'text', '') or '')
            
            return follow_ups
            
        except Exception as e:
            logger.error(f"Error generating follow-up questions: {str(e)}")
            return []
    
    def _build_question_prompt(
        self, 
        role: str, 
        difficulty: str, 
        question_type: str, 
        count: int
    ) -> str:
        """Build prompt for question generation"""
        
        type_instructions = {
            "behavioral": "behavioral and situational questions that assess soft skills, teamwork, and problem-solving approach",
            "technical": "technical questions that test domain-specific knowledge and skills",
            "mixed": "a mix of behavioral, technical, and situational questions"
        }
        
        difficulty_instructions = {
            "beginner": "entry-level questions suitable for candidates with 0-2 years of experience",
            "intermediate": "mid-level questions for candidates with 2-5 years of experience", 
            "advanced": "senior-level questions for experienced candidates with 5+ years"
        }
        
        prompt = f"""
        You are an expert interview coach and recruiter. Generate {count} realistic interview questions for a {role} position.

        Requirements:
        - Difficulty level: {difficulty_instructions.get(difficulty, 'intermediate')}
        - Question type: {type_instructions.get(question_type, 'mixed')}
        - Questions should be realistic and commonly asked in actual interviews
        - Include a mix of open-ended and specific questions
        - Questions should be relevant to current industry standards and practices

        For each question, provide:
        1. The question text
        2. Question category (behavioral, technical, situational, etc.)
        3. Expected answer duration in minutes
        4. Key points that a good answer should cover

        Format your response as a JSON array with this structure:
        [
            {{
                "question": "Question text here",
                "category": "behavioral|technical|situational",
                "duration": 3,
                "key_points": ["point 1", "point 2", "point 3"]
            }}
        ]

        Role: {role}
        Generate questions now:
        """
        
        return prompt
    
    def _build_evaluation_prompt(
        self, 
        question: str, 
        answer: str, 
        context: Dict[str, Any]
    ) -> str:
        """Build prompt for answer evaluation"""
        
        user_role = context.get('role', 'job_seeker')
        experience_level = context.get('experience_level', 'intermediate')
        target_role = context.get('target_role', 'general')
        
        prompt = f"""
        You are an expert interview evaluator. Evaluate the following interview answer.

        Question: {question}
        
        Candidate's Answer: {answer}
        
        Context:
        - Candidate Role: {user_role}
        - Experience Level: {experience_level}
        - Target Position: {target_role}

        Evaluate the answer on these criteria:
        1. Content Quality (0-100): Relevance, completeness, accuracy
        2. Communication (0-100): Clarity, structure, professionalism
        3. Depth (0-100): Level of detail and insight
        4. Relevance (0-100): How well it addresses the question

        Provide:
        - Overall score (0-100)
        - Scores for each criterion
        - Specific strengths (2-3 points)
        - Areas for improvement (2-3 points)
        - Actionable suggestions for better answers

        Format as JSON:
        {{
            "overall_score": 85,
            "scores": {{
                "content_quality": 80,
                "communication": 90,
                "depth": 85,
                "relevance": 85
            }},
            "strengths": ["strength 1", "strength 2"],
            "improvements": ["improvement 1", "improvement 2"],
            "suggestions": ["suggestion 1", "suggestion 2"]
        }}
        """
        
        return prompt
    
    def _build_feedback_prompt(self, performance_data: Dict[str, Any]) -> str:
        """Build prompt for personalized feedback generation"""
        
        prompt = f"""
        You are an expert interview coach. Generate personalized feedback based on the candidate's overall performance.

        Performance Data:
        {json.dumps(performance_data, indent=2)}

        Generate comprehensive feedback including:
        1. Overall performance summary
        2. Key strengths to leverage
        3. Priority areas for improvement
        4. Specific action items and practice recommendations
        5. Motivational closing message

        Format as JSON:
        {{
            "summary": "Overall performance summary",
            "strengths": ["strength 1", "strength 2"],
            "improvements": ["area 1", "area 2"],
            "action_items": ["action 1", "action 2"],
            "motivation": "Encouraging message"
        }}
        """
        
        return prompt
    
    def _build_followup_prompt(
        self, 
        original_question: str, 
        user_answer: str, 
        context: Dict[str, Any]
    ) -> str:
        """Build prompt for follow-up question generation"""
        
        prompt = f"""
        You are an experienced interviewer. Based on the candidate's answer, generate 2-3 relevant follow-up questions.

        Original Question: {original_question}
        Candidate's Answer: {user_answer}
        
        Generate follow-up questions that:
        - Dig deeper into the candidate's response
        - Clarify any ambiguous points
        - Explore related scenarios or experiences
        - Test the depth of their knowledge/experience

        Format as JSON array:
        ["follow-up question 1", "follow-up question 2", "follow-up question 3"]
        """
        
        return prompt
    
    def _parse_questions_response(self, response_text: str) -> List[Dict[str, Any]]:
        """Parse Gemini response for questions"""
        try:
            # Clean the response text
            cleaned_text = response_text.strip()
            if cleaned_text.startswith('```json'):
                cleaned_text = cleaned_text[7:]
            if cleaned_text.endswith('```'):
                cleaned_text = cleaned_text[:-3]
            
            questions = json.loads(cleaned_text)
            
            # Validate and clean questions
            validated_questions = []
            for q in questions:
                if isinstance(q, dict) and 'question' in q:
                    validated_questions.append({
                        'question': q.get('question', ''),
                        'category': q.get('category', 'general'),
                        'duration': q.get('duration', 3),
                        'key_points': q.get('key_points', [])
                    })
            
            return validated_questions
            
        except Exception as e:
            logger.error(f"Error parsing questions response: {str(e)}")
            return []
    
    def _parse_evaluation_response(self, response_text: str) -> Dict[str, Any]:
        """Parse Gemini response for answer evaluation"""
        try:
            cleaned_text = response_text.strip()
            if cleaned_text.startswith('```json'):
                cleaned_text = cleaned_text[7:]
            if cleaned_text.endswith('```'):
                cleaned_text = cleaned_text[:-3]
            
            evaluation = json.loads(cleaned_text)
            return evaluation
            
        except Exception as e:
            logger.error(f"Error parsing evaluation response: {str(e)}")
            return self._get_fallback_evaluation()
    
    def _parse_feedback_response(self, response_text: str) -> Dict[str, Any]:
        """Parse Gemini response for feedback"""
        try:
            cleaned_text = response_text.strip()
            if cleaned_text.startswith('```json'):
                cleaned_text = cleaned_text[7:]
            if cleaned_text.endswith('```'):
                cleaned_text = cleaned_text[:-3]
            
            feedback = json.loads(cleaned_text)
            return feedback
            
        except Exception as e:
            logger.error(f"Error parsing feedback response: {str(e)}")
            return self._get_fallback_feedback()
    
    def _parse_followup_response(self, response_text: str) -> List[str]:
        """Parse Gemini response for follow-up questions"""
        try:
            cleaned_text = response_text.strip()
            if cleaned_text.startswith('```json'):
                cleaned_text = cleaned_text[7:]
            if cleaned_text.endswith('```'):
                cleaned_text = cleaned_text[:-3]
            
            follow_ups = json.loads(cleaned_text)
            return follow_ups if isinstance(follow_ups, list) else []
            
        except Exception as e:
            logger.error(f"Error parsing follow-up response: {str(e)}")
            return []
    
    def _store_questions(
        self, 
        questions_data: List[Dict[str, Any]], 
        role: str, 
        difficulty: str, 
        question_type: str
    ):
        """Store generated questions in database"""
        try:
            for q_data in questions_data:
                question = Question(
                    content=q_data['question'],
                    question_type=q_data['category'],
                    role_category=role,
                    difficulty_level=difficulty,
                    expected_duration=q_data['duration'],
                    generated_by='gemini_api'
                )
                self.db.add(question)
            
            self.db.commit()
            logger.info(f"Stored {len(questions_data)} questions in database")
            
        except Exception as e:
            logger.error(f"Error storing questions: {str(e)}")
            self.db.rollback()
    
    def _is_cached(self, cache_key: str) -> bool:
        """Check if data is cached and not expired"""
        if cache_key not in self.cache:
            return False
        
        cached_time = self.cache[cache_key]["timestamp"]
        return datetime.now() - cached_time < self.cache_ttl
    
    def _cache_data(self, cache_key: str, data: Any):
        """Cache data with timestamp"""
        self.cache[cache_key] = {
            "data": data,
            "timestamp": datetime.now()
        }
    
    def _get_fallback_questions(
        self, 
        role: str, 
        difficulty: str, 
        question_type: str, 
        count: int
    ) -> List[Dict[str, Any]]:
        """Return fallback questions when API fails"""
        fallback_questions = [
            {
                "question": "Tell me about yourself and your background.",
                "category": "behavioral",
                "duration": 3,
                "key_points": ["Professional background", "Key skills", "Career goals"]
            },
            {
                "question": "Why are you interested in this position?",
                "category": "behavioral", 
                "duration": 2,
                "key_points": ["Company research", "Role alignment", "Career growth"]
            },
            {
                "question": "Describe a challenging project you worked on.",
                "category": "behavioral",
                "duration": 4,
                "key_points": ["Problem description", "Solution approach", "Results achieved"]
            },
            {
                "question": "What are your greatest strengths?",
                "category": "behavioral",
                "duration": 2,
                "key_points": ["Relevant strengths", "Specific examples", "Value to employer"]
            },
            {
                "question": "Where do you see yourself in 5 years?",
                "category": "behavioral",
                "duration": 2,
                "key_points": ["Career progression", "Skill development", "Long-term goals"]
            }
        ]
        
        return fallback_questions[:count]
    
    def _get_fallback_evaluation(self) -> Dict[str, Any]:
        """Return fallback evaluation when API fails"""
        return {
            "overall_score": 70,
            "scores": {
                "content_quality": 70,
                "communication": 70,
                "depth": 70,
                "relevance": 70
            },
            "strengths": ["Clear communication", "Relevant examples"],
            "improvements": ["Add more specific details", "Structure your answer better"],
            "suggestions": ["Practice the STAR method", "Prepare more concrete examples"]
        }
    
    def _get_fallback_feedback(self) -> Dict[str, Any]:
        """Return fallback feedback when API fails"""
        return {
            "summary": "You demonstrated good communication skills and provided relevant examples.",
            "strengths": ["Clear speaking", "Professional demeanor"],
            "improvements": ["Add more specific details", "Practice storytelling"],
            "action_items": ["Practice common questions", "Prepare STAR format examples"],
            "motivation": "Keep practicing and you'll continue to improve!"
        }