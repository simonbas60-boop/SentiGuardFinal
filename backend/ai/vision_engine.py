"""Shared AI helpers for SentiGuard.

Live camera:
- Keeps the fast single-pass YOLO path.

Recorded video:
- Can enable dense_mode=True.
- Dense mode uses overlapping tiled inference to improve detection of tiny,
  partially occluded people in crowd footage.
- Detections from tiles are mapped back to the original frame and merged with
  global NMS to reduce duplicate boxes.

Action labels remain lightweight motion estimates:
- Stationary
- Walking
- Running
"""

from __future__ import annotations

import time
from collections import Counter
from pathlib import Path
from threading import RLock

import cv2
import numpy as np
from ultralytics import YOLO


BACKEND_DIR = Path(__file__).resolve().parents[1]
MODEL_PATH = BACKEND_DIR / "yolov8n.pt"

# Fast mode = live camera
LIVE_IMAGE_SIZE = 416
LIVE_CONFIDENCE = 0.35
LIVE_MAX_DETECTIONS = 50

# Dense mode = uploaded crowd footage
DENSE_IMAGE_SIZE = 640
DENSE_CONFIDENCE = 0.18
DENSE_MAX_DETECTIONS_PER_TILE = 300
DENSE_NMS_IOU = 0.45

# Recorded-video behavior mode:
# Use ONE full-frame inference pass for stable movement tracking.
# Dense tiled inference remains available ONLY for approximate crowd count.
VIDEO_ACTION_IMAGE_SIZE = 640
VIDEO_ACTION_CONFIDENCE = 0.30
VIDEO_ACTION_MAX_DETECTIONS = 120


class VisionEngine:
    def __init__(self):
        if not MODEL_PATH.is_file():
            raise FileNotFoundError(
                "YOLO model was not found: {}".format(MODEL_PATH)
            )

        self._model = YOLO(str(MODEL_PATH))
        self._yolo_lock = RLock()
        self._tracker_lock = RLock()
        self._trackers = {}

    @staticmethod
    def _center(box):
        x1, y1, x2, y2 = box
        return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)

    @staticmethod
    def _size(box):
        x1, y1, x2, y2 = box
        return max(x2 - x1, 1), max(y2 - y1, 1)

    @staticmethod
    def _distance(point_a, point_b):
        dx = point_a[0] - point_b[0]
        dy = point_a[1] - point_b[1]
        return (dx * dx + dy * dy) ** 0.5

    @staticmethod
    def _iou(box_a, box_b):
        ax1, ay1, ax2, ay2 = box_a
        bx1, by1, bx2, by2 = box_b

        ix1 = max(ax1, bx1)
        iy1 = max(ay1, by1)
        ix2 = min(ax2, bx2)
        iy2 = min(ay2, by2)

        iw = max(0, ix2 - ix1)
        ih = max(0, iy2 - iy1)
        intersection = iw * ih

        if intersection <= 0:
            return 0.0

        area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
        area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
        union = area_a + area_b - intersection

        if union <= 0:
            return 0.0

        return intersection / float(union)

    def _global_nms(self, detections, iou_threshold=DENSE_NMS_IOU):
        """Merge duplicate detections coming from overlapping tiles."""
        if not detections:
            return []

        # Highest confidence first.
        detections = sorted(
            detections,
            key=lambda item: item["confidence"],
            reverse=True,
        )

        kept = []

        while detections:
            best = detections.pop(0)
            kept.append(best)

            remaining = []

            for candidate in detections:
                overlap = self._iou(
                    best["box"],
                    candidate["box"],
                )

                if overlap < iou_threshold:
                    remaining.append(candidate)

            detections = remaining

        return kept

    def _predict_person_boxes(
        self,
        frame,
        image_size,
        confidence,
        max_detections,
    ):
        """Run one YOLO person-detection pass."""
        with self._yolo_lock:
            results = self._model.predict(
                source=frame,
                classes=[0],
                imgsz=image_size,
                conf=confidence,
                max_det=max_detections,
                verbose=False,
            )

        detections = []

        for result in results:
            if result.boxes is None:
                continue

            for box in result.boxes:
                x1, y1, x2, y2 = map(
                    int,
                    box.xyxy[0].tolist(),
                )

                confidence_value = float(
                    box.conf[0].item()
                    if box.conf is not None
                    else 0.0
                )

                detections.append({
                    "box": (x1, y1, x2, y2),
                    "confidence": confidence_value,
                })

        return detections

    def _dense_tile_windows(self, width, height):
        """Create 2x2 overlapping windows.

        Each crop occupies about 62% of the frame in both dimensions.
        The overlap helps keep people near tile borders from being lost.
        """
        tile_width = max(
            int(round(width * 0.62)),
            min(width, 160),
        )
        tile_height = max(
            int(round(height * 0.70)),
            min(height, 140),
        )

        tile_width = min(tile_width, width)
        tile_height = min(tile_height, height)

        x_positions = sorted(
            set([0, max(width - tile_width, 0)])
        )
        y_positions = sorted(
            set([0, max(height - tile_height, 0)])
        )

        windows = []

        for y1 in y_positions:
            for x1 in x_positions:
                x2 = min(x1 + tile_width, width)
                y2 = min(y1 + tile_height, height)
                windows.append((x1, y1, x2, y2))

        return windows

    def _detect_dense_people(self, frame):
        """Tiled person detection for small/dense people in uploaded videos."""
        height, width = frame.shape[:2]
        all_detections = []

        for x1, y1, x2, y2 in self._dense_tile_windows(
            width,
            height,
        ):
            tile = frame[y1:y2, x1:x2]

            if tile.size == 0:
                continue

            tile_detections = self._predict_person_boxes(
                tile,
                image_size=DENSE_IMAGE_SIZE,
                confidence=DENSE_CONFIDENCE,
                max_detections=DENSE_MAX_DETECTIONS_PER_TILE,
            )

            for detection in tile_detections:
                tx1, ty1, tx2, ty2 = detection["box"]

                mapped_box = (
                    max(tx1 + x1, 0),
                    max(ty1 + y1, 0),
                    min(tx2 + x1, width - 1),
                    min(ty2 + y1, height - 1),
                )

                all_detections.append({
                    "box": mapped_box,
                    "confidence": detection["confidence"],
                })

        merged = self._global_nms(
            all_detections,
            iou_threshold=DENSE_NMS_IOU,
        )

        return merged

    def _classify_actions(self, tracker_id, boxes, timestamp):
        """Estimate Stationary, Walking and Running only.

        Movement is calculated from stable full-frame person tracks. Velocity
        smoothing reduces box jitter so normal pedestrians are less likely to
        switch erratically between Walking and Running.
        """
        with self._tracker_lock:
            state = self._trackers.get(
                tracker_id,
                {
                    "tracks": [],
                    "visuals": [],
                },
            )

            previous_tracks = state.get(
                "tracks",
                [],
            )

            used_previous = set()
            current_tracks = []
            actions = []

            for box in boxes:
                center = self._center(box)
                width, height = self._size(box)

                matched_index = None
                best_score = None

                for index, previous in enumerate(
                    previous_tracks
                ):
                    if index in used_previous:
                        continue

                    distance = self._distance(
                        center,
                        previous["center"],
                    )

                    average_height = max(
                        (
                            height
                            + previous["height"]
                        )
                        / 2.0,
                        1.0,
                    )

                    normalized_distance = (
                        distance
                        / average_height
                    )

                    overlap = self._iou(
                        box,
                        previous.get(
                            "box",
                            box,
                        ),
                    )

                    acceptable_match = (
                        normalized_distance <= 0.72
                        or overlap >= 0.12
                    )

                    if not acceptable_match:
                        continue

                    score = (
                        normalized_distance
                        - overlap * 0.35
                    )

                    if (
                        best_score is None
                        or score < best_score
                    ):
                        best_score = score
                        matched_index = index

                velocity_x = 0.0
                velocity_y = 0.0
                age = 1

                if matched_index is not None:
                    previous = previous_tracks[
                        matched_index
                    ]
                    used_previous.add(
                        matched_index
                    )

                    dt = max(
                        float(timestamp)
                        - float(
                            previous["timestamp"]
                        ),
                        0.001,
                    )

                    average_height = max(
                        (
                            height
                            + previous["height"]
                        )
                        / 2.0,
                        1.0,
                    )

                    raw_vx = (
                        (
                            center[0]
                            - previous["center"][0]
                        )
                        / average_height
                    ) / dt

                    raw_vy = (
                        (
                            center[1]
                            - previous["center"][1]
                        )
                        / average_height
                    ) / dt

                    previous_vx = float(
                        previous.get(
                            "velocity_x",
                            0.0,
                        )
                    )
                    previous_vy = float(
                        previous.get(
                            "velocity_y",
                            0.0,
                        )
                    )

                    velocity_x = (
                        previous_vx * 0.50
                        + raw_vx * 0.50
                    )
                    velocity_y = (
                        previous_vy * 0.50
                        + raw_vy * 0.50
                    )

                    age = int(
                        previous.get(
                            "age",
                            1,
                        )
                    ) + 1

                speed = (
                    (
                        velocity_x
                        * velocity_x
                        + velocity_y
                        * velocity_y
                    )
                    ** 0.5
                )

                if matched_index is None or speed < 0.14:
                    action = "Stationary"
                elif speed < 1.25:
                    action = "Walking"
                else:
                    action = "Running"

                current_tracks.append({
                    "box": box,
                    "center": center,
                    "width": width,
                    "height": height,
                    "timestamp": float(
                        timestamp
                    ),
                    "age": age,
                    "speed": float(
                        speed
                    ),
                    "velocity_x": float(
                        velocity_x
                    ),
                    "velocity_y": float(
                        velocity_y
                    ),
                })

                actions.append(
                    action
                )

            visuals = list(
                zip(
                    boxes,
                    actions,
                )
            )

            self._trackers[
                tracker_id
            ] = {
                "tracks": current_tracks,
                "visuals": visuals,
            }

        return actions

    @staticmethod
    def _action_color(action):
        if action == "Running":
            return (0, 165, 255)
        if action == "Walking":
            return (34, 197, 94)
        return (34, 211, 238)

    def _draw_visuals(self, frame, visuals):
        annotated = frame.copy()

        for box, action in visuals:
            x1, y1, x2, y2 = box
            color = self._action_color(action)

            cv2.rectangle(
                annotated,
                (x1, y1),
                (x2, y2),
                color,
                1,
            )

            # Dense crowd footage can contain many boxes.
            # Keep labels compact to reduce screen clutter.
            if len(visuals) <= 35:
                cv2.putText(
                    annotated,
                    action,
                    (x1, max(y1 - 4, 14)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.35,
                    color,
                    1,
                )

        return annotated

    def count_dense_people(self, frame):
        """Approximate dense-crowd count.

        This tiled detector is intentionally separated from behavior tracking
        because tiled boxes are not temporally stable enough for action labels.
        """
        detections = self._detect_dense_people(
            frame
        )
        return len(detections)

    def detect_video_behavior(
        self,
        frame,
        tracker_id,
        draw=True,
        timestamp=None,
    ):
        """Full-frame recorded-video behavior tracking.

        Uses one consistent frame coordinate system, which is substantially
        more stable for Stationary/Walking/Running than tiled
        detections.
        """
        if timestamp is None:
            timestamp = time.perf_counter()

        detections = self._predict_person_boxes(
            frame,
            image_size=VIDEO_ACTION_IMAGE_SIZE,
            confidence=VIDEO_ACTION_CONFIDENCE,
            max_detections=VIDEO_ACTION_MAX_DETECTIONS,
        )

        boxes = [
            detection["box"]
            for detection in detections
        ]

        actions = self._classify_actions(
            tracker_id,
            boxes,
            timestamp,
        )

        action_counter = Counter(
            actions
        )
        action_counts = dict(
            action_counter
        )

        if action_counter.get(
            "Running",
            0,
        ) > 0:
            dominant_action = "Running"
        elif action_counter.get(
            "Walking",
            0,
        ) > 0:
            # In a pedestrian scene, a meaningful number of walking tracks
            # should dominate over a few stationary detections.
            walking = action_counter.get(
                "Walking",
                0,
            )
            stationary = action_counter.get(
                "Stationary",
                0,
            )

            dominant_action = (
                "Walking"
                if walking >= max(
                    1,
                    int(
                        stationary * 0.35
                    ),
                )
                else "Stationary"
            )
        elif actions:
            dominant_action = (
                "Stationary"
            )
        else:
            dominant_action = (
                "No Person"
            )

        visuals = list(
            zip(
                boxes,
                actions,
            )
        )

        annotated = (
            self._draw_visuals(
                frame,
                visuals,
            )
            if draw
            else frame
        )

        return (
            len(boxes),
            dominant_action,
            annotated,
            action_counts,
        )

    def draw_people_boxes(self, frame, boxes):
        """Draw count-only person boxes without behavior/action labels."""
        annotated = frame.copy()

        for index, box in enumerate(boxes, start=1):
            x1, y1, x2, y2 = map(int, box)

            cv2.rectangle(
                annotated,
                (x1, y1),
                (x2, y2),
                (34, 211, 238),
                2,
            )

            if len(boxes) <= 45:
                cv2.putText(
                    annotated,
                    "Person {}".format(index),
                    (x1, max(y1 - 5, 14)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.36,
                    (34, 211, 238),
                    1,
                )

        return annotated

    def detect_people_count(
        self,
        frame,
        dense_mode=False,
        draw=True,
    ):
        """Count people only; this path intentionally has no behavior logic."""
        if dense_mode:
            detections = self._detect_dense_people(frame)
        else:
            detections = self._predict_person_boxes(
                frame,
                image_size=LIVE_IMAGE_SIZE,
                confidence=LIVE_CONFIDENCE,
                max_detections=LIVE_MAX_DETECTIONS,
            )

        boxes = [
            detection["box"]
            for detection in detections
        ]

        annotated = (
            self.draw_people_boxes(frame, boxes)
            if draw
            else frame
        )

        return len(boxes), annotated, boxes

    def detect_people_and_action(
        self,
        frame,
        tracker_id="live",
        draw=True,
        timestamp=None,
        dense_mode=False,
    ):
        """Detect people and estimate the dominant lightweight action.

        dense_mode=False:
            fast single YOLO pass for the live camera.

        dense_mode=True:
            tiled YOLO inference for uploaded dense-crowd footage.
        """
        if timestamp is None:
            timestamp = time.perf_counter()

        if dense_mode:
            detections = self._detect_dense_people(
                frame
            )
        else:
            detections = self._predict_person_boxes(
                frame,
                image_size=LIVE_IMAGE_SIZE,
                confidence=LIVE_CONFIDENCE,
                max_detections=LIVE_MAX_DETECTIONS,
            )

        boxes = [
            detection["box"]
            for detection in detections
        ]

        actions = self._classify_actions(
            tracker_id,
            boxes,
            timestamp,
        )

        action_counter = Counter(
            actions
        )
        action_counts = dict(
            action_counter
        )

        if action_counter.get(
            "Running",
            0,
        ) > 0:
            dominant_action = "Running"
        else:
            dominant_action = (
                action_counter.most_common(
                    1
                )[0][0]
                if actions
                else "No Person"
            )

        visuals = list(
            zip(boxes, actions)
        )

        annotated = (
            self._draw_visuals(
                frame,
                visuals,
            )
            if draw
            else frame
        )

        return (
            len(boxes),
            dominant_action,
            annotated,
            action_counts,
        )

    def draw_last_detections(
        self,
        frame,
        tracker_id,
    ):
        with self._tracker_lock:
            visuals = list(
                self._trackers.get(
                    tracker_id,
                    {"visuals": []},
                ).get("visuals", [])
            )

        return self._draw_visuals(
            frame,
            visuals,
        )

    def reset_tracker(
        self,
        tracker_id,
    ):
        with self._tracker_lock:
            self._trackers.pop(
                tracker_id,
                None,
            )


vision_engine = VisionEngine()
