from flask import Blueprint, jsonify

from utils.alert_store import read_alerts

timeline_bp = Blueprint("timeline", __name__)


@timeline_bp.route("/", strict_slashes=False)
def timeline():
    logs = read_alerts()

    timeline_data = [
        {
            "time": str(item.get("time", ""))[-8:],
            "risk": item.get("risk", "Unknown"),
            "action": (
                item.get("action")
                or item.get("emotion")
                or "Unknown"
            ),
            "people": int(item.get("people", 0)),
        }
        for item in reversed(logs[-10:])
    ]

    return jsonify(timeline_data)
