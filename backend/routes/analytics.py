from collections import Counter
from datetime import datetime

from flask import Blueprint, jsonify

from utils.alert_store import read_alerts

analytics_bp = Blueprint("analytics", __name__)


def get_action(item):
    # Backward compatibility with old DeepFace alert records.
    return str(
        item.get("action")
        or item.get("emotion")
        or "Unknown"
    )


@analytics_bp.route("/summary")
def summary():
    logs = read_alerts()
    today = datetime.now().strftime("%Y-%m-%d")

    today_logs = [
        item
        for item in logs
        if str(item.get("time", "")).startswith(today)
    ]

    if not today_logs:
        return jsonify({
            "people_today": 0,
            "high_alerts": 0,
            "average_people": 0,
            "dominant_action": "No Data",
        })

    people_values = [
        int(item.get("people", 0))
        for item in today_logs
    ]

    total_people = sum(people_values)

    high_alerts = sum(
        1
        for item in today_logs
        if item.get("risk") == "Danger"
    )

    average_people = round(
        total_people / len(today_logs),
        2,
    )

    actions = [
        get_action(item)
        for item in today_logs
    ]

    dominant_action = Counter(
        actions
    ).most_common(1)[0][0]

    return jsonify({
        "people_today": total_people,
        "high_alerts": high_alerts,
        "average_people": average_people,
        "dominant_action": dominant_action,
    })
