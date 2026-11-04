from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token
from werkzeug.security import check_password_hash

from models.user import User


auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True) or {}

    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    if not username or not password:
        return jsonify({
            "message": "Username and password are required."
        }), 400

    admin = User.query.filter_by(
        username=username,
        role="admin",
    ).first()

    if admin is None:
        return jsonify({
            "message": "Invalid administrator username or password."
        }), 401

    password_is_correct = check_password_hash(
        admin.password_hash,
        password,
    )

    if not password_is_correct:
        return jsonify({
            "message": "Invalid administrator username or password."
        }), 401

    access_token = create_access_token(
        identity=str(admin.id),
        additional_claims={
            "username": admin.username,
            "role": admin.role,
        },
    )

    return jsonify({
        "message": "Administrator login successful.",
        "token": access_token,
        "role": admin.role,
        "username": admin.username,
    }), 200