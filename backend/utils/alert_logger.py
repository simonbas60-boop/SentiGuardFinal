from datetime import datetime
from pathlib import Path

from utils.alert_store import append_alert


def save_alert(
    alert,
    people,
    action,
    risk,
    image,
    source="Live Camera",
):
    """Persist one crowd alert.

    The action field replaces the previous DeepFace emotion field.
    Alarm generation still depends only on the crowd limit.
    """
    normalized_image = Path(
        str(image)
    ).as_posix()

    record = {
        "time": datetime.now().strftime(
            "%Y-%m-%d %H:%M:%S"
        ),
        "alert": str(alert),
        "people": int(people),
        "action": str(action),
        "risk": str(risk),
        "image": normalized_image,
        "source": str(source),
    }

    saved_record = append_alert(record)

    print(
        "Alert saved to JSON: id={}".format(
            saved_record["id"]
        )
    )

    return saved_record
