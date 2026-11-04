from io import BytesIO

from flask import Blueprint, send_file
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate

from utils.alert_store import read_alerts

report_bp = Blueprint("report", __name__)


@report_bp.route("/pdf")
def generate_report():
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer)
    styles = getSampleStyleSheet()

    elements = [
        Paragraph(
            "<b>SentiGuard AI Incident Report</b>",
            styles["Title"],
        )
    ]

    logs = read_alerts()

    if logs:
        last = logs[-1]

        action = (
            last.get("action")
            or last.get("emotion")
            or "Unknown"
        )

        report_rows = [
            ("Time", last.get("time", "Unknown")),
            ("People Count", last.get("people", 0)),
            ("Action", action),
            ("Risk", last.get("risk", "Unknown")),
            ("Alert", last.get("alert", "Unknown")),
            ("Snapshot", last.get("image", "None")),
        ]

        for label, value in report_rows:
            elements.append(
                Paragraph(
                    "{} : {}".format(label, value),
                    styles["BodyText"],
                )
            )

    else:
        elements.append(
            Paragraph(
                "No alert records are available.",
                styles["BodyText"],
            )
        )

    doc.build(elements)
    buffer.seek(0)

    return send_file(
        buffer,
        download_name="Incident_Report.pdf",
        as_attachment=True,
        mimetype="application/pdf",
    )
