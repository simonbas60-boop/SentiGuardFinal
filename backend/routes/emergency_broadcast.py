import json

from flask import (
    Blueprint,
    Response,
    jsonify,
    request,
    stream_with_context,
)
from flask_jwt_extended import (
    get_jwt_identity,
    jwt_required,
)

from utils.emergency_state import (
    activate_emergency,
    attendee_connected,
    attendee_disconnected,
    clear_emergency,
    get_emergency_state,
    wait_for_emergency_update,
)


emergency_bp = Blueprint(
    "emergency",
    __name__,
)


def _sse_payload(state):
    return (
        "event: emergency\n"
        "data: {}\n\n"
    ).format(
        json.dumps(
            state,
            ensure_ascii=False,
        )
    )


@emergency_bp.route(
    "/status",
    methods=["GET"],
)
def public_status():
    """Public status used by QR-attendee pages and admin status cards."""
    return jsonify(
        get_emergency_state()
    )


@emergency_bp.route(
    "/stream",
    methods=["GET"],
)
def emergency_stream():
    """Public Server-Sent Events stream for attendee browsers."""

    @stream_with_context
    def generate():
        state = attendee_connected()
        last_revision = int(
            state.get(
                "revision",
                0,
            )
        )

        try:
            # Send current state immediately.
            yield _sse_payload(
                state
            )

            while True:
                state = (
                    wait_for_emergency_update(
                        last_revision,
                        timeout=18.0,
                    )
                )

                revision = int(
                    state.get(
                        "revision",
                        0,
                    )
                )

                if revision != last_revision:
                    last_revision = revision
                    yield _sse_payload(
                        state
                    )
                else:
                    # Keep proxies / browsers from treating the connection
                    # as idle.
                    yield (
                        ": sentiguard-keepalive\n\n"
                    )

        except GeneratorExit:
            pass

        finally:
            attendee_disconnected()

    response = Response(
        generate(),
        mimetype="text/event-stream",
    )

    response.headers[
        "Cache-Control"
    ] = "no-cache"

    response.headers[
        "X-Accel-Buffering"
    ] = "no"

    response.headers[
        "Connection"
    ] = "keep-alive"

    return response


@emergency_bp.route(
    "/admin/activate",
    methods=["POST"],
)
@jwt_required()
def admin_activate():
    """Admin-only emergency ON switch."""
    data = (
        request.get_json(
            silent=True
        )
        or {}
    )

    state = activate_emergency(
        data.get(
            "message"
        )
    )

    return jsonify({
        "message": (
            "Emergency broadcast activated."
        ),
        "admin": get_jwt_identity(),
        "state": state,
    })


@emergency_bp.route(
    "/admin/clear",
    methods=["POST"],
)
@jwt_required()
def admin_clear():
    """Admin-only emergency OFF / clear switch."""
    data = (
        request.get_json(
            silent=True
        )
        or {}
    )

    state = clear_emergency(
        data.get(
            "message"
        )
    )

    return jsonify({
        "message": (
            "Emergency broadcast cleared."
        ),
        "admin": get_jwt_identity(),
        "state": state,
    })
