from models import db


class Settings(db.Model):
    __tablename__ = "settings"

    id = db.Column(db.Integer, primary_key=True)

    crowd_limit = db.Column(
        db.Integer,
        nullable=False,
        default=2
    )

    snapshot_interval = db.Column(
        db.Integer,
        nullable=False,
        default=10
    )

    alarm_enabled = db.Column(
        db.Boolean,
        nullable=False,
        default=True
    )