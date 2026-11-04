"""Thread-safe storage helpers for SentiGuard JSON alerts and snapshots."""

from __future__ import annotations

import json
import os
import tempfile
import time
from pathlib import Path
from threading import RLock
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
LOG_DIR = BACKEND_DIR / "logs"
SNAPSHOT_DIR = BACKEND_DIR / "snapshots"
ALERTS_FILE = LOG_DIR / "alerts.json"

_alert_lock = RLock()


def ensure_storage() -> None:
    """Create the alert and snapshot directories and initialize the JSON file."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

    if not ALERTS_FILE.exists():
        ALERTS_FILE.write_text("[]", encoding="utf-8")


def _read_alerts_unlocked() -> list[dict[str, Any]]:
    ensure_storage()

    try:
        raw_data = ALERTS_FILE.read_text(encoding="utf-8").strip()
        if not raw_data:
            return []

        data = json.loads(raw_data)
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Alert log read error: {exc}")
        return []


def read_alerts() -> list[dict[str, Any]]:
    """Return a safe copy of all alert records."""
    with _alert_lock:
        return list(_read_alerts_unlocked())


def _write_alerts_unlocked(alerts: list[dict[str, Any]]) -> None:
    """Atomically replace alerts.json so API reads never see partial JSON."""
    ensure_storage()

    temp_path: str | None = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=LOG_DIR,
            prefix="alerts_",
            suffix=".tmp",
            delete=False,
        ) as temp_file:
            json.dump(alerts, temp_file, indent=4, ensure_ascii=False)
            temp_file.flush()
            os.fsync(temp_file.fileno())
            temp_path = temp_file.name

        os.replace(temp_path, ALERTS_FILE)
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


def write_alerts(alerts: list[dict[str, Any]]) -> None:
    with _alert_lock:
        _write_alerts_unlocked(alerts)


def append_alert(record: dict[str, Any]) -> dict[str, Any]:
    """Assign a stable integer ID, append one alert, and save it atomically."""
    with _alert_lock:
        alerts = _read_alerts_unlocked()

        existing_ids = [
            item.get("id")
            for item in alerts
            if isinstance(item.get("id"), int)
        ]
        # Millisecond IDs stay unique even after older alerts are deleted,
        # while remaining safely representable by JavaScript.
        record["id"] = max(
            max(existing_ids, default=0) + 1,
            int(time.time() * 1000),
        )

        alerts.append(record)
        _write_alerts_unlocked(alerts)

        return record


def delete_alerts_by_image(filename: str) -> int:
    """Delete matching alert records atomically and return the number removed."""
    with _alert_lock:
        alerts = _read_alerts_unlocked()
        remaining = [
            item
            for item in alerts
            if Path(str(item.get("image", ""))).name != filename
        ]
        deleted_count = len(alerts) - len(remaining)

        if deleted_count:
            _write_alerts_unlocked(remaining)

        return deleted_count
