"""
app/models/scan.py — ORM model for scan records.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    hostname: Mapped[str] = mapped_column(String(253), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    # pending | running | completed | failed

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Score
    assessment_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    earned_points: Mapped[float | None] = mapped_column(Float, nullable=True)
    assessed_points: Mapped[float | None] = mapped_column(Float, nullable=True)
    assessment_coverage: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Counts
    passed_checks: Mapped[int] = mapped_column(Integer, default=0)
    failed_checks: Mapped[int] = mapped_column(Integer, default=0)
    warning_checks: Mapped[int] = mapped_column(Integer, default=0)
    inconclusive_checks: Mapped[int] = mapped_column(Integer, default=0)

    # Severity of highest finding
    highest_severity: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Full JSON results (sanitized — no raw credentials)
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # User Ownership (Optional for guest scans, populated for authenticated users)
    user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    user_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Workspace / Team association (Optional)
    workspace_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

