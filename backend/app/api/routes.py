"""
app/api/routes.py — All FastAPI route definitions.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import UserContext, get_current_user_optional
from app.config import get_settings
from app.database import get_db
from app.models.finding import Finding
from app.models.scan import Scan
from app.schemas import (
    ComparisonRequest,
    FindingOut,
    HealthOut,
    HistoryOut,
    OperationScanRequest,
    ScanDetailOut,
    ScanOut,
    ScanRequest,
    SpecAnalyzeRequest,
    SpecAnalysisOut,
    VisualizationsOut,
)
from app.security.url_validation import URLValidationError, resolve_and_validate
from app.services import history_service, openapi_service, operation_scan_service, report_service, scan_service
from app.services.visualization_service import (
    build_flow_graph,
    collect_latency_samples,
    count_findings_by_severity,
)
from app.schemas import LatencyStats, FlowGraph, FindingsBySeverity

router = APIRouter()
settings = get_settings()


# ── Health ──────────────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthOut, tags=["System"])
async def health_check(db: AsyncSession = Depends(get_db)):
    db_status = "ok"
    try:
        await db.execute(select(Scan).limit(1))
    except Exception:
        db_status = "error"

    s = get_settings()
    return HealthOut(
        status="ok",
        version="1.0.0",
        database=db_status,
        virustotal="configured" if s.virustotal_enabled else "not_configured",
        google_safe_browsing="configured" if s.safe_browsing_enabled else "not_configured",
    )


# ── Scans ───────────────────────────────────────────────────────────────────────

@router.post("/scans", response_model=ScanOut, status_code=status.HTTP_202_ACCEPTED, tags=["Scans"])
async def create_scan(
    request: ScanRequest,
    background_tasks: BackgroundTasks,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a URL for scanning. Returns immediately with a scan ID.
    Poll GET /api/scans/{scan_id} to check status.
    """
    try:
        validated_url, resolved_ip = resolve_and_validate(request.url)
    except URLValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    parsed = urlparse(validated_url)
    hostname = parsed.hostname or validated_url

    scan = Scan(
        id=str(uuid.uuid4()),
        url=validated_url,
        hostname=hostname,
        status="pending",
        user_id=user.id if user else None,
        user_email=user.email if user else None,
        workspace_id=request.workspace_id,
    )
    async with db.begin():
        db.add(scan)

    # Run scan in background
    background_tasks.add_task(scan_service.run_scan, scan.id, validated_url, db)

    return ScanOut.model_validate(scan)


@router.post("/scans/operation", response_model=ScanOut, status_code=status.HTTP_202_ACCEPTED, tags=["Scans"])
async def create_operation_scan(
    request: OperationScanRequest,
    background_tasks: BackgroundTasks,
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Scan a single OpenAPI operation imported from the Spec Analyzer.

    The server validates that the submitted (spec_id, method, path) exists in
    the previously cached specification before building the target URL.  The
    final URL is also checked against SSRF protections.  Destructive methods
    (POST, PUT, PATCH, DELETE) require confirm_destructive=true.

    The Authorization header (auth_header) is forwarded to the target only and
    is never stored in the database or included in logs.
    """
    try:
        scan_id, validated_url, scan_kwargs = await operation_scan_service.create_operation_scan(
            request,
            db,
            user_id=user.id if user else None,
            user_email=user.email if user else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Dispatch scan pipeline in background
    background_tasks.add_task(
        scan_service.run_scan,
        scan_id,
        validated_url,
        db,
        **scan_kwargs,
    )

    # Return scan stub — caller polls GET /api/scans/{scan_id}
    from sqlalchemy import select as sa_select
    result = await db.execute(sa_select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=500, detail="Scan record could not be retrieved.")
    return ScanOut.model_validate(scan)


@router.get("/scans/history", response_model=HistoryOut, tags=["Scans"])
async def get_scan_history(
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    scope: str = Query(default="workspace", pattern="^(my|workspace)$"),
    user: Optional[UserContext] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    return await history_service.list_scans(
        db,
        limit=limit,
        offset=offset,
        scope=scope,
        user_id=user.id if user else None,
    )


@router.get("/scans/{scan_id}", response_model=ScanDetailOut, tags=["Scans"])
async def get_scan(scan_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")
    return ScanDetailOut.model_validate(scan)


@router.get("/scans/{scan_id}/findings", response_model=list[FindingOut], tags=["Scans"])
async def get_findings(scan_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Finding).where(Finding.scan_id == scan_id))
    findings = result.scalars().all()
    return [FindingOut.model_validate(f) for f in findings]


@router.get("/scans/{scan_id}/visualizations", response_model=VisualizationsOut, tags=["Scans"])
async def get_visualizations(scan_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")
    if scan.status != "completed":
        raise HTTPException(status_code=409, detail="Scan has not completed yet.")
    if not scan.result_json:
        raise HTTPException(status_code=404, detail="Visualization data not available.")

    try:
        data = json.loads(scan.result_json)
        viz = data.get("visualizations", {})
        latency_data = viz.get("latency", {})
        flow_data = viz.get("flow", {})
        severity_data = viz.get("findings_by_severity", {})
        return VisualizationsOut(
            latency=LatencyStats(**latency_data),
            flow=FlowGraph(**flow_data),
            findings_by_severity=FindingsBySeverity(**severity_data),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not parse visualization data: {exc}")


@router.get("/scans/{scan_id}/report", tags=["Scans"])
async def download_report(scan_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")
    if scan.status != "completed":
        raise HTTPException(status_code=409, detail="Report is only available for completed scans.")

    try:
        pdf_bytes = report_service.generate_pdf(scan)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {exc}")

    safe_hostname = "".join(c if c.isalnum() or c in "-_." else "_" for c in (scan.hostname or "report"))
    filename = f"api_sentinel_{safe_hostname}_{scan.id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/scans/{scan_id}/compare", tags=["Scans"])
async def compare_scans(
    scan_id: str,
    request: ComparisonRequest,
    db: AsyncSession = Depends(get_db),
):
    comparison = await history_service.compare_scans(
        request.scan_id_a, request.scan_id_b, db
    )
    if not comparison:
        raise HTTPException(status_code=404, detail="One or both scans not found.")
    return comparison


# ── OpenAPI Specifications ──────────────────────────────────────────────────────

@router.post("/specifications/analyze", response_model=SpecAnalysisOut, tags=["Specifications"])
async def analyze_specification(
    url: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    if url:
        try:
            return await openapi_service.analyze_url(url)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to fetch specification: {exc}")
    elif file:
        content = await file.read()
        try:
            return openapi_service.analyze_upload(content, file.filename or "spec.json")
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to parse specification: {exc}")
    else:
        raise HTTPException(status_code=422, detail="Provide either a 'url' or a 'file'.")
