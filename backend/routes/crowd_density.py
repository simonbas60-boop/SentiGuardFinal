"""Recorded-video Visual Crowd Density Analysis API.

This feature intentionally does not return an exact people count.
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime
from pathlib import Path
from threading import RLock

import cv2
from flask import Blueprint, Response, jsonify, request
from werkzeug.utils import secure_filename

from ai.crowd_density_engine import CrowdDensityEngine
from utils.alert_logger import save_alert
from utils.alert_store import BACKEND_DIR, SNAPSHOT_DIR, ensure_storage


crowd_density_bp = Blueprint(
    "crowd_density",
    __name__,
)

UPLOAD_DIR = (
    BACKEND_DIR
    / "uploads"
    / "crowd_density"
)

ALLOWED_EXTENSIONS = {
    ".mp4",
    ".avi",
    ".mov",
    ".mkv",
    ".m4v",
    ".webm",
}

ANALYSIS_TARGET_FPS = 8.0
DISPLAY_TARGET_FPS = 12.0
JPEG_QUALITY = 70
DENSITY_ALERT_COOLDOWN_SECONDS = 8.0

_sessions = {}
_sessions_lock = RLock()


def ensure_upload_directory():
    UPLOAD_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )


def public_session(session):
    return {
        key: value
        for key, value in session.items()
        if key not in {
            "file_path",
            "stop_requested",
            "active_stream",
        }
    }


def get_session(session_id):
    with _sessions_lock:
        return _sessions.get(
            session_id
        )


def update_session(
    session_id,
    **changes,
):
    with _sessions_lock:
        if session_id in _sessions:
            _sessions[
                session_id
            ].update(changes)



def density_risk_level(result):
    """Convert visual density/congestion into an operational risk label."""
    if result.get("calibrating"):
        return "Calibrating"

    level = str(
        result.get(
            "density_level",
            "Low",
        )
    )

    congestion_score = float(
        result.get(
            "congestion_score",
            0,
        )
    )

    if level == "Critical":
        return "Critical"

    if level == "High":
        return "High"

    # A strong jam/congestion signal can elevate a moderate-density scene.
    if (
        level == "Moderate"
        and congestion_score >= 78
    ):
        return "High"

    if level == "Moderate":
        return "Moderate"

    return "Low"


def save_density_snapshot(
    frame,
    session_id,
):
    """Save the evidence image used by Alerts and Snapshots pages."""
    ensure_storage()

    filename = datetime.now().strftime(
        "density_{}_%Y_%m_%d_%H_%M_%S_%f.jpg".format(
            session_id[:8]
        )
    )

    path = SNAPSHOT_DIR / filename

    if not cv2.imwrite(
        str(path),
        frame,
    ):
        raise OSError(
            "Could not save crowd-density snapshot: {}".format(
                path
            )
        )

    return "snapshots/{}".format(
        filename
    )


def generate_density_stream(
    session_id,
):
    session = get_session(
        session_id
    )

    if not session:
        return

    capture = cv2.VideoCapture(
        session["file_path"]
    )

    if not capture.isOpened():
        update_session(
            session_id,
            status="failed",
            message=(
                "The uploaded video "
                "could not be opened."
            ),
            active_stream=False,
        )
        return

    fps = float(
        capture.get(
            cv2.CAP_PROP_FPS
        )
        or session.get("fps")
        or 25
    )

    total_frames = int(
        capture.get(
            cv2.CAP_PROP_FRAME_COUNT
        )
        or 0
    )

    analysis_stride = max(
        int(
            round(
                fps
                / ANALYSIS_TARGET_FPS
            )
        ),
        1,
    )

    display_stride = max(
        int(
            round(
                fps
                / DISPLAY_TARGET_FPS
            )
        ),
        1,
    )

    engine = CrowdDensityEngine()

    frame_index = 0
    last_result = None
    last_frame = None
    last_emit_time = 0.0

    density_sum = 0.0
    analyzed_frames = 0
    max_density = 0.0
    max_congestion = 0.0

    last_density_alert_second = -10000.0
    last_alert_risk = ""
    alert_count = 0
    last_alert_text = "None"

    update_session(
        session_id,
        status="analyzing",
        message=(
            "Visual crowd density "
            "analysis is running."
        ),
        active_stream=True,
        stop_requested=False,
        started_at=datetime.now().isoformat(
            timespec="seconds"
        ),
    )

    try:
        while True:
            state = get_session(
                session_id
            )

            if (
                not state
                or state.get(
                    "stop_requested"
                )
            ):
                update_session(
                    session_id,
                    status="stopped",
                    message=(
                        "Density analysis "
                        "was stopped."
                    ),
                )
                break

            success, frame = (
                capture.read()
            )

            if not success:
                average_density = (
                    round(
                        density_sum
                        / max(
                            analyzed_frames,
                            1,
                        ),
                        1,
                    )
                )

                update_session(
                    session_id,
                    status="completed",
                    progress=100,
                    average_density=average_density,
                    max_density=round(
                        max_density,
                        1,
                    ),
                    max_congestion=round(
                        max_congestion,
                        1,
                    ),
                    message=(
                        "Crowd density analysis "
                        "completed successfully."
                    ),
                    completed_at=datetime.now().isoformat(
                        timespec="seconds"
                    ),
                )
                break

            frame_index += 1

            should_analyze = (
                frame_index == 1
                or frame_index
                % analysis_stride
                == 0
            )

            should_display = (
                frame_index == 1
                or frame_index
                % display_stride
                == 0
            )

            if (
                not should_analyze
                and not should_display
            ):
                continue

            if should_analyze:
                last_result = (
                    engine.analyze(
                        frame
                    )
                )

                last_result["risk_level"] = density_risk_level(
                    last_result
                )

                last_frame = (
                    last_result["frame"]
                )

                analyzed_frames += 1

                density_sum += float(
                    last_result[
                        "density_score"
                    ]
                )

                max_density = max(
                    max_density,
                    float(
                        last_result[
                            "density_score"
                        ]
                    ),
                )

                max_congestion = max(
                    max_congestion,
                    float(
                        last_result[
                            "congestion_score"
                        ]
                    ),
                )

            elif last_frame is not None:
                # Reuse the latest heatmap result between analysis frames.
                last_frame = last_frame

            if last_result is None:
                continue

            progress = (
                min(
                    round(
                        (
                            frame_index
                            / total_frames
                        )
                        * 100,
                        1,
                    ),
                    100,
                )
                if total_frames > 0
                else 0
            )

            average_density = round(
                density_sum
                / max(
                    analyzed_frames,
                    1,
                ),
                1,
            )

            video_second = (
                frame_index / fps
                if fps > 0
                else 0
            )

            current_risk = str(
                last_result.get(
                    "risk_level",
                    "Low",
                )
            )

            # High/Critical visual-density risk is recorded in the SAME alert
            # history used by the rest of SentiGuard.  This automatically makes
            # it available to the Alerts page and the navbar notification bell.
            if (
                should_analyze
                and not last_result.get(
                    "calibrating",
                    False,
                )
                and current_risk
                in {"High", "Critical"}
            ):
                risk_changed = (
                    current_risk
                    != last_alert_risk
                )

                cooldown_elapsed = (
                    video_second
                    - last_density_alert_second
                    >= DENSITY_ALERT_COOLDOWN_SECONDS
                )

                if (
                    risk_changed
                    or cooldown_elapsed
                ):
                    try:
                        image_path = (
                            save_density_snapshot(
                                last_result["frame"],
                                session_id,
                            )
                        )

                        density_score = float(
                            last_result.get(
                                "density_score",
                                0,
                            )
                        )

                        congestion_status = str(
                            last_result.get(
                                "congestion_status",
                                "Unknown",
                            )
                        )

                        alert_title = (
                            "Critical Crowd Density Detected"
                            if current_risk
                            == "Critical"
                            else "High Crowd Density Detected"
                        )

                        action_text = (
                            "Density {:.1f}% | {} | {}"
                            .format(
                                density_score,
                                last_result.get(
                                    "density_level",
                                    "Unknown",
                                ),
                                congestion_status,
                            )
                        )

                        save_alert(
                            alert_title,
                            0,
                            action_text,
                            current_risk,
                            image_path,
                            source=(
                                "Crowd Density Detection: "
                                + session[
                                    "original_name"
                                ]
                            ),
                        )

                        alert_count += 1
                        last_alert_text = (
                            alert_title
                        )
                        last_density_alert_second = (
                            video_second
                        )
                        last_alert_risk = (
                            current_risk
                        )

                        print(
                            "Crowd density alert saved:",
                            alert_title,
                            density_score,
                        )

                    except Exception as error:
                        print(
                            "Crowd density alert save error:",
                            error,
                        )

            elif current_risk not in {
                "High",
                "Critical",
            }:
                # Re-arm immediate notification when risk rises again later.
                last_alert_risk = ""

            update_session(
                session_id,
                progress=progress,
                processed_frames=frame_index,
                analyzed_frames=analyzed_frames,
                current_time=round(
                    video_second,
                    1,
                ),
                density_score=last_result[
                    "density_score"
                ],
                raw_occupancy=last_result[
                    "raw_occupancy"
                ],
                density_level=last_result[
                    "density_level"
                ],
                motion_score=last_result[
                    "motion_score"
                ],
                motion_level=last_result[
                    "motion_level"
                ],
                congestion_score=last_result[
                    "congestion_score"
                ],
                congestion_status=last_result[
                    "congestion_status"
                ],
                hot_zones=last_result[
                    "hot_zones"
                ],
                trend=last_result[
                    "trend"
                ],
                calibrating=last_result[
                    "calibrating"
                ],
                risk_level=last_result.get(
                    "risk_level",
                    "Low",
                ),
                alert_count=alert_count,
                last_alert=last_alert_text,
                average_density=average_density,
                max_density=round(
                    max_density,
                    1,
                ),
                max_congestion=round(
                    max_congestion,
                    1,
                ),
            )

            if not should_display:
                continue

            if last_frame is None:
                continue

            encoded, buffer = (
                cv2.imencode(
                    ".jpg",
                    last_frame,
                    [
                        int(
                            cv2.IMWRITE_JPEG_QUALITY
                        ),
                        JPEG_QUALITY,
                    ],
                )
            )

            if not encoded:
                continue

            display_period = (
                display_stride
                / max(fps, 1.0)
            )

            now = (
                time.perf_counter()
            )

            if last_emit_time:
                wait = (
                    display_period
                    - (
                        now
                        - last_emit_time
                    )
                )

                if wait > 0:
                    time.sleep(
                        wait
                    )

            last_emit_time = (
                time.perf_counter()
            )

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + buffer.tobytes()
                + b"\r\n"
            )

    except GeneratorExit:
        update_session(
            session_id,
            status="stopped",
            message=(
                "The density stream "
                "was closed."
            ),
        )

    except Exception as error:
        print(
            "Crowd density analysis error:",
            error,
        )

        update_session(
            session_id,
            status="failed",
            message=str(error),
        )

    finally:
        capture.release()

        update_session(
            session_id,
            active_stream=False,
        )


@crowd_density_bp.route(
    "/upload",
    methods=["POST"],
)
def upload_density_video():
    ensure_upload_directory()

    uploaded_file = (
        request.files.get(
            "video"
        )
    )

    if (
        uploaded_file is None
        or not uploaded_file.filename
    ):
        return jsonify({
            "message": (
                "Please choose a CCTV "
                "video file."
            )
        }), 400

    original_name = secure_filename(
        uploaded_file.filename
    )

    extension = Path(
        original_name
    ).suffix.lower()

    if (
        extension
        not in ALLOWED_EXTENSIONS
    ):
        return jsonify({
            "message": (
                "Unsupported format. "
                "Use MP4, AVI, MOV, MKV, "
                "M4V or WEBM."
            )
        }), 400

    session_id = uuid.uuid4().hex

    file_path = (
        UPLOAD_DIR
        / "{}{}".format(
            session_id,
            extension,
        )
    )

    uploaded_file.save(
        file_path
    )

    capture = cv2.VideoCapture(
        str(file_path)
    )

    if not capture.isOpened():
        file_path.unlink(
            missing_ok=True
        )

        return jsonify({
            "message": (
                "The selected file is "
                "not a readable video."
            )
        }), 400

    fps = float(
        capture.get(
            cv2.CAP_PROP_FPS
        )
        or 25
    )

    total_frames = int(
        capture.get(
            cv2.CAP_PROP_FRAME_COUNT
        )
        or 0
    )

    width = int(
        capture.get(
            cv2.CAP_PROP_FRAME_WIDTH
        )
        or 0
    )

    height = int(
        capture.get(
            cv2.CAP_PROP_FRAME_HEIGHT
        )
        or 0
    )

    duration = (
        round(
            total_frames / fps,
            1,
        )
        if fps > 0
        else 0
    )

    capture.release()

    session = {
        "id": session_id,
        "original_name": original_name,
        "file_path": str(file_path),
        "status": "ready",
        "message": (
            "Video uploaded. "
            "Density analysis is ready."
        ),
        "progress": 0,
        "processed_frames": 0,
        "analyzed_frames": 0,
        "total_frames": total_frames,
        "fps": round(
            fps,
            2,
        ),
        "duration": duration,
        "width": width,
        "height": height,
        "current_time": 0,
        "density_score": 0,
        "raw_occupancy": 0,
        "density_level": "Low",
        "motion_score": 0,
        "motion_level": "Calibrating",
        "congestion_score": 0,
        "congestion_status": "Ready",
        "hot_zones": 0,
        "trend": "Calibrating",
        "calibrating": True,
        "risk_level": "Low",
        "alert_count": 0,
        "last_alert": "None",
        "average_density": 0,
        "max_density": 0,
        "max_congestion": 0,
        "created_at": datetime.now().isoformat(
            timespec="seconds"
        ),
        "stop_requested": False,
        "active_stream": False,
    }

    with _sessions_lock:
        _sessions[
            session_id
        ] = session

    return jsonify(
        public_session(
            session
        )
    ), 201


@crowd_density_bp.route(
    "/stream/<session_id>"
)
def density_stream(session_id):
    session = get_session(
        session_id
    )

    if not session:
        return jsonify({
            "message": (
                "Density session "
                "was not found."
            )
        }), 404

    if session.get(
        "active_stream"
    ):
        return jsonify({
            "message": (
                "This density session "
                "is already running."
            )
        }), 409

    return Response(
        generate_density_stream(
            session_id
        ),
        mimetype=(
            "multipart/x-mixed-replace; "
            "boundary=frame"
        ),
    )


@crowd_density_bp.route(
    "/status/<session_id>"
)
def density_status(session_id):
    session = get_session(
        session_id
    )

    if not session:
        return jsonify({
            "message": (
                "Density session "
                "was not found."
            )
        }), 404

    return jsonify(
        public_session(
            session
        )
    )


@crowd_density_bp.route(
    "/stop/<session_id>",
    methods=["POST"],
)
def stop_density_analysis(
    session_id,
):
    session = get_session(
        session_id
    )

    if not session:
        return jsonify({
            "message": (
                "Density session "
                "was not found."
            )
        }), 404

    update_session(
        session_id,
        stop_requested=True,
        message=(
            "Stopping crowd density "
            "analysis..."
        ),
    )

    return jsonify({
        "message": (
            "Stop requested."
        )
    })


@crowd_density_bp.route(
    "/<session_id>",
    methods=["DELETE"],
)
def delete_density_session(
    session_id,
):
    with _sessions_lock:
        session = _sessions.pop(
            session_id,
            None,
        )

    if not session:
        return jsonify({
            "message": (
                "Density session "
                "was not found."
            )
        }), 404

    Path(
        session["file_path"]
    ).unlink(
        missing_ok=True
    )

    return jsonify({
        "message": (
            "Crowd density session "
            "deleted."
        )
    })
