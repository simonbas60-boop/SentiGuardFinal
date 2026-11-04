"""Lightweight visual crowd-density and congestion analysis.

This module intentionally does NOT estimate an exact people count.

It analyzes:
- visual occupancy from foreground activity,
- optical-flow motion,
- local hot-zone occupancy,
- density trend over time.

The result is a Visual Crowd Density Index (0-100), not physical people/m².
Physical density would require camera calibration and real-world ground area.
"""

from __future__ import annotations

from collections import deque

import cv2
import numpy as np


class CrowdDensityEngine:
    def __init__(self):
        self.background = cv2.createBackgroundSubtractorMOG2(
            history=240,
            varThreshold=26,
            detectShadows=False,
        )
        self.previous_gray = None
        self.frame_count = 0

        self.density_history = deque(maxlen=24)
        self.motion_history = deque(maxlen=12)

    @staticmethod
    def _clamp(value, low=0.0, high=100.0):
        return max(low, min(float(value), high))

    @staticmethod
    def _resize(frame, max_width=960):
        height, width = frame.shape[:2]

        if width <= max_width:
            return frame

        scale = max_width / float(width)

        return cv2.resize(
            frame,
            (
                max_width,
                max(int(height * scale), 1),
            ),
            interpolation=cv2.INTER_AREA,
        )

    @staticmethod
    def _central_roi(mask):
        """Ignore a small border where timestamps/watermarks often exist."""
        height, width = mask.shape[:2]

        top = int(height * 0.06)
        bottom = int(height * 0.98)
        left = int(width * 0.02)
        right = int(width * 0.98)

        return mask[top:bottom, left:right], (left, top, right, bottom)

    def _foreground_occupancy(self, frame):
        # Very slow learning prevents the background model from immediately
        # absorbing a dense moving crowd.
        learning_rate = 0.003 if self.frame_count > 20 else 0.02

        mask = self.background.apply(
            frame,
            learningRate=learning_rate,
        )

        # Remove isolated sensor/compression noise and fill nearby crowd regions.
        kernel_small = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (3, 3),
        )
        kernel_large = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (7, 7),
        )

        mask = cv2.morphologyEx(
            mask,
            cv2.MORPH_OPEN,
            kernel_small,
            iterations=1,
        )
        mask = cv2.morphologyEx(
            mask,
            cv2.MORPH_CLOSE,
            kernel_large,
            iterations=2,
        )

        mask = cv2.GaussianBlur(
            mask,
            (5, 5),
            0,
        )

        _, mask = cv2.threshold(
            mask,
            96,
            255,
            cv2.THRESH_BINARY,
        )

        roi_mask, roi_bounds = self._central_roi(mask)

        total_pixels = max(roi_mask.size, 1)
        occupied_pixels = cv2.countNonZero(roi_mask)

        raw_occupancy = (
            occupied_pixels / float(total_pixels)
        ) * 100.0

        return mask, raw_occupancy, roi_bounds

    def _motion_score(self, frame):
        gray = cv2.cvtColor(
            frame,
            cv2.COLOR_BGR2GRAY,
        )
        gray = cv2.GaussianBlur(
            gray,
            (5, 5),
            0,
        )

        if self.previous_gray is None:
            self.previous_gray = gray
            return 0.0, "Calibrating"

        flow = cv2.calcOpticalFlowFarneback(
            self.previous_gray,
            gray,
            None,
            0.5,
            3,
            15,
            3,
            5,
            1.2,
            0,
        )

        self.previous_gray = gray

        magnitude, _angle = cv2.cartToPolar(
            flow[..., 0],
            flow[..., 1],
        )

        # Robust statistic: avoid a few fast pixels dominating the score.
        magnitude = np.clip(
            magnitude,
            0,
            12,
        )
        median_motion = float(
            np.percentile(magnitude, 75)
        )

        motion_score = self._clamp(
            (median_motion / 3.0) * 100.0
        )

        self.motion_history.append(
            motion_score
        )

        smoothed_motion = float(
            np.mean(self.motion_history)
        )

        if smoothed_motion < 12:
            level = "Still"
        elif smoothed_motion < 30:
            level = "Slow"
        elif smoothed_motion < 60:
            level = "Normal"
        else:
            level = "Fast"

        return smoothed_motion, level

    @staticmethod
    def _edge_texture_score(frame):
        """Small supporting signal for scenes where much of the crowd is static."""
        gray = cv2.cvtColor(
            frame,
            cv2.COLOR_BGR2GRAY,
        )

        edges = cv2.Canny(
            gray,
            70,
            150,
        )

        roi_edges, _ = CrowdDensityEngine._central_roi(
            edges
        )

        ratio = (
            cv2.countNonZero(roi_edges)
            / float(max(roi_edges.size, 1))
        ) * 100.0

        # Edge ratios in ordinary CCTV are usually small. Scale conservatively.
        return CrowdDensityEngine._clamp(
            ratio * 4.2
        )

    @staticmethod
    def _density_level(score):
        if score < 30:
            return "Low"
        if score < 55:
            return "Moderate"
        if score < 75:
            return "High"
        return "Critical"

    @staticmethod
    def _density_color(level):
        if level == "Critical":
            return (0, 0, 255)
        if level == "High":
            return (0, 165, 255)
        if level == "Moderate":
            return (0, 215, 255)
        return (34, 197, 94)

    def _trend(self):
        values = list(
            self.density_history
        )

        if len(values) < 8:
            return "Calibrating"

        midpoint = len(values) // 2

        older = float(
            np.mean(values[:midpoint])
        )
        newer = float(
            np.mean(values[midpoint:])
        )

        difference = newer - older

        if difference > 5:
            return "Increasing"
        if difference < -5:
            return "Decreasing"
        return "Stable"

    @staticmethod
    def _make_density_heatmap(mask):
        """Turn local foreground occupancy into a smooth visual heatmap."""
        small = cv2.resize(
            mask,
            (24, 14),
            interpolation=cv2.INTER_AREA,
        ).astype(np.float32)

        small = small / 255.0

        heat = cv2.resize(
            small,
            (
                mask.shape[1],
                mask.shape[0],
            ),
            interpolation=cv2.INTER_CUBIC,
        )

        heat = cv2.GaussianBlur(
            heat,
            (0, 0),
            sigmaX=18,
            sigmaY=18,
        )

        max_value = float(
            np.max(heat)
        )

        if max_value > 0:
            heat = heat / max_value

        heat_u8 = np.clip(
            heat * 255,
            0,
            255,
        ).astype(np.uint8)

        heat_color = cv2.applyColorMap(
            heat_u8,
            cv2.COLORMAP_JET,
        )

        return heat, heat_color

    @staticmethod
    def _hot_zones(heat):
        thresholded = (
            heat >= 0.72
        ).astype(np.uint8) * 255

        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (15, 15),
        )

        thresholded = cv2.morphologyEx(
            thresholded,
            cv2.MORPH_CLOSE,
            kernel,
            iterations=1,
        )

        count, labels, stats, _centroids = (
            cv2.connectedComponentsWithStats(
                thresholded,
                connectivity=8,
            )
        )

        minimum_area = max(
            int(
                thresholded.shape[0]
                * thresholded.shape[1]
                * 0.008
            ),
            40,
        )

        zones = 0

        for index in range(1, count):
            area = int(
                stats[
                    index,
                    cv2.CC_STAT_AREA,
                ]
            )

            if area >= minimum_area:
                zones += 1

        return zones

    def analyze(self, frame):
        self.frame_count += 1

        frame = self._resize(
            frame
        )

        foreground_mask, raw_occupancy, roi_bounds = (
            self._foreground_occupancy(
                frame
            )
        )

        motion_score, motion_level = (
            self._motion_score(
                frame
            )
        )

        texture_score = (
            self._edge_texture_score(
                frame
            )
        )

        # During the first second or so the background model is calibrating.
        # We expose a status instead of pretending the first masks are reliable.
        calibrating = (
            self.frame_count < 12
        )

        # The main signal is visual foreground occupancy.
        # Texture is a small stabilizer for very slow/static crowd regions.
        occupancy_score = self._clamp(
            raw_occupancy * 1.30
        )

        density_score = self._clamp(
            occupancy_score * 0.82
            + texture_score * 0.18
        )

        if calibrating:
            # Avoid the first full-frame foreground mask appearing as "Critical".
            density_score = min(
                density_score,
                35.0,
            )

        self.density_history.append(
            density_score
        )

        smoothed_density = float(
            np.mean(
                list(self.density_history)[-6:]
            )
        )

        level = self._density_level(
            smoothed_density
        )

        # Congestion is high crowd density with reduced movement.
        stillness = (
            100.0 - motion_score
        )

        congestion_score = self._clamp(
            smoothed_density * 0.78
            + stillness * 0.22
        )

        if smoothed_density < 45:
            congestion_status = "Normal"
        elif smoothed_density < 65:
            congestion_status = "Crowded"
        elif motion_score < 32:
            congestion_status = "Congested"
        else:
            congestion_status = "Heavy Crowd"

        heat, heat_color = (
            self._make_density_heatmap(
                foreground_mask
            )
        )

        hot_zones = self._hot_zones(
            heat
        )

        trend = self._trend()

        # Overlay density heatmap without hiding the original footage.
        annotated = cv2.addWeighted(
            frame,
            0.62,
            heat_color,
            0.38,
            0,
        )

        left, top, right, bottom = (
            roi_bounds
        )

        cv2.rectangle(
            annotated,
            (left, top),
            (right, bottom),
            (255, 255, 255),
            1,
        )

        header_height = 108

        cv2.rectangle(
            annotated,
            (0, 0),
            (
                annotated.shape[1],
                header_height,
            ),
            (7, 17, 31),
            -1,
        )

        color = self._density_color(
            level
        )

        cv2.putText(
            annotated,
            "Visual Density: {:.1f}% | {}".format(
                smoothed_density,
                level,
            ),
            (18, 32),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.64,
            color,
            2,
        )

        cv2.putText(
            annotated,
            "Motion: {} ({:.0f}%) | Hot Zones: {}".format(
                motion_level,
                motion_score,
                hot_zones,
            ),
            (18, 66),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.54,
            (255, 255, 255),
            2,
        )

        cv2.putText(
            annotated,
            "Congestion: {} | Trend: {}".format(
                congestion_status,
                trend,
            ),
            (18, 98),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.54,
            (255, 255, 255),
            2,
        )

        return {
            "frame": annotated,
            "density_score": round(
                smoothed_density,
                1,
            ),
            "raw_occupancy": round(
                raw_occupancy,
                1,
            ),
            "density_level": level,
            "motion_score": round(
                motion_score,
                1,
            ),
            "motion_level": motion_level,
            "congestion_score": round(
                congestion_score,
                1,
            ),
            "congestion_status": (
                "Calibrating"
                if calibrating
                else congestion_status
            ),
            "hot_zones": int(
                hot_zones
            ),
            "trend": (
                "Calibrating"
                if calibrating
                else trend
            ),
            "calibrating": calibrating,
        }
