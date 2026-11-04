from . import db
from datetime import datetime


class Alert(db.Model):
    __tablename__ = "alerts"

    id = db.Column(db.Integer, primary_key=True)

    time = db.Column(
        db.DateTime,
        default=datetime.utcnow
    )

    alert = db.Column(
        db.String(100),
        nullable=False
    )

    people = db.Column(
        db.Integer,
        nullable=False
    )

    emotion = db.Column(
        db.String(50)
    )

    risk = db.Column(
        db.String(50)
    )

    image = db.Column(
        db.String(255)
    )

    is_read = db.Column(
        db.Boolean,
        default=False
    )