"""
Database models for the SER service.
Uses Flask-SQLAlchemy with PostgreSQL.
"""
import os
import uuid
from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def init_db(app):
    """Initialize database with the Flask app."""
    database_url = os.environ.get("DATABASE_URL", "")
    # Render provides DATABASE_URL with postgres:// but SQLAlchemy needs postgresql://
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)

    if not database_url:
        print("[SER] No DATABASE_URL set — database features disabled", flush=True)
        return False

    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    db.init_app(app)
    with app.app_context():
        db.create_all()
    print("[SER] Database initialized", flush=True)
    return True


def gen_uuid():
    return str(uuid.uuid4())


class Session(db.Model):
    __tablename__ = "sessions"

    id = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    client_name = db.Column(db.String(255), nullable=True)
    session_date = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    duration_seconds = db.Column(db.Float, nullable=True)
    status = db.Column(db.String(20), default="recording")  # recording, analyzing, completed, error
    avg_arousal = db.Column(db.Float, nullable=True)
    avg_valence = db.Column(db.Float, nullable=True)
    avg_dominance = db.Column(db.Float, nullable=True)
    emotional_summary = db.Column(db.Text, nullable=True)
    clinical_observations = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    readings = db.relationship("EmotionReading", backref="session", lazy=True,
                               order_by="EmotionReading.offset_seconds")
    report = db.relationship("ConversationReport", backref="session", uselist=False, lazy=True)

    def to_dict(self, include_readings=False):
        d = {
            "id": self.id,
            "client_name": self.client_name,
            "session_date": self.session_date.isoformat() if self.session_date else None,
            "duration_seconds": self.duration_seconds,
            "status": self.status,
            "avg_arousal": self.avg_arousal,
            "avg_valence": self.avg_valence,
            "avg_dominance": self.avg_dominance,
            "emotional_summary": self.emotional_summary,
            "clinical_observations": self.clinical_observations,
            "reading_count": len(self.readings) if self.readings else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_readings:
            d["readings"] = [r.to_dict() for r in self.readings]
        if self.report:
            d["report"] = self.report.to_dict()
        return d


class EmotionReading(db.Model):
    __tablename__ = "emotion_readings"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    session_id = db.Column(db.String(36), db.ForeignKey("sessions.id"), nullable=False, index=True)
    offset_seconds = db.Column(db.Float, nullable=False)
    arousal = db.Column(db.Float, nullable=False)
    valence = db.Column(db.Float, nullable=False)
    dominance = db.Column(db.Float, nullable=False)
    confidence = db.Column(db.Float, default=0.5)
    emotion_label = db.Column(db.String(50), nullable=True)
    feedback = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "offset_seconds": self.offset_seconds,
            "arousal": self.arousal,
            "valence": self.valence,
            "dominance": self.dominance,
            "confidence": self.confidence,
            "emotion_label": self.emotion_label,
            "feedback": self.feedback,
        }


class ConversationReport(db.Model):
    __tablename__ = "conversation_reports"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    session_id = db.Column(db.String(36), db.ForeignKey("sessions.id"), nullable=False, unique=True)
    emotional_trajectory = db.Column(db.Text, nullable=True)
    key_moments = db.Column(db.JSON, nullable=True)
    clinical_observations = db.Column(db.Text, nullable=True)
    risk_indicators = db.Column(db.Text, nullable=True)
    recommendations = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "emotional_trajectory": self.emotional_trajectory,
            "key_moments": self.key_moments,
            "clinical_observations": self.clinical_observations,
            "risk_indicators": self.risk_indicators,
            "recommendations": self.recommendations,
        }
