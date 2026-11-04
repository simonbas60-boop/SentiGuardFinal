import os
import time
from datetime import datetime
from threading import RLock

import cv2
from flask import Blueprint, Response, jsonify, request

from ai.crowd_density_engine import CrowdDensityEngine
from ai.vision_engine import vision_engine
from global_settings import camera_settings
from routes.dashboard import dashboard_data, update_history
from utils.alert_logger import save_alert
from utils.alert_store import SNAPSHOT_DIR, ensure_storage

camera_bp = Blueprint("camera", __name__)

CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480
CAMERA_FPS = 15
LIVE_TARGET_FPS = 12
JPEG_QUALITY = 72
ALLOWED_MODES = {"behavior", "density", "head-count"}

_camera = None
_camera_enabled = False
_camera_mode = "behavior"
_camera_lock = RLock()
_state_lock = RLock()

last_snapshot_time = 0.0
current_action = "No Person"
live_density_engine = CrowdDensityEngine()


def is_camera_enabled():
    with _state_lock:
        return _camera_enabled


def set_camera_enabled(enabled):
    global _camera_enabled
    with _state_lock:
        _camera_enabled = bool(enabled)


def get_camera_mode():
    with _state_lock:
        return _camera_mode


def set_camera_mode(mode):
    global _camera_mode, current_action, last_snapshot_time, live_density_engine

    normalized = str(mode or "behavior").strip().lower()
    if normalized not in ALLOWED_MODES:
        raise ValueError("Unsupported live analysis mode")

    with _state_lock:
        _camera_mode = normalized

    vision_engine.reset_tracker("live")
    current_action = "No Person"
    last_snapshot_time = 0.0
    live_density_engine = CrowdDensityEngine()
    return normalized


def get_camera():
    global _camera
    with _camera_lock:
        if _camera is None or not _camera.isOpened():
            if os.name == "nt":
                camera = cv2.VideoCapture(0, cv2.CAP_DSHOW)
                if not camera.isOpened():
                    camera.release()
                    camera = cv2.VideoCapture(0)
            else:
                camera = cv2.VideoCapture(0)

            camera.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
            camera.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
            camera.set(cv2.CAP_PROP_FPS, CAMERA_FPS)
            camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            if not camera.isOpened():
                camera.release()
                return None
            _camera = camera
        return _camera


def release_camera():
    global _camera
    with _camera_lock:
        if _camera is not None:
            try:
                _camera.release()
            except Exception as error:
                print("Camera release error:", error)
            finally:
                _camera = None


def reset_live_dashboard():
    dashboard_data.update({
        "people": 0,
        "action": "No Person",
        "density": "Low",
        "density_score": 0,
        "congestion": "Normal",
        "hot_zones": 0,
        "risk": "Safe",
        "alert": "Camera Off",
        "source": "Live Camera",
        "camera_active": False,
        "analysis_mode": get_camera_mode(),
        "crowd_limit": max(int(camera_settings.get("crowd_limit", 1)), 1),
    })


def stop_camera_monitoring():
    global last_snapshot_time, current_action, live_density_engine
    set_camera_enabled(False)
    release_camera()
    vision_engine.reset_tracker("live")
    last_snapshot_time = 0.0
    current_action = "No Person"
    live_density_engine = CrowdDensityEngine()
    reset_live_dashboard()


def save_snapshot(frame, prefix="alert"):
    ensure_storage()
    filename = datetime.now().strftime(prefix + "_%Y_%m_%d_%H_%M_%S_%f.jpg")
    absolute_path = SNAPSHOT_DIR / filename
    if not cv2.imwrite(str(absolute_path), frame):
        raise OSError("Could not save snapshot: {}".format(absolute_path))
    return "snapshots/{}".format(filename)


def calculate_head_count_status(people_count):
    crowd_limit = max(int(camera_settings.get("crowd_limit", 1)), 1)
    limit_reached = people_count >= crowd_limit
    density = "High" if limit_reached else "Low"
    risk = "Danger" if limit_reached else "Safe"
    alert = "Head Count Limit Reached" if limit_reached else "Normal"
    return density, risk, alert, limit_reached, crowd_limit


def _snapshot_interval():
    return max(int(camera_settings.get("snapshot_interval", 10)), 1)


def _save_live_alert_if_due(frame, alert, people, action, risk, source, active):
    global last_snapshot_time
    if not active or time.time() - last_snapshot_time < _snapshot_interval():
        return
    try:
        image_path = save_snapshot(frame, prefix="live")
        save_alert(alert, people, action, risk, image_path, source=source)
        last_snapshot_time = time.time()
    except Exception as error:
        print("Live camera alert save error:", error)


def _add_head_count_header(annotated, people_count, crowd_limit, risk):
    cv2.rectangle(annotated, (0, 0), (annotated.shape[1], 94), (7, 17, 31), -1)
    cv2.putText(annotated, "HEAD COUNT: {}".format(people_count), (18, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.74, (34, 211, 238), 2)
    cv2.putText(annotated, "Crowd Limit: {} | Risk: {}".format(crowd_limit, risk), (18, 72), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (0, 0, 255) if risk == "Danger" else (34, 197, 94), 2)


def _add_behavior_header(annotated, people_count, action, risk):
    cv2.rectangle(annotated, (0, 0), (annotated.shape[1], 104), (7, 17, 31), -1)
    cv2.putText(annotated, "BEHAVIOR ANALYSIS", (18, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (34, 211, 238), 2)
    cv2.putText(annotated, "Action: {} | Tracked: {}".format(action, people_count), (18, 64), cv2.FONT_HERSHEY_SIMPLEX, 0.56, (255, 255, 255), 2)
    cv2.putText(annotated, "Behavior Risk: {} (count limit ignored)".format(risk), (18, 94), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (0, 165, 255) if risk == "Warning" else (34, 197, 94), 1)


def generate_frames():
    global current_action
    target_period = 1.0 / LIVE_TARGET_FPS

    try:
        while is_camera_enabled():
            loop_started = time.perf_counter()
            with _camera_lock:
                camera = _camera
                if camera is None or not camera.isOpened():
                    break
                success, frame = camera.read()

            if not success or not is_camera_enabled():
                break

            mode = get_camera_mode()
            people_count = 0
            density = "Low"
            density_score = 0.0
            congestion = "Normal"
            hot_zones = 0
            risk = "Safe"
            alert = "Normal"
            crowd_limit = max(int(camera_settings.get("crowd_limit", 1)), 1)

            if mode == "density":
                result = live_density_engine.analyze(frame)
                annotated = result["frame"]
                density = result["density_level"]
                density_score = float(result["density_score"])
                congestion = result["congestion_status"]
                hot_zones = int(result["hot_zones"])
                current_action = "Visual Density"
                if density == "Critical":
                    risk = "Danger"
                    alert = "Critical Visual Crowd Density"
                elif density == "High":
                    risk = "Warning"
                    alert = "High Visual Crowd Density"
                _save_live_alert_if_due(annotated, alert, 0, "Density {}%".format(round(density_score, 1)), risk, "Live Camera · Crowd Density", risk in {"Warning", "Danger"})

            elif mode == "head-count":
                people_count, annotated, _boxes = vision_engine.detect_people_count(frame, dense_mode=False, draw=True)
                current_action = "Count Only"
                density, risk, alert, crowd_limit_reached, crowd_limit = calculate_head_count_status(people_count)
                _add_head_count_header(annotated, people_count, crowd_limit, risk)
                _save_live_alert_if_due(annotated, alert, people_count, current_action, risk, "Live Camera · Head Count", crowd_limit_reached)

            else:
                people_count, current_action, annotated, action_counts = vision_engine.detect_people_and_action(frame, tracker_id="live", draw=True, timestamp=time.perf_counter())
                running_count = int(action_counts.get("Running", 0))
                if running_count > 0:
                    risk = "Warning"
                    alert = "Running Behavior Detected"
                density = "Behavior Only"
                _add_behavior_header(annotated, people_count, current_action, risk)
                _save_live_alert_if_due(annotated, alert, people_count, current_action, risk, "Live Camera · Behavior Analysis", running_count > 0)

            dashboard_data.update({
                "people": people_count,
                "action": current_action,
                "density": density,
                "density_score": round(density_score, 1),
                "congestion": congestion,
                "hot_zones": hot_zones,
                "risk": risk,
                "alert": alert,
                "source": "Live Camera",
                "camera_active": True,
                "analysis_mode": mode,
                "crowd_limit": crowd_limit,
            })
            if mode in {"behavior", "head-count"}:
                update_history(people_count)

            encoded, buffer = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
            if encoded:
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"

            remaining = target_period - (time.perf_counter() - loop_started)
            if remaining > 0:
                time.sleep(remaining)

    except GeneratorExit:
        print("Live camera stream disconnected")
    except Exception as error:
        print("Live camera stream error:", error)


@camera_bp.route("/start", methods=["POST"])
def start_camera():
    data = request.get_json(silent=True) or {}
    try:
        requested_mode = set_camera_mode(data.get("mode", get_camera_mode()))
    except ValueError:
        return jsonify({"message": "Choose behavior, density or head-count mode."}), 400

    if is_camera_enabled():
        return jsonify({"message": "Camera monitoring is already running", "active": True, "mode": requested_mode})

    camera = get_camera()
    if camera is None or not camera.isOpened():
        set_camera_enabled(False)
        return jsonify({"message": "No live camera is available", "active": False, "mode": requested_mode}), 503

    set_camera_enabled(True)
    dashboard_data.update({
        "people": 0, "action": "No Person", "density": "Low", "density_score": 0,
        "congestion": "Normal", "hot_zones": 0, "risk": "Safe", "alert": "Normal",
        "camera_active": True, "source": "Live Camera", "analysis_mode": requested_mode,
        "crowd_limit": max(int(camera_settings.get("crowd_limit", 1)), 1),
    })
    return jsonify({"message": "Camera monitoring started", "active": True, "mode": requested_mode})


@camera_bp.route("/mode", methods=["POST"])
def change_camera_mode():
    data = request.get_json(silent=True) or {}
    try:
        mode = set_camera_mode(data.get("mode"))
    except ValueError:
        return jsonify({"message": "Choose behavior, density or head-count mode."}), 400

    dashboard_data.update({
        "people": 0, "action": "No Person", "density": "Low" if mode != "behavior" else "Behavior Only",
        "density_score": 0, "congestion": "Normal", "hot_zones": 0, "risk": "Safe", "alert": "Mode changed",
        "analysis_mode": mode, "crowd_limit": max(int(camera_settings.get("crowd_limit", 1)), 1),
    })
    return jsonify({"message": "Live analysis mode changed", "active": is_camera_enabled(), "mode": mode})


@camera_bp.route("/stop", methods=["POST"])
def stop_camera():
    stop_camera_monitoring()
    return jsonify({"message": "Camera monitoring stopped", "active": False, "mode": get_camera_mode()})


@camera_bp.route("/video")
def video():
    if not is_camera_enabled():
        return jsonify({"message": "Camera is off. Start monitoring first."}), 409
    with _camera_lock:
        camera_ready = bool(_camera is not None and _camera.isOpened())
    if not camera_ready:
        stop_camera_monitoring()
        return jsonify({"message": "No live camera is available"}), 503
    return Response(generate_frames(), mimetype="multipart/x-mixed-replace; boundary=frame")


@camera_bp.route("/status")
def camera_status():
    with _camera_lock:
        connected = bool(_camera is not None and _camera.isOpened())
    return jsonify({
        "active": is_camera_enabled(), "connected": connected, "source": "Default Camera (0)",
        "mode": get_camera_mode(), "crowd_limit": max(int(camera_settings.get("crowd_limit", 1)), 1),
    })
