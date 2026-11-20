"""
app/services/report_service.py — PDF report generation using ReportLab.
"""
from __future__ import annotations

import io
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.models.scan import Scan
from app.security.redaction import redact_text


_PALETTE = {
    "navy": colors.HexColor("#0f172a"),
    "cyan": colors.HexColor("#06b6d4"),
    "blue": colors.HexColor("#3b82f6"),
    "green": colors.HexColor("#22c55e"),
    "yellow": colors.HexColor("#eab308"),
    "red": colors.HexColor("#ef4444"),
    "orange": colors.HexColor("#f97316"),
    "gray": colors.HexColor("#6b7280"),
    "light_gray": colors.HexColor("#f1f5f9"),
    "white": colors.white,
}

_SEVERITY_COLORS = {
    "critical": _PALETTE["red"],
    "high": _PALETTE["orange"],
    "medium": _PALETTE["yellow"],
    "low": _PALETTE["blue"],
    "informational": _PALETTE["gray"],
}

_STATUS_COLORS = {
    "pass": _PALETTE["green"],
    "fail": _PALETTE["red"],
    "warning": _PALETTE["yellow"],
    "inconclusive": _PALETTE["gray"],
}


def _styles():
    base = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle("Title", parent=base["Title"], textColor=_PALETTE["navy"], fontSize=24, spaceAfter=6),
        "h1": ParagraphStyle("H1", parent=base["Heading1"], textColor=_PALETTE["navy"], fontSize=16, spaceBefore=12, spaceAfter=6),
        "h2": ParagraphStyle("H2", parent=base["Heading2"], textColor=_PALETTE["blue"], fontSize=13, spaceBefore=10, spaceAfter=4),
        "body": ParagraphStyle("Body", parent=base["Normal"], fontSize=10, leading=14, spaceAfter=4),
        "small": ParagraphStyle("Small", parent=base["Normal"], fontSize=8, textColor=_PALETTE["gray"], leading=12),
        "code": ParagraphStyle("Code", parent=base["Code"], fontSize=8, backColor=_PALETTE["light_gray"], leading=12),
        "disclaimer": ParagraphStyle("Disclaimer", parent=base["Normal"], fontSize=8, textColor=_PALETTE["gray"], leading=12, leftIndent=10, borderColor=_PALETTE["gray"], borderWidth=0.5, borderPadding=6),
    }
    return styles


def generate_pdf(scan: Scan) -> bytes:
    """Generate a PDF report for a completed scan. Returns PDF bytes."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title=f"API Sentinel Report — {scan.hostname}",
        author="API Sentinel",
    )

    styles = _styles()
    story = []

    # ── Title ────────────────────────────────────────────────────────────────
    story.append(Paragraph("API Sentinel", styles["title"]))
    story.append(Paragraph("Security Assessment Report", styles["h1"]))
    story.append(HRFlowable(width="100%", thickness=1, color=_PALETTE["cyan"]))
    story.append(Spacer(1, 0.3 * cm))

    # ── Metadata ─────────────────────────────────────────────────────────────
    scanned_at = scan.started_at.strftime("%Y-%m-%d %H:%M:%S UTC") if scan.started_at else "N/A"
    completed_at = scan.completed_at.strftime("%Y-%m-%d %H:%M:%S UTC") if scan.completed_at else "N/A"
    duration = f"{round(scan.duration_ms / 1000, 1)}s" if scan.duration_ms else "N/A"

    meta_data = [
        ["Scan ID", scan.id],
        ["Target Hostname", scan.hostname],
        ["Scanned URL", redact_text(scan.url)],
        ["Scan Started", scanned_at],
        ["Scan Completed", completed_at],
        ["Duration", duration],
        ["Status", scan.status.capitalize()],
    ]
    meta_table = Table(meta_data, colWidths=[5 * cm, 12 * cm])
    meta_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (0, -1), _PALETTE["navy"]),
        ("BACKGROUND", (0, 0), (-1, 0), _PALETTE["light_gray"]),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [_PALETTE["white"], _PALETTE["light_gray"]]),
        ("GRID", (0, 0), (-1, -1), 0.3, _PALETTE["gray"]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 0.5 * cm))

    # ── Security Assessment Score ─────────────────────────────────────────────
    story.append(Paragraph("Security Assessment Score", styles["h1"]))

    score_display = f"{scan.assessment_score:.1f} / 100" if scan.assessment_score is not None else "N/A (insufficient data)"
    score_color = _PALETTE["green"]
    if scan.assessment_score is not None:
        if scan.assessment_score < 50:
            score_color = _PALETTE["red"]
        elif scan.assessment_score < 75:
            score_color = _PALETTE["yellow"]

    score_style = ParagraphStyle(
        "ScoreDisplay", fontSize=28, textColor=score_color, fontName="Helvetica-Bold", alignment=1
    )
    story.append(Paragraph(score_display, score_style))
    story.append(Spacer(1, 0.2 * cm))

    score_details = [
        ["Earned Points", f"{scan.earned_points or 0:.1f}"],
        ["Assessed Points", f"{scan.assessed_points or 0:.1f} / 100"],
        ["Assessment Coverage", f"{scan.assessment_coverage or 0:.1f}%"],
        ["Passed Checks", str(scan.passed_checks)],
        ["Failed Checks", str(scan.failed_checks)],
        ["Warnings", str(scan.warning_checks)],
        ["Inconclusive", str(scan.inconclusive_checks)],
        ["Highest Severity", (scan.highest_severity or "None").capitalize()],
    ]
    score_table = Table(score_details, colWidths=[6 * cm, 11 * cm])
    score_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [_PALETTE["white"], _PALETTE["light_gray"]]),
        ("GRID", (0, 0), (-1, -1), 0.3, _PALETTE["gray"]),
        ("PADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(score_table)
    story.append(Spacer(1, 0.4 * cm))

    # ── Disclaimer ────────────────────────────────────────────────────────────
    story.append(Paragraph(
        "Disclaimer: The Security Assessment Score reflects the observable evidence collected "
        "during this scan. It measures the selected checks and cannot guarantee complete API safety. "
        "A high score does not confirm absence of vulnerabilities; a low score indicates specific "
        "improvements that can be made. Only response content observable from outside the API was analyzed.",
        styles["disclaimer"],
    ))
    story.append(Spacer(1, 0.5 * cm))

    # ── Test Results ──────────────────────────────────────────────────────────
    if scan.result_json:
        try:
            result_data = json.loads(scan.result_json)
            test_results = result_data.get("test_results", {})
        except Exception:
            test_results = {}
    else:
        test_results = {}

    story.append(Paragraph("Test Results", styles["h1"]))

    test_display_names = {
        "tls": "HTTPS and TLS Security",
        "headers": "HTTP Security Headers",
        "leakage": "Information Leakage",
        "reputation": "Domain and Redirect Reputation",
    }

    for test_key, display_name in test_display_names.items():
        result = test_results.get(test_key, {})
        if not result:
            continue

        status = result.get("status", "unknown")
        earned = result.get("earned_points", 0)
        max_pts = result.get("max_points", 0)
        status_color = _STATUS_COLORS.get(status, _PALETTE["gray"])

        story.append(Paragraph(f"{display_name}", styles["h2"]))

        status_label = f"Status: {status.upper()}  |  Points: {earned:.1f} / {max_pts}"
        label_style = ParagraphStyle(
            f"Status_{test_key}", parent=styles["body"], textColor=status_color, fontName="Helvetica-Bold"
        )
        story.append(Paragraph(status_label, label_style))

        # Findings table
        findings = result.get("findings", [])
        if findings:
            rows = [["Check", "Status", "Severity", "Detail"]]
            for f in findings:
                sev = f.get("severity") or ""
                rows.append([
                    Paragraph(str(f.get("check", f.get("name", ""))), styles["small"]),
                    f.get("status", "").upper(),
                    sev.capitalize() if sev else "—",
                    Paragraph(str(f.get("detail", f.get("evidence", "")))[:200], styles["small"]),
                ])
            tbl = Table(rows, colWidths=[4 * cm, 2 * cm, 2.5 * cm, 8.5 * cm])
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), _PALETTE["navy"]),
                ("TEXTCOLOR", (0, 0), (-1, 0), _PALETTE["white"]),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [_PALETTE["white"], _PALETTE["light_gray"]]),
                ("GRID", (0, 0), (-1, -1), 0.3, _PALETTE["gray"]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("PADDING", (0, 0), (-1, -1), 4),
            ]))
            story.append(tbl)
        story.append(Spacer(1, 0.3 * cm))

    # ── Remediation ───────────────────────────────────────────────────────────
    story.append(Paragraph("Remediation Recommendations", styles["h1"]))
    has_recs = False
    for test_key, result in test_results.items():
        recs = result.get("recommendations", [])
        if recs:
            has_recs = True
            display_name = test_display_names.get(test_key, test_key)
            story.append(Paragraph(display_name, styles["h2"]))
            for rec in recs:
                story.append(Paragraph(f"• {rec}", styles["body"]))
    if not has_recs:
        story.append(Paragraph("No specific remediation recommendations were generated.", styles["body"]))

    story.append(Spacer(1, 0.5 * cm))

    # ── Limitations ───────────────────────────────────────────────────────────
    story.append(Paragraph("Scan Limitations", styles["h1"]))
    limitations = [
        "This assessment is based on a limited set of observable signals from a single HTTP request and TLS handshake.",
        "Only response content visible from outside the API was analyzed. Internal vulnerabilities are not assessed.",
        "The information leakage check covers the specific response body returned during this scan. Other endpoints may differ.",
        "The reputation check reflects the state of the configured threat intelligence provider at scan time.",
        "A passing score does not certify API security. Independent penetration testing is recommended for production systems.",
        "Authentication, business logic, injection, and application-layer vulnerabilities are outside the scope of this scan.",
    ]
    for lim in limitations:
        story.append(Paragraph(f"• {lim}", styles["body"]))

    story.append(Spacer(1, 0.5 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=_PALETTE["gray"]))
    story.append(Paragraph(
        f"Generated by API Sentinel on {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}. "
        "This report is for informational purposes only.",
        styles["small"],
    ))

    doc.build(story)
    return buffer.getvalue()
