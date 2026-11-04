"""Recorded CCTV head-count analysis, deliberately separated from behavior analysis."""
from __future__ import annotations

import time
import uuid
from datetime import datetime
from pathlib import Path
from threading import RLock

import cv2
from flask import Blueprint, Response, jsonify, request
from werkzeug.utils import secure_filename

from ai.vision_engine import vision_engine
from global_settings import camera_settings
from utils.alert_logger import save_alert
from utils.alert_store import BACKEND_DIR, SNAPSHOT_DIR, ensure_storage

head_count_bp = Blueprint("head_count", __name__)
UPLOAD_DIR = BACKEND_DIR / "uploads" / "head_count"
ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".m4v", ".webm"}
JPEG_QUALITY = 74
_sessions = {}
_sessions_lock = RLock()


def ensure_upload_directory():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ensure_storage()


def public_session(session):
    hidden = {"file_path", "stop_requested", "active_stream"}
    return {key: value for key, value in session.items() if key not in hidden}


def get_session(session_id):
    with _sessions_lock:
        return _sessions.get(session_id)


def update_session(session_id, **values):
    with _sessions_lock:
        if session_id in _sessions:
            _sessions[session_id].update(values)


def save_head_count_snapshot(frame, session_id):
    ensure_storage()
    filename = datetime.now().strftime("head_count_{}_%Y_%m_%d_%H_%M_%S_%f.jpg".format(session_id[:8]))
    path = SNAPSHOT_DIR / filename
    if not cv2.imwrite(str(path), frame):
        raise OSError("Could not save head-count snapshot")
    return "snapshots/{}".format(filename)


def count_status(people):
    crowd_limit = max(int(camera_settings.get("crowd_limit", 1)), 1)
    reached = int(people) >= crowd_limit
    return {
        "crowd_limit": crowd_limit,
        "limit_reached": reached,
        "risk": "Danger" if reached else "Safe",
        "alert": "Head Count Limit Reached" if reached else "Normal",
    }


def draw_status_header(frame, people, status):
    cv2.rectangle(frame, (0, 0), (frame.shape[1], 104), (7, 17, 31), -1)
    cv2.putText(frame, "HEAD COUNT DETECTION", (18, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.63, (34, 211, 238), 2)
    cv2.putText(frame, "People: {} | Crowd Limit: {}".format(people, status["crowd_limit"]), (18, 66), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (255, 255, 255), 2)
    cv2.putText(frame, "Risk: {}".format(status["risk"]), (18, 96), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255) if status["risk"] == "Danger" else (34, 197, 94), 2)
    return frame


def generate_head_count_stream(session_id):
    session = get_session(session_id)
    if not session:
        return

    capture = cv2.VideoCapture(session["file_path"])
    if not capture.isOpened():
        update_session(session_id, status="failed", message="The uploaded video could not be opened.", active_stream=False)
        return

    fps = float(capture.get(cv2.CAP_PROP_FPS) or session.get("fps") or 25)
    total_frames = max(int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or session.get("total_frames") or 0), 0)
    ai_stride = max(int(round(fps / 5.0)), 1)
    display_stride = max(int(round(fps / 15.0)), 1)

    frame_index = ai_frames = people_sum = current_people = max_people = 0
    last_boxes = []
    alert_count = alert_sequence = 0
    last_alert = "None"
    last_alert_saved = False
    last_snapshot_time = 0.0
    limit_event_active = False

    update_session(session_id, status="analyzing", message="Head-count analysis is running.", active_stream=True, stop_requested=False)

    try:
        while True:
            state = get_session(session_id)
            if not state or state.get("stop_requested"):
                update_session(session_id, status="stopped", message="Head-count analysis stopped.")
                break

            success, frame = capture.read()
            if not success:
                update_session(session_id, status="completed", message="Head-count analysis completed.", progress=100,
                               current_time=round(total_frames / fps, 1) if fps > 0 else 0,
                               average_people=round(people_sum / max(ai_frames, 1), 2), max_people=max_people)
                break

            frame_index += 1
            video_second = frame_index / fps if fps > 0 else 0

            if frame_index == 1 or frame_index % ai_stride == 0:
                current_people, _unused, last_boxes = vision_engine.detect_people_count(frame, dense_mode=True, draw=False)
                ai_frames += 1
                people_sum += current_people
                max_people = max(max_people, current_people)

            annotated = vision_engine.draw_people_boxes(frame, last_boxes)
            status = count_status(current_people)
            annotated = draw_status_header(annotated, current_people, status)

            if status["limit_reached"]:
                if not limit_event_active:
                    limit_event_active = True
                    alert_sequence += 1
                    last_alert = status["alert"]
                last_alert_saved = False
                snapshot_interval = max(int(camera_settings.get("snapshot_interval", 10)), 1)
                if time.time() - last_snapshot_time >= snapshot_interval:
                    try:
                        image_path = save_head_count_snapshot(annotated, session_id)
                        save_alert(status["alert"], current_people, "Head Count Only", status["risk"], image_path, source="Head Count Detection")
                        alert_count += 1
                        last_alert_saved = True
                        last_snapshot_time = time.time()
                    except Exception as error:
                        print("Head-count alert save error:", error)
            else:
                limit_event_active = False
                last_alert_saved = False

            progress = min(round((frame_index / total_frames) * 100, 1), 100) if total_frames > 0 else 0
            update_session(
                session_id,
                people=current_people,
                max_people=max_people,
                average_people=round(people_sum / max(ai_frames, 1), 2),
                crowd_limit=status["crowd_limit"],
                limit_reached=status["limit_reached"],
                risk=status["risk"],
                alert=status["alert"],
                progress=progress,
                processed_frames=frame_index,
                ai_frames=ai_frames,
                current_time=round(video_second, 1),
                alert_count=alert_count,
                alert_sequence=alert_sequence,
                last_alert=last_alert,
                last_alert_saved=last_alert_saved,
            )

            if frame_index % display_stride != 0:
                continue
            encoded, buffer = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
            if encoded:
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
            time.sleep(min(display_stride / max(fps, 1.0), 0.09))

    except GeneratorExit:
        update_session(session_id, message="Head-count stream disconnected.")
    except Exception as error:
        print("Head-count analysis error:", error)
        update_session(session_id, status="failed", message="Head-count analysis failed: {}".format(error))
    finally:
        capture.release()
        update_session(session_id, active_stream=False)


@head_count_bp.route("/upload", methods=["POST"])
def upload_head_count_video():
    ensure_upload_directory()
    uploaded_file = request.files.get("video")
    if uploaded_file is None or not uploaded_file.filename:
        return jsonify({"message": "Please choose a CCTV video file."}), 400

    original_name = secure_filename(uploaded_file.filename)
    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        return jsonify({"message": "Unsupported format. Use MP4, AVI, MOV, MKV, M4V or WEBM."}), 400

    session_id = uuid.uuid4().hex
    file_path = UPLOAD_DIR / "{}{}".format(session_id, extension)
    uploaded_file.save(file_path)

    capture = cv2.VideoCapture(str(file_path))
    if not capture.isOpened():
        file_path.unlink(missing_ok=True)
        return jsonify({"message": "The selected file is not a readable video."}), 400

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 25)
    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    duration = round(total_frames / fps, 1) if fps > 0 else 0
    capture.release()

    crowd_limit = max(int(camera_settings.get("crowd_limit", 1)), 1)
    session = {
        "id": session_id, "original_name": original_name, "file_path": str(file_path), "status": "ready",
        "message": "Video uploaded. Head-count analysis is ready.", "progress": 0, "processed_frames": 0,
        "ai_frames": 0, "total_frames": total_frames, "fps": round(fps, 2), "duration": duration,
        "width": width, "height": height, "current_time": 0, "people": 0, "max_people": 0,
        "average_people": 0, "crowd_limit": crowd_limit, "limit_reached": False, "risk": "Safe",
        "alert": "Normal", "alert_count": 0, "alert_sequence": 0, "last_alert": "None",
        "last_alert_saved": False, "created_at": datetime.now().isoformat(timespec="seconds"),
        "stop_requested": False, "active_stream": False,
    }
    with _sessions_lock:
        _sessions[session_id] = session
    return jsonify(public_session(session)), 201


@head_count_bp.route("/stream/<session_id>")
def head_count_stream(session_id):
    session = get_session(session_id)
    if not session:
        return jsonify({"message": "Head-count session was not found."}), 404
    if session.get("active_stream"):
        return jsonify({"message": "This head-count session is already streaming."}), 409
    return Response(generate_head_count_stream(session_id), mimetype="multipart/x-mixed-replace; boundary=frame")


@head_count_bp.route("/status/<session_id>")
def head_count_status(session_id):
    session = get_session(session_id)
    if not session:
        return jsonify({"message": "Head-count session was not found."}), 404
    update_session(session_id, crowd_limit=max(int(camera_settings.get("crowd_limit", 1)), 1))
    return jsonify(public_session(get_session(session_id)))


@head_count_bp.route("/stop/<session_id>", methods=["POST"])
def stop_head_count_analysis(session_id):
    if not get_session(session_id):
        return jsonify({"message": "Head-count session was not found."}), 404
    update_session(session_id, stop_requested=True, message="Stopping head-count analysis...")
    return jsonify({"message": "Head-count stop requested."})


@head_count_bp.route("/<session_id>", methods=["DELETE"])
def delete_head_count_session(session_id):
    with _sessions_lock:
        session = _sessions.pop(session_id, None)
    if not session:
        return jsonify({"message": "Head-count session was not found."}), 404
    try:
        Path(session["file_path"]).unlink(missing_ok=True)
    except OSError as error:
        print("Head-count upload cleanup error:", error)
    return jsonify({"message": "Head-count session deleted."})
