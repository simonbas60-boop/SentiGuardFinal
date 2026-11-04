from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from werkzeug.exceptions import RequestEntityTooLarge

from config import Config
from global_settings import camera_settings
from models import db
from models.settings import Settings
from models.user import User
from routes.alerts import alerts_bp
from routes.analytics import analytics_bp
from routes.auth import auth_bp
from routes.camera import camera_bp
from routes.dashboard import dashboard_bp
from routes.recommendation import recommendation_bp
from routes.report import report_bp 
from routes.settings import settings_bp
from routes.snapshots import snapshots_bp
from routes.timeline import timeline_bp
from routes.video_analysis import video_analysis_bp
from utils.alert_store import SNAPSHOT_DIR, ensure_storage
from routes.crowd_density import crowd_density_bp
from routes.head_count import head_count_bp
from routes.emergency_broadcast import emergency_bp

app = Flask(__name__)
app.config.from_object(Config)
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024

CORS(app)
db.init_app(app) 
JWTManager(app)

app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(camera_bp, url_prefix="/api/camera")
app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
app.register_blueprint(alerts_bp, url_prefix="/api/alerts")
app.register_blueprint(analytics_bp, url_prefix="/api/analytics")
app.register_blueprint(snapshots_bp, url_prefix="/api/snapshots")
app.register_blueprint(report_bp, url_prefix="/api/report")
app.register_blueprint(recommendation_bp, url_prefix="/api/recommendation")
app.register_blueprint(timeline_bp, url_prefix="/api/timeline")
app.register_blueprint(settings_bp, url_prefix="/api/settings")
app.register_blueprint(video_analysis_bp, url_prefix="/api/video-analysis")
app.register_blueprint(crowd_density_bp, url_prefix="/api/crowd-density")
app.register_blueprint(head_count_bp, url_prefix="/api/head-count")
app.register_blueprint(emergency_bp, url_prefix="/api/emergency")


@app.route("/")
def home():
    return {
        "message": "SentiGuard Backend Running",
        "status": "success",
    }


@app.route("/snapshots/<filename>")
def snapshot_file(filename):
    return send_from_directory(str(SNAPSHOT_DIR), filename)


@app.errorhandler(RequestEntityTooLarge)
def handle_large_file(_error):
    return jsonify({
        "message": "The video is too large. Maximum upload size is 500 MB."
    }), 413


with app.app_context():
    ensure_storage()
    db.create_all()

    settings = Settings.query.first()
    if settings:
        camera_settings.update({
            "crowd_limit": settings.crowd_limit,
            "snapshot_interval": settings.snapshot_interval,
            "alarm_enabled": settings.alarm_enabled,
        })
        print("Loaded Settings From Database:", camera_settings)
    else:
        print("No settings found in database")


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True,
        threaded=True,
    )
