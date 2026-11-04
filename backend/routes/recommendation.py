from flask import Blueprint, jsonify
from routes.dashboard import dashboard_data

recommendation_bp = Blueprint("recommendation", __name__)


@recommendation_bp.route("/")
def recommendation():

    risk = dashboard_data["risk"]

    if risk == "Safe":

        tips = [
            "Normal monitoring is sufficient.",
            "Keep camera active.",
            "No action required."
        ]

    elif risk == "Warning":

        tips = [
            "Monitor crowd carefully.",
            "Prepare nearby security staff.",
            "Watch entry and exit points."
        ]

    else:

        tips = [
            "Open emergency exit if needed.",
            "Deploy additional security officers.",
            "Broadcast crowd safety announcement.",
            "Continue live monitoring."
        ]

    return jsonify({
        "risk": risk,
        "recommendations": tips
    })