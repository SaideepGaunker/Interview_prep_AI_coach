"""
CRUD operations for Question model
"""
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func

from app.db.models import Question
from app.schemas.question import QuestionCreate


def create_question(db: Session, question: QuestionCreate) -> Question:
    """Create new question"""
    db_question = Question(
        content=question.content,
        question_type=question.question_type,
        role_category=question.role_category,
        difficulty_level=question.difficulty_level,
        expected_duration=question.expected_duration,
        generated_by=question.generated_by
    )
    db.add(db_question)
    db.commit()
    db.refresh(db_question)
    return db_question


def get_question(db: Session, question_id: int) -> Optional[Question]:
    """Get question by ID"""
    return db.query(Question).filter(Question.id == question_id).first()


def get_questions_filtered(
    db: Session,
    role_category: Optional[str] = None,
    question_type: Optional[str] = None,
    difficulty_level: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
) -> List[Question]:
    """Get questions with filtering"""
    query = db.query(Question)
    
    if role_category:
        query = query.filter(Question.role_category == role_category)
    if question_type:
        query = query.filter(Question.question_type == question_type)
    if difficulty_level:
        query = query.filter(Question.difficulty_level == difficulty_level)
    
    return query.offset(offset).limit(limit).all()


def search_questions_by_content(db: Session, search_query: str, limit: int = 20) -> List[Question]:
    """Search questions by content"""
    return db.query(Question).filter(
        Question.content.ilike(f"%{search_query}%")
    ).limit(limit).all()


def update_question(db: Session, question_id: int, update_data: Dict[str, Any]) -> Optional[Question]:
    """Update question"""
    question = get_question(db, question_id)
    if not question:
        return None
    
    for field, value in update_data.items():
        if hasattr(question, field):
            setattr(question, field, value)
    
    db.commit()
    db.refresh(question)
    return question


def delete_question(db: Session, question_id: int) -> bool:
    """Delete question"""
    question = get_question(db, question_id)
    if not question:
        return False
    
    db.delete(question)
    db.commit()
    return True


def get_questions_by_role(db: Session, role_category: str, limit: int = 10) -> List[Question]:
    """Get questions for specific role"""
    return db.query(Question).filter(
        Question.role_category == role_category
    ).limit(limit).all()


def get_random_questions(
    db: Session,
    role_category: Optional[str] = None,
    question_type: Optional[str] = None,
    difficulty_level: Optional[str] = None,
    count: int = 5
) -> List[Question]:
    """Get random questions with filters"""
    query = db.query(Question)
    
    if role_category:
        query = query.filter(Question.role_category == role_category)
    if question_type:
        query = query.filter(Question.question_type == question_type)
    if difficulty_level:
        query = query.filter(Question.difficulty_level == difficulty_level)
    
    return query.order_by(func.random()).limit(count).all()


def get_question_statistics(db: Session) -> Dict[str, Any]:
    """Get question database statistics"""
    total = db.query(Question).count()
    
    # Group by categories
    role_stats = db.query(
        Question.role_category,
        func.count(Question.id).label('count')
    ).group_by(Question.role_category).all()
    
    type_stats = db.query(
        Question.question_type,
        func.count(Question.id).label('count')
    ).group_by(Question.question_type).all()
    
    difficulty_stats = db.query(
        Question.difficulty_level,
        func.count(Question.id).label('count')
    ).group_by(Question.difficulty_level).all()
    
    return {
        "total": total,
        "by_role": dict(role_stats),
        "by_type": dict(type_stats),
        "by_difficulty": dict(difficulty_stats)
    }