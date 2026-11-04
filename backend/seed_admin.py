from werkzeug.security import generate_password_hash

from app import app
from models import db
from models.user import User


ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"


def create_admin():
    with app.app_context():
        db.create_all()

        admin = User.query.filter_by(
            username=ADMIN_USERNAME
        ).first()

        password_hash = generate_password_hash(
            ADMIN_PASSWORD
        )

        if admin is None:
            admin = User(
                username=ADMIN_USERNAME,
                password_hash=password_hash,
                role="admin",
            )

            db.session.add(admin)
            message = "Administrator account created."

        else:
            admin.password_hash = password_hash
            admin.role = "admin"
            message = "Administrator account updated."

        # Admin-only system:
        # delete accounts that are not administrators.
        User.query.filter(
            User.role != "admin"
        ).delete(synchronize_session=False)

        db.session.commit()

        print(message)
        print("Username:", ADMIN_USERNAME)
        print("Password:", ADMIN_PASSWORD)


if __name__ == "__main__":
    create_admin()