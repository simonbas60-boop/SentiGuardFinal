from flask import Blueprint, jsonify

dashboard_bp = Blueprint("dashboard", __name__)

dashboard_data = {
    "people": 0,
    "density": "Low",
    "density_score": 0,
    "congestion": "Normal",
    "hot_zones": 0,
    "risk": "Safe",
    "action": "No Person",
    "history": [],
    "alert": "Normal",
    "source": "Live Camera",
    "camera_active": False,
    "analysis_mode": "behavior",
    "crowd_limit": 1,
}

MAX_HISTORY = 20


def update_history(people):
    dashboard_data["history"].append(int(people))

    if len(dashboard_data["history"]) > MAX_HISTORY:
        dashboard_data["history"].pop(0)


@dashboard_bp.route("/stats")
def stats():
    return jsonify(dashboard_data)
