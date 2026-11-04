"""Crowd Behavior Analysis with action, crowd-limit, snapshot and alert events."""

from __future__ import annotations

import time
import uuid
from collections import deque
from datetime import datetime
from pathlib import Path
from threading import RLock

import cv2
from flask import Blueprint, Response, jsonify, request
from werkzeug.utils import secure_filename

from ai.vision_engine import vision_engine
from utils.alert_logger import save_alert
from utils.alert_store import BACKEND_DIR, SNAPSHOT_DIR, ensure_storage

video_analysis_bp = Blueprint(
    "video_analysis",
    __name__,
)

UPLOAD_DIR = BACKEND_DIR / "uploads"

ALLOWED_EXTENSIONS = {
    ".mp4",
    ".avi",
    ".mov",
    ".mkv",
    ".m4v",
    ".webm",
}

# Dense tiled inference is heavier than the live-camera path.
# Run AI less frequently, while keeping the displayed stream smoother.
AI_TARGET_FPS = 5.0
DENSE_COUNT_INTERVAL_SECONDS = 2.0
DISPLAY_TARGET_FPS = 12.0
DISPLAY_MAX_WIDTH = 960
JPEG_QUALITY = 68
EVENT_CLEAR_AI_FRAMES = 3
MAX_FIGHT_EVIDENCE = 2
MAX_RUNNING_EVIDENCE = 4
MAX_CROWD_EVIDENCE = 4

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


def update_session(
    session_id,
    **changes,
):
    with _sessions_lock:
        if session_id in _sessions:
            _sessions[
                session_id
            ].update(changes)


def get_session(session_id):
    with _sessions_lock:
        return _sessions.get(
            session_id
        )


def resize_for_processing(frame):
    """Downscale very large footage, but never downscale small crowd videos."""
    height, width = frame.shape[:2]

    if width <= DISPLAY_MAX_WIDTH:
        return frame

    scale = (
        DISPLAY_MAX_WIDTH
        / float(width)
    )

    return cv2.resize(
        frame,
        (
            DISPLAY_MAX_WIDTH,
            max(
                int(height * scale),
                1,
            ),
        ),
        interpolation=cv2.INTER_AREA,
    )


def save_video_snapshot(
    frame,
    session_id,
):
    ensure_storage()

    filename = datetime.now().strftime(
        "video_{}_%Y_%m_%d_%H_%M_%S_%f.jpg".format(
            session_id[:8]
        )
    )

    path = SNAPSHOT_DIR / filename

    if not cv2.imwrite(
        str(path),
        frame,
    ):
        raise OSError(
            "Could not save uploaded-video snapshot: {}".format(
                path
            )
        )

    return "snapshots/{}".format(
        filename
    )


def generate_uploaded_video(
    session_id,
):
    """Analyze recorded CCTV behavior.

    Temporary alert policy:
    - Behaviors: Stationary / Walking / Running only.
    - Crowd-limit alerts are disabled.
    - Alert ONLY when 100% of currently tracked people are Running.
    - Require at least 2 tracked people and 2 consecutive AI moments.
    - One alert/snapshot per distinct 100%-Running event.
    """
    session = get_session(
        session_id
    )

    if not session:
        return

    video_path = Path(
        session["file_path"]
    )

    capture = cv2.VideoCapture(
        str(video_path)
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

    ai_stride = max(
        int(
            round(
                fps
                / AI_TARGET_FPS
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

    analysis_step_seconds = (
        ai_stride
        / max(
            fps,
            1.0,
        )
    )

    tracker_id = (
        "video:{}"
        .format(session_id)
    )

    frame_index = 0
    ai_frames = 0

    current_people = 0
    current_action = "No Person"
    current_density = "Low"
    current_risk = "Safe"
    current_alert = "Normal"
    current_action_counts = {}

    max_people = 0
    people_sum = 0
    last_emit_time = 0.0
    last_dense_count_second = -10000.0

    recent_counts = deque(
        maxlen=3
    )

    behavior_labels = (
        "Stationary",
        "Walking",
        "Running",
    )

    behavior_frame_counts = {
        label: 0
        for label in behavior_labels
    }

    running_ai_frames = 0
    full_running_ai_frames = 0
    running_events = 0

    running_event_active = False
    running_confirm_streak = 0
    running_clear_streak = 0

    alert_count = 0
    alert_sequence = 0
    last_saved_alert = "None"
    last_alert_type = "None"
    last_monitor_alert = "None"
    last_alert_saved = False

    update_session(
        session_id,
        status="analyzing",
        message=(
            "Crowd behavior analysis "
            "is running."
        ),
        active_stream=True,
        stop_requested=False,
        detection_mode=(
            "Running Crowd Monitor"
        ),
        alert_count=0,
        alert_sequence=0,
        last_saved_alert="None",
        last_alert_type="None",
        last_monitor_alert="None",
        last_alert_saved=False,
        running_activity_pct=0,
        full_running_activity_pct=0,
        running_duration=0,
        running_events=0,
        running_crowd_ratio=0,
        running_crowd_confirmed=False,
        behavior_distribution={
            label: 0
            for label in behavior_labels
        },
        started_at=datetime.now().isoformat(
            timespec="seconds"
        ),
    )

    vision_engine.reset_tracker(
        tracker_id
    )

    def save_running_event(
        annotated_frame,
        video_second,
    ):
        nonlocal alert_count
        nonlocal alert_sequence
        nonlocal last_saved_alert
        nonlocal last_alert_type
        nonlocal last_monitor_alert
        nonlocal last_alert_saved

        title = (
            "100% Crowd Running Detected"
        )

        # This sequence triggers the browser sound immediately.
        alert_sequence += 1
        last_monitor_alert = title
        last_alert_type = "running"
        last_alert_saved = False

        try:
            image_path = (
                save_video_snapshot(
                    annotated_frame,
                    session_id,
                )
            )

            save_alert(
                title,
                current_people,
                "Running",
                "Danger",
                image_path,
                source=(
                    "Crowd Behavior Analysis: "
                    + session[
                        "original_name"
                    ]
                ),
            )

            alert_count += 1
            last_saved_alert = title
            last_alert_saved = True

            print(
                "100% running crowd alert saved at",
                round(
                    video_second,
                    1,
                ),
                "seconds",
            )

        except Exception as error:
            print(
                "Running crowd alert save error:",
                error,
            )

    def build_summary():
        total_behavior_frames = sum(
            behavior_frame_counts.values()
        )

        if total_behavior_frames <= 0:
            distribution = {
                label: 0.0
                for label in behavior_labels
            }
        else:
            distribution = {
                label: round(
                    (
                        behavior_frame_counts[
                            label
                        ]
                        / total_behavior_frames
                    )
                    * 100.0,
                    1,
                )
                for label in behavior_labels
            }

        running_activity_pct = round(
            (
                running_ai_frames
                / max(
                    ai_frames,
                    1,
                )
            )
            * 100.0,
            1,
        )

        full_running_activity_pct = round(
            (
                full_running_ai_frames
                / max(
                    ai_frames,
                    1,
                )
            )
            * 100.0,
            1,
        )

        return {
            "behavior_distribution": (
                distribution
            ),
            "running_activity_pct": (
                running_activity_pct
            ),
            "full_running_activity_pct": (
                full_running_activity_pct
            ),
            "running_duration": round(
                running_ai_frames
                * analysis_step_seconds,
                1,
            ),
        }

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
                        "Analysis was stopped "
                        "by the user."
                    ),
                    **build_summary(),
                )
                break

            success, frame = (
                capture.read()
            )

            if not success:
                summary_risk = (
                    "Danger"
                    if running_events > 0
                    else "Safe"
                )

                update_session(
                    session_id,
                    status="completed",
                    progress=100,
                    message=(
                        "Video analysis "
                        "completed successfully."
                    ),
                    summary_risk=(
                        summary_risk
                    ),
                    running_events=(
                        running_events
                    ),
                    completed_at=datetime.now().isoformat(
                        timespec="seconds"
                    ),
                    **build_summary(),
                )
                break

            frame_index += 1

            video_second = (
                frame_index / fps
                if fps > 0
                else 0
            )

            should_analyze = (
                frame_index == 1
                or frame_index
                % ai_stride
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

            working_frame = (
                resize_for_processing(
                    frame
                )
            )

            if should_analyze:
                (
                    behavior_people,
                    current_action,
                    annotated,
                    action_counts,
                ) = (
                    vision_engine
                    .detect_video_behavior(
                        working_frame,
                        tracker_id=tracker_id,
                        draw=True,
                        timestamp=video_second,
                    )
                )

                # Approximate dense count remains for display/statistics only.
                should_dense_count = (
                    not recent_counts
                    or (
                        video_second
                        - last_dense_count_second
                    )
                    >= DENSE_COUNT_INTERVAL_SECONDS
                )

                if should_dense_count:
                    raw_people = (
                        vision_engine
                        .count_dense_people(
                            working_frame
                        )
                    )

                    recent_counts.append(
                        int(raw_people)
                    )

                    sorted_counts = sorted(
                        recent_counts
                    )

                    current_people = (
                        sorted_counts[
                            len(sorted_counts)
                            // 2
                        ]
                    )

                    last_dense_count_second = (
                        video_second
                    )

                elif not recent_counts:
                    current_people = int(
                        behavior_people
                    )

                ai_frames += 1

                current_action_counts = dict(
                    action_counts
                )

                tracked_people = sum(
                    int(value)
                    for value in (
                        current_action_counts.values()
                    )
                )

                running_count = int(
                    current_action_counts.get(
                        "Running",
                        0,
                    )
                )

                running_ratio = (
                    (
                        running_count
                        / tracked_people
                    )
                    * 100.0
                    if tracked_people > 0
                    else 0.0
                )

                # "Crowd Running 100%" means at least two currently tracked
                # people, and every tracked person is classified as Running.
                full_running_now = (
                    tracked_people >= 2
                    and running_count
                    == tracked_people
                )

                if running_count > 0:
                    running_ai_frames += 1

                if full_running_now:
                    full_running_ai_frames += 1

                if (
                    current_action
                    in behavior_frame_counts
                ):
                    behavior_frame_counts[
                        current_action
                    ] += 1

                # ---------------------------------------------------
                # 100% running event confirmation
                # ---------------------------------------------------
                if full_running_now:
                    running_clear_streak = 0
                    running_confirm_streak += 1

                    if (
                        not running_event_active
                        and running_confirm_streak >= 2
                    ):
                        running_event_active = True
                        running_events += 1

                        save_running_event(
                            annotated,
                            video_second,
                        )

                else:
                    running_confirm_streak = 0

                    if running_event_active:
                        running_clear_streak += 1

                        if (
                            running_clear_streak >= 2
                        ):
                            running_event_active = False
                            running_clear_streak = 0

                # Crowd-limit alert is intentionally DISABLED here.
                # Dense count is still displayed, but it does not generate
                # an alert in this temporary mode.
                if running_event_active:
                    current_risk = "Danger"
                    current_alert = (
                        "100% Crowd Running Detected"
                    )
                else:
                    current_risk = "Safe"
                    current_alert = "Normal"

                # Behavior analysis is intentionally independent from the
                # configured head-count/crowd limit. Count is display context only.
                current_density = "Behavior Only"

                max_people = max(
                    max_people,
                    current_people,
                )

                people_sum += (
                    current_people
                )

                average_people = round(
                    people_sum
                    / max(
                        ai_frames,
                        1,
                    ),
                    2,
                )

            else:
                annotated = (
                    vision_engine
                    .draw_last_detections(
                        working_frame,
                        tracker_id,
                    )
                )

                tracked_people = sum(
                    int(value)
                    for value in (
                        current_action_counts.values()
                    )
                )
                running_count = int(
                    current_action_counts.get(
                        "Running",
                        0,
                    )
                )
                running_ratio = (
                    (
                        running_count
                        / tracked_people
                    )
                    * 100.0
                    if tracked_people > 0
                    else 0.0
                )

                average_people = round(
                    people_sum
                    / max(
                        ai_frames,
                        1,
                    ),
                    2,
                )

            summary = (
                build_summary()
            )

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

            update_session(
                session_id,
                people=current_people,
                action=current_action,
                density=current_density,
                risk=current_risk,
                alert=current_alert,
                progress=progress,
                processed_frames=frame_index,
                ai_frames=ai_frames,
                max_people=max_people,
                average_people=average_people,
                current_time=round(
                    video_second,
                    1,
                ),
                detection_mode=(
                    "100% Running Alert Only"
                ),
                alert_count=alert_count,
                alert_sequence=alert_sequence,
                last_saved_alert=(
                    last_saved_alert
                ),
                last_monitor_alert=(
                    last_monitor_alert
                ),
                last_alert_type=(
                    last_alert_type
                ),
                last_alert_saved=(
                    last_alert_saved
                ),
                running_detected=bool(
                    running_count > 0
                ),
                running_crowd_ratio=round(
                    running_ratio,
                    1,
                ),
                running_crowd_confirmed=bool(
                    running_event_active
                ),
                running_events=(
                    running_events
                ),
                **summary,
            )

            if not should_display:
                continue

            overlay_height = 88

            cv2.rectangle(
                annotated,
                (0, 0),
                (
                    annotated.shape[1],
                    overlay_height,
                ),
                (7, 17, 31),
                -1,
            )

            cv2.putText(
                annotated,
                "People: {} | Action: {}".format(
                    current_people,
                    current_action,
                ),
                (16, 31),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.60,
                (255, 255, 255),
                2,
            )

            cv2.putText(
                annotated,
                "Running Crowd: {:.0f}% | Alert: {}".format(
                    running_ratio,
                    current_alert,
                ),
                (16, 65),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.52,
                (
                    (0, 0, 255)
                    if running_event_active
                    else (
                        34,
                        197,
                        94,
                    )
                ),
                2,
            )

            encoded, buffer = (
                cv2.imencode(
                    ".jpg",
                    annotated,
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
                / max(
                    fps,
                    1.0,
                )
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
                "The analysis stream "
                "was closed."
            ),
            **build_summary(),
        )

    except Exception as error:
        print(
            "Uploaded video analysis error:",
            error,
        )

        update_session(
            session_id,
            status="failed",
            message=str(error),
        )

    finally:
        capture.release()

        vision_engine.reset_tracker(
            tracker_id
        )

        update_session(
            session_id,
            active_stream=False,
        )


@video_analysis_bp.route(
    "/upload",
    methods=["POST"],
)
def upload_video():
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
                "Unsupported video format. "
                "Use MP4, AVI, MOV, MKV, "
                "M4V or WEBM."
            )
        }), 400

    session_id = uuid.uuid4().hex

    saved_name = (
        "{}{}"
        .format(
            session_id,
            extension,
        )
    )

    file_path = (
        UPLOAD_DIR
        / saved_name
    )

    uploaded_file.save(
        file_path
    )

    capture = (
        cv2.VideoCapture(
            str(file_path)
        )
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
        "saved_name": saved_name,
        "file_path": str(file_path),
        "status": "ready",
        "message": (
            "Video uploaded. "
            "Start the processed stream "
            "to analyze it."
        ),
        "progress": 0,
        "processed_frames": 0,
        "ai_frames": 0,
        "total_frames": total_frames,
        "fps": round(fps, 2),
        "duration": duration,
        "width": width,
        "height": height,
        "people": 0,
        "max_people": 0,
        "average_people": 0,
        "action": "No Person",
        "density": "Low",
        "risk": "Safe",
        "alert": "Normal",
        "alert_count": 0,
        "alert_sequence": 0,
        "last_saved_alert": "None",
        "last_alert_type": "None",
        "running_detected": False,
        "running_crowd_ratio": 0,
        "running_crowd_confirmed": False,
        "full_running_activity_pct": 0,
        "last_monitor_alert": "None",
        "last_alert_saved": False,
        "running_activity_pct": 0,
        "running_duration": 0,
        "running_events": 0,
        "behavior_distribution": {
            "Stationary": 0,
            "Walking": 0,
            "Running": 0,
        },
        "summary_risk": "Safe",
        "current_time": 0,
        "detection_mode": "Dense Crowd",
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


@video_analysis_bp.route(
    "/stream/<session_id>"
)
def video_stream(session_id):
    session = get_session(
        session_id
    )

    if not session:
        return jsonify({
            "message": (
                "Analysis session "
                "was not found."
            )
        }), 404

    if session.get(
        "active_stream"
    ):
        return jsonify({
            "message": (
                "This video is already "
                "being analyzed."
            )
        }), 409

    return Response(
        generate_uploaded_video(
            session_id
        ),
        mimetype=(
            "multipart/x-mixed-replace; "
            "boundary=frame"
        ),
    )


@video_analysis_bp.route(
    "/status/<session_id>"
)
def analysis_status(session_id):
    session = get_session(
        session_id
    )

    if not session:
        return jsonify({
            "message": (
                "Analysis session "
                "was not found."
            )
        }), 404

    return jsonify(
        public_session(
            session
        )
    )


@video_analysis_bp.route(
    "/stop/<session_id>",
    methods=["POST"],
)
def stop_analysis(session_id):
    session = get_session(
        session_id
    )

    if not session:
        return jsonify({
            "message": (
                "Analysis session "
                "was not found."
            )
        }), 404

    update_session(
        session_id,
        stop_requested=True,
        message="Stopping analysis...",
    )

    return jsonify({
        "message": "Stop requested."
    })


@video_analysis_bp.route(
    "/<session_id>",
    methods=["DELETE"],
)
def delete_analysis(session_id):
    with _sessions_lock:
        session = _sessions.pop(
            session_id,
            None,
        )

    if not session:
        return jsonify({
            "message": (
                "Analysis session "
                "was not found."
            )
        }), 404

    vision_engine.reset_tracker(
        "video:{}".format(
            session_id
        )
    )

    Path(
        session["file_path"]
    ).unlink(
        missing_ok=True
    )

    return jsonify({
        "message": (
            "Uploaded video "
            "session deleted."
        )
    })
