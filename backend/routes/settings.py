from flask import Blueprint, request, jsonify
from models import db
from models.settings import Settings
from global_settings import camera_settings

settings_bp = Blueprint("settings", __name__)


@settings_bp.route("/", methods=["GET"])
def get_settings():

    settings = Settings.query.first()

    if not settings:
        settings = Settings()
        db.session.add(settings)
        db.session.commit()
        camera_settings["crowd_limit"] = settings.crowd_limit
        camera_settings["snapshot_interval"] = settings.snapshot_interval
        camera_settings["alarm_enabled"] = settings.alarm_enabled
        print("Current Crowd Limit =", camera_settings["crowd_limit"])
        print("Updated Camera Settings:", camera_settings)


    return jsonify({
        "crowd_limit": settings.crowd_limit,
        "snapshot_interval": settings.snapshot_interval,
        "alarm_enabled": settings.alarm_enabled
    })


@settings_bp.route("/", methods=["PUT"])
def update_settings():

    print("PUT /api/settings called")

    settings = Settings.query.first()

    if not settings:
        settings = Settings()
        db.session.add(settings)

    data = request.json

    settings.crowd_limit = data["crowd_limit"]
    settings.snapshot_interval = data["snapshot_interval"]
    settings.alarm_enabled = data["alarm_enabled"]

    db.session.commit()

    
    camera_settings["crowd_limit"] = settings.crowd_limit
    camera_settings["snapshot_interval"] = settings.snapshot_interval
    camera_settings["alarm_enabled"] = settings.alarm_enabled

    print("Updated Camera Settings =", camera_settings)

    return jsonify({
        "message": "Settings updated successfully"
    })