"""
Question Service - Business logic for question management
"""
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from app.db.models import Question
from app.schemas.question import QuestionCreate, QuestionSearch
from app.services.gemini_service import GeminiService
from app.crud.question import (
    create_question, get_question, get_questions_filtered,
    update_question, delete_question, search_questions_by_content
)


class QuestionService:
    """Service for question management and generation"""
    
    def __init__(self, db: Session):
        self.db = db
        self.gemini_service = GeminiService(db)
    
    def generate_and_store_questions(
        self,
        role: str,
        difficulty: str = "intermediate",
        question_type: str = "mixed",
        count: int = 5
    ) -> List[Question]:
        """Generate questions using Gemini API and store them"""
        
        # Generate questions using Gemini
        generated_questions = self.gemini_service.generate_questions(
            role=role,
            difficulty=difficulty,
            question_type=question_type,
            count=count
        )
        
        # Convert to database objects
        stored_questions = []
        for q_data in generated_questions:
            question_create = QuestionCreate(
                content=q_data['question'],
                question_type=q_data['category'],
                role_category=role,
                difficulty_level=difficulty,
                expected_duration=q_data['duration'],
                generated_by='gemini_api'
            )
            
            question = create_question(self.db, question_create)
            stored_questions.append(question)
        
        return stored_questions
    
    def get_questions(self, search_params: QuestionSearch) -> List[Question]:
        """Get questions with filtering"""
        return get_questions_filtered(
            self.db,
            role_category=search_params.role_category,
            question_type=search_params.question_type,
            difficulty_level=search_params.difficulty_level,
            limit=search_params.limit,
            offset=search_params.offset
        )
    
    def get_question_by_id(self, question_id: int) -> Optional[Question]:
        """Get question by ID"""
        return get_question(self.db, question_id)
    
    def get_random_questions(
        self,
        role_category: Optional[str] = None,
        question_type: Optional[str] = None,
        difficulty_level: Optional[str] = None,
        count: int = 5
    ) -> List[Question]:
        """Get random questions for practice"""
        query = self.db.query(Question)
        
        # Apply filters
        if role_category:
            query = query.filter(Question.role_category == role_category)
        if question_type:
            query = query.filter(Question.question_type == question_type)
        if difficulty_level:
            query = query.filter(Question.difficulty_level == difficulty_level)
        
        # Get random questions (handle MySQL vs others)
        dialect_name = getattr(getattr(self.db, 'bind', None), 'dialect', None)
        dialect_name = getattr(dialect_name, 'name', '').lower() if dialect_name else ''
        random_func = func.rand() if dialect_name == 'mysql' else func.random()
        questions = query.order_by(random_func).limit(count).all()
        
        # If not enough questions found, generate new ones
        if len(questions) < count and role_category:
            needed = count - len(questions)
            new_questions = self.generate_and_store_questions(
                role=role_category,
                difficulty=difficulty_level or "intermediate",
                question_type=question_type or "mixed",
                count=needed
            )
            questions.extend(new_questions)
        
        return questions[:count]
    
    def search_questions(self, query: str, limit: int = 20) -> List[Question]:
        """Search questions by content"""
        return search_questions_by_content(self.db, query, limit)
    
    def create_question(self, question_data: QuestionCreate) -> Question:
        """Create new question"""
        return create_question(self.db, question_data)
    
    def update_question(self, question_id: int, update_data: Dict[str, Any]) -> Optional[Question]:
        """Update question"""
        return update_question(self.db, question_id, update_data)
    
    def delete_question(self, question_id: int) -> bool:
        """Delete question"""
        return delete_question(self.db, question_id)
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get question database statistics"""
        total_questions = self.db.query(Question).count()
        
        # Count by role category
        role_stats = self.db.query(
            Question.role_category,
            func.count(Question.id).label('count')
        ).group_by(Question.role_category).all()
        
        # Count by question type
        type_stats = self.db.query(
            Question.question_type,
            func.count(Question.id).label('count')
        ).group_by(Question.question_type).all()
        
        # Count by difficulty
        difficulty_stats = self.db.query(
            Question.difficulty_level,
            func.count(Question.id).label('count')
        ).group_by(Question.difficulty_level).all()
        
        return {
            "total_questions": total_questions,
            "by_role": {role: count for role, count in role_stats},
            "by_type": {qtype: count for qtype, count in type_stats},
            "by_difficulty": {diff: count for diff, count in difficulty_stats}
        }
    
    def get_available_roles(self) -> List[str]:
        """Get available role categories"""
        roles = self.db.query(Question.role_category).distinct().all()
        return [role[0] for role in roles if role[0]]
    
    def get_questions_for_session(
        self,
        role: str,
        difficulty: str,
        session_type: str,
        count: int = 5
    ) -> List[Question]:
        """Get questions optimized for interview session"""
        
        # Determine question types based on session type
        if session_type == "hr":
            question_types = ["behavioral", "situational"]
        elif session_type == "technical":
            question_types = ["technical"]
        else:  # mixed
            question_types = ["behavioral", "technical", "situational"]
        
        questions = []
        questions_per_type = max(1, count // len(question_types))
        
        for qtype in question_types:
            type_questions = self.get_random_questions(
                role_category=role,
                question_type=qtype,
                difficulty_level=difficulty,
                count=questions_per_type
            )
            questions.extend(type_questions)
        
        # If we need more questions, get random ones
        if len(questions) < count:
            additional = self.get_random_questions(
                role_category=role,
                difficulty_level=difficulty,
                count=count - len(questions)
            )
            questions.extend(additional)
        
        return questions[:count]