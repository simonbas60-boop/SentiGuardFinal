from models import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(
        db.Integer,
        primary_key=True,
    )

    username = db.Column(
        db.String(100),
        unique=True,
        nullable=False,
        index=True,
    )

    password_hash = db.Column(
        db.String(255),
        nullable=False,
    )

    role = db.Column(
        db.String(30),
        nullable=False,
        default="admin",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role,
        }