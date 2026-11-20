"""
app/services/history_service.py — Scan history and comparison.
"""
from __future__ import annotations

import json
from typing import List, Optional, Tuple

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finding import Finding
from app.models.scan import Scan
from app.schemas import (
    ComparisonFindingChange,
    ComparisonOut,
    HistoryOut,
    ScanSummary,
)


async def list_scans(
    db: AsyncSession,
    limit: int = 50,
    offset: int = 0,
    scope: str = "workspace",
    user_id: Optional[str] = None,
) -> HistoryOut:
    # 1. Guest mode (unauthenticated): strictly do NOT retrieve data from database
    if not user_id:
        return HistoryOut(scans=[], total=0, my_total=0, workspace_total=0)

    # 2. Authenticated user: strictly exclude any scan where user_id IS NULL
    # Total count for current user
    my_count_stmt = (
        select(func.count())
        .select_from(Scan)
        .where(Scan.user_id.isnot(None))
        .where(Scan.user_id == user_id)
    )
    my_res = await db.execute(my_count_stmt)
    my_total = my_res.scalar_one() or 0

    # Workspace total count: only authenticated scans (strictly exclude guest scans where user_id IS NULL)
    workspace_count_stmt = (
        select(func.count())
        .select_from(Scan)
        .where(Scan.user_id.isnot(None))
        .where(Scan.user_id == user_id)
    )
    workspace_res = await db.execute(workspace_count_stmt)
    workspace_total = workspace_res.scalar_one() or 0

    # Query based on scope (strictly exclude Scan.user_id IS NULL)
    query = (
        select(Scan)
        .where(Scan.user_id.isnot(None))
        .where(Scan.user_id == user_id)
        .order_by(desc(Scan.started_at))
    )
    total = my_total if scope == "my" else workspace_total

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    scans = result.scalars().all()

    return HistoryOut(
        scans=[ScanSummary.model_validate(s) for s in scans],
        total=total,
        my_total=my_total,
        workspace_total=workspace_total,
    )


async def compare_scans(
    scan_id_a: str, scan_id_b: str, db: AsyncSession
) -> Optional[ComparisonOut]:
    result_a = await db.execute(select(Scan).where(Scan.id == scan_id_a))
    result_b = await db.execute(select(Scan).where(Scan.id == scan_id_b))
    scan_a = result_a.scalar_one_or_none()
    scan_b = result_b.scalar_one_or_none()

    if not scan_a or not scan_b:
        return None

    # Get findings from each scan
    findings_a = await db.execute(select(Finding).where(Finding.scan_id == scan_id_a))
    findings_b = await db.execute(select(Finding).where(Finding.scan_id == scan_id_b))
    list_a = findings_a.scalars().all()
    list_b = findings_b.scalars().all()

    # Build lookup by (title, category)
    map_a = {(f.title, f.category): f for f in list_a}
    map_b = {(f.title, f.category): f for f in list_b}

    keys_a = set(map_a.keys())
    keys_b = set(map_b.keys())

    changes: List[ComparisonFindingChange] = []

    # New in B
    for key in keys_b - keys_a:
        f = map_b[key]
        changes.append(ComparisonFindingChange(
            title=f.title,
            category=f.category,
            status="new",
            severity_after=f.severity,
        ))

    # Not detected in B (was in A)
    for key in keys_a - keys_b:
        f = map_a[key]
        changes.append(ComparisonFindingChange(
            title=f.title,
            category=f.category,
            status="not_detected",
            severity_before=f.severity,
        ))

    # Present in both — check severity change
    for key in keys_a & keys_b:
        fa = map_a[key]
        fb = map_b[key]
        if fa.severity != fb.severity:
            changes.append(ComparisonFindingChange(
                title=fa.title,
                category=fa.category,
                status="severity_changed",
                severity_before=fa.severity,
                severity_after=fb.severity,
            ))
        else:
            changes.append(ComparisonFindingChange(
                title=fa.title,
                category=fa.category,
                status="unchanged",
                severity_before=fa.severity,
                severity_after=fb.severity,
            ))

    # Latency comparison
    latency_a = _get_avg_latency(scan_a)
    latency_b = _get_avg_latency(scan_b)
    latency_change = None
    if latency_a is not None and latency_b is not None:
        latency_change = round(latency_b - latency_a, 2)

    score_change = None
    if scan_a.assessment_score is not None and scan_b.assessment_score is not None:
        score_change = round(scan_b.assessment_score - scan_a.assessment_score, 1)

    coverage_change = None
    if scan_a.assessment_coverage is not None and scan_b.assessment_coverage is not None:
        coverage_change = round(scan_b.assessment_coverage - scan_a.assessment_coverage, 1)

    return ComparisonOut(
        scan_a=ScanSummary.model_validate(scan_a),
        scan_b=ScanSummary.model_validate(scan_b),
        score_change=score_change,
        coverage_change=coverage_change,
        latency_change_ms=latency_change,
        finding_changes=changes,
    )


def _get_avg_latency(scan: Scan) -> Optional[float]:
    if not scan.result_json:
        return None
    try:
        data = json.loads(scan.result_json)
        return data.get("visualizations", {}).get("latency", {}).get("avg_ms")
    except Exception:
        return None
