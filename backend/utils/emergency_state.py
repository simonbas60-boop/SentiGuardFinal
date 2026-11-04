"""Thread-safe in-memory emergency broadcast state for SentiGuard demo mode."""

from copy import deepcopy
from datetime import datetime
from threading import Condition


_condition = Condition()

_state = {
    "active": False,
    "message": "No emergency. Please remain aware of event safety instructions.",
    "severity": "normal",
    "revision": 0,
    "updated_at": None,
    "connected_clients": 0,
}


def get_emergency_state():
    with _condition:
        return deepcopy(_state)


def activate_emergency(message):
    text = (
        str(message or "")
        .strip()
    )

    if not text:
        text = (
            "Emergency situation detected. "
            "Please remain calm and follow instructions from event staff."
        )

    # Keep attendee screen concise.
    text = text[:500]

    with _condition:
        _state.update({
            "active": True,
            "message": text,
            "severity": "critical",
            "revision": int(
                _state.get(
                    "revision",
                    0,
                )
            ) + 1,
            "updated_at": datetime.now().isoformat(
                timespec="seconds"
            ),
        })

        _condition.notify_all()

        return deepcopy(_state)


def clear_emergency(message=None):
    text = (
        str(message or "")
        .strip()
    )

    if not text:
        text = (
            "Emergency alert cleared. "
            "Please continue to follow event staff instructions."
        )

    text = text[:500]

    with _condition:
        _state.update({
            "active": False,
            "message": text,
            "severity": "normal",
            "revision": int(
                _state.get(
                    "revision",
                    0,
                )
            ) + 1,
            "updated_at": datetime.now().isoformat(
                timespec="seconds"
            ),
        })

        _condition.notify_all()

        return deepcopy(_state)


def wait_for_emergency_update(
    last_revision,
    timeout=20.0,
):
    with _condition:
        current_revision = int(
            _state.get(
                "revision",
                0,
            )
        )

        if current_revision == int(
            last_revision
        ):
            _condition.wait(
                timeout=timeout
            )

        return deepcopy(_state)


def attendee_connected():
    with _condition:
        _state[
            "connected_clients"
        ] = int(
            _state.get(
                "connected_clients",
                0,
            )
        ) + 1

        return deepcopy(_state)


def attendee_disconnected():
    with _condition:
        _state[
            "connected_clients"
        ] = max(
            int(
                _state.get(
                    "connected_clients",
                    0,
                )
            ) - 1,
            0,
        )

        return deepcopy(_state)
