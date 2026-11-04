import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

class Config:
    SECRET_KEY = "sentiguard_secret_key"

    SQLALCHEMY_DATABASE_URI = (
        "postgresql://postgres:root@localhost:5432/sentiguard"
    )

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    JWT_SECRET_KEY = "jwt_secret_key"