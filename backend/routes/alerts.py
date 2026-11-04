from flask import Blueprint, jsonify
from werkzeug.utils import secure_filename

from utils.alert_store import (
    SNAPSHOT_DIR,
    delete_alerts_by_image,
    read_alerts,
)

alerts_bp = Blueprint("alerts", __name__)


@alerts_bp.route("/", methods=["GET"], strict_slashes=False)
def get_alerts():
    alerts = read_alerts()
    return jsonify(list(reversed(alerts)))


@alerts_bp.route("/delete/<filename>", methods=["DELETE"] )
def delete_alert(filename):
    safe_filename = secure_filename(filename)

    if not safe_filename or safe_filename != filename:
        return jsonify({"message": "Invalid snapshot filename"}), 400

    deleted_count = delete_alerts_by_image(safe_filename)

    if deleted_count == 0:
        return jsonify({"message": "Alert not found"}), 404

    image_path = SNAPSHOT_DIR / safe_filename
    if image_path.is_file():
        image_path.unlink()

    return jsonify({"message": "Alert deleted successfully"})
