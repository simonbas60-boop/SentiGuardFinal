from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename

from utils.alert_store import (
    SNAPSHOT_DIR,
    delete_alerts_by_image,
    ensure_storage,
)

snapshots_bp = Blueprint("snapshots", __name__)


@snapshots_bp.route("/", strict_slashes=False)
def get_snapshots():
    ensure_storage()

    files = []
    for image_path in sorted(
        SNAPSHOT_DIR.iterdir(),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    ):
        if image_path.is_file() and image_path.suffix.lower() in {
            ".jpg", ".jpeg", ".png"
        }:
            files.append({
                "name": image_path.name,
                "url": request.host_url.rstrip("/")
                + f"/snapshots/{image_path.name}",
            })

    return jsonify(files)


@snapshots_bp.route("/<filename>", methods=["DELETE"] )
def delete_snapshot(filename):
    safe_filename = secure_filename(filename)

    if not safe_filename or safe_filename != filename:
        return jsonify({"message": "Invalid snapshot filename"}), 400

    file_path = SNAPSHOT_DIR / safe_filename

    if not file_path.is_file():
        return jsonify({"message": "Image not found"}), 404

    file_path.unlink()
    delete_alerts_by_image(safe_filename)

    return jsonify({"message": "Snapshot deleted successfully"})
