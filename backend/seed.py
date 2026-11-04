import bcrypt

from app import app
from models import db
from models.user import User

with app.app_context():

    db.create_all()

    admin = User.query.filter_by(username="admin").first()

    if admin is None:

        hashed = bcrypt.hashpw(
            "admin123".encode(),
            bcrypt.gensalt()
        ).decode()

        admin = User(
            username="admin",
            password=hashed,
            role="admin"
        )

        db.session.add(admin)
        db.session.commit()

        print("✅ Admin account created!")
        print("Username : admin")
        print("Password : admin123")

    else:

        print("✅ Admin already exists.")