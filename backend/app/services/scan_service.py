"""
app/services/scan_service.py — Orchestrates the full scan pipeline.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import get_settings
from app.models.scan import Scan
from app.models.finding import Finding
from app.scanners import tls_checker, headers_checker, leakage_checker, reputation_checker
from app.schemas import TestResult
from app.security.redaction import redact_headers, redact_value
from app.security.url_validation import resolve_and_validate, validate_redirect_destination, URLValidationError
from app.services.scoring import calculate_score
from app.services.visualization_service import (
    collect_latency_samples,
    build_flow_graph,
    count_findings_by_severity,
)

settings = get_settings()
logger = logging.getLogger(__name__)


async def run_scan(
    scan_id: str,
    url: str,
    db: AsyncSession,
    *,
    http_method: str = "GET",
    request_body_json: Optional[dict] = None,
    auth_header: Optional[str] = None,   # used for HTTP only — NEVER persisted
    operation_context: Optional[dict] = None,  # embedded in result_json for UI
    query_params: Optional[dict] = None,
) -> None:
    """
    Execute the full scan pipeline for a given URL.
    Updates the Scan record in the database as it progresses.

    Parameters
    ----------
    http_method : str
        HTTP method to use for the primary request (default GET).
    request_body_json : dict | None
        JSON body for POST / PUT / PATCH requests.
    auth_header : str | None
        Authorization header value used for the request only.
        Stripped from all stored artefacts before persistence.
    operation_context : dict | None
        Metadata about the OpenAPI operation that triggered this scan.
        Stored in result_json so the UI can display the endpoint context.
    query_params : dict | None
        Extra query string parameters to append to the URL.
    """
    started = time.monotonic()
    scan_events: List[Dict[str, Any]] = []

    # ── Update status to running ────────────────────────────────────────────
    async with db.begin():
        result = await db.execute(select(Scan).where(Scan.id == scan_id))
        scan = result.scalar_one_or_none()
        if not scan:
            return
        scan.status = "running"

    # ── Step 1: Validate URL ────────────────────────────────────────────────
    try:
        validated_url, resolved_ip = resolve_and_validate(url)
        scan_events.append({"stage": "validation", "status": "ok", "resolved_ip": resolved_ip})
    except URLValidationError as exc:
        scan_events.append({"stage": "validation", "status": "error", "error": str(exc)})
        async with db.begin():
            result = await db.execute(select(Scan).where(Scan.id == scan_id))
            scan = result.scalar_one_or_none()
            if scan:
                scan.status = "failed"
                scan.error_message = f"URL validation failed: {exc}"
                scan.completed_at = datetime.now(timezone.utc)
                scan.duration_ms = (time.monotonic() - started) * 1000
        return

    # ── Step 2: Primary HTTP request ────────────────────────────────────────
    redirect_destinations: List[str] = []
    response_body = ""
    response_headers: Dict[str, str] = {}
    response_status = None
    response_content_type = ""
    primary_response: Optional[httpx.Response] = None
    response_for_headers: Optional[httpx.Response] = None

    method = http_method.upper()
    scan_events.append({"stage": "request", "url": url, "method": method})

    # Build extra headers (auth — not logged after this point)
    extra_headers: Dict[str, str] = {}
    if auth_header:
        extra_headers["Authorization"] = auth_header

    # Build query params
    request_url = url
    if query_params:
        qs = "&".join(f"{k}={v}" for k, v in query_params.items())
        separator = "&" if "?" in request_url else "?"
        request_url = f"{request_url}{separator}{qs}"

    try:
        async with httpx.AsyncClient(
            follow_redirects=False,
            timeout=settings.request_timeout_seconds,
            max_redirects=0,
            limits=httpx.Limits(max_connections=1, max_keepalive_connections=0),
        ) as client:
            primary_response = await client.request(
                method,
                request_url,
                headers=extra_headers or None,
                json=request_body_json if method in ("POST", "PUT", "PATCH") else None,
            )
            response_status = primary_response.status_code
            response_headers = dict(primary_response.headers)
            response_content_type = primary_response.headers.get("content-type", "")

            # Handle redirects manually so every destination is validated before use.
            current_response = primary_response
            current_url = str(primary_response.url)
            hops = 0
            while current_response.is_redirect and hops < settings.max_redirects:
                location = current_response.headers.get("location", "")
                if not location:
                    break

                # Resolve both root-relative and path-relative Location values correctly.
                redirect_url = urljoin(current_url, location)
                try:
                    validate_redirect_destination(redirect_url)
                except URLValidationError:
                    scan_events.append({"stage": "redirect_blocked", "destination": redirect_url})
                    break

                redirect_destinations.append(redirect_url)

                # Do not forward credentials to a different origin. Redirects are
                # intentionally followed with GET, matching the existing scanner behavior.
                source = urlparse(current_url)
                destination = urlparse(redirect_url)
                same_origin = (
                    source.scheme.lower() == destination.scheme.lower()
                    and source.hostname == destination.hostname
                    and source.port == destination.port
                )
                redirect_headers = extra_headers if same_origin else {}

                current_response = await client.request(
                    "GET", redirect_url, headers=redirect_headers or None
                )
                current_url = redirect_url
                hops += 1

            # Keep the exact response used for body/header analysis. This is the
            # final response reached, or the last response if a redirect was blocked.
            response_for_headers = current_response
            response_status = current_response.status_code
            response_headers = dict(current_response.headers)
            response_content_type = current_response.headers.get("content-type", "")
            body_bytes = await current_response.aread()

            # Enforce response size limit
            body_bytes = body_bytes[: settings.max_response_bytes]
            response_body = body_bytes.decode("utf-8", errors="replace")

            scan_events.append({
                "stage": "response",
                "status_code": response_status,
                "content_type": response_content_type,
                "response_size_bytes": len(body_bytes),
                "redirect_count": len(redirect_destinations),
            })

    except httpx.TimeoutException:
        scan_events.append({"stage": "request_error", "error": "Request timed out"})
        async with db.begin():
            result = await db.execute(select(Scan).where(Scan.id == scan_id))
            scan = result.scalar_one_or_none()
            if scan:
                scan.status = "failed"
                scan.error_message = "Request timed out"
                scan.completed_at = datetime.now(timezone.utc)
                scan.duration_ms = (time.monotonic() - started) * 1000
        return
    except Exception as exc:
        scan_events.append({"stage": "request_error", "error": str(exc)[:500]})
        async with db.begin():
            result = await db.execute(select(Scan).where(Scan.id == scan_id))
            scan = result.scalar_one_or_none()
            if scan:
                scan.status = "failed"
                scan.error_message = str(exc)[:500]
                scan.completed_at = datetime.now(timezone.utc)
                scan.duration_ms = (time.monotonic() - started) * 1000
        return

    # ── Step 3: Run security modules concurrently ───────────────────────────
    # TLS checker is synchronous (uses stdlib ssl)
    tls_result = await tls_checker.run(url)
    headers_result = await headers_checker.run(
        response_for_headers
        if response_for_headers is not None
        else _dummy_response(response_headers)
    )
    leakage_result = await leakage_checker.run(response_body, response_content_type)
    reputation_result = await reputation_checker.run(url, redirect_destinations)

    test_results: Dict[str, TestResult] = {
        "tls": tls_result,
        "headers": headers_result,
        "leakage": leakage_result,
        "reputation": reputation_result,
    }

    # ── Step 4: Score ───────────────────────────────────────────────────────
    score_result = calculate_score(test_results)

    # ── Step 5: Collect latency samples ─────────────────────────────────────
    latency = await collect_latency_samples(url, resolved_ip)

    # ── Step 6: Build flow graph ─────────────────────────────────────────────
    total_failures = sum(
        1 for r in test_results.values()
        for f in r.findings
        if f.get("status") in ("fail", "warning")
    )
    duration_ms_so_far = (time.monotonic() - started) * 1000
    flow = build_flow_graph(
        url,
        scan_events,
        redirect_destinations,
        total_failures,
        test_results=test_results,
        resolved_ip=resolved_ip,
        response_status=response_status,
        duration_ms=duration_ms_so_far,
        http_method=method,
    )

    # ── Step 7: Count findings by severity ──────────────────────────────────
    findings_by_severity = count_findings_by_severity(test_results)

    # ── Step 8: Prepare sanitized result JSON ───────────────────────────────
    result_payload: Dict[str, Any] = {
        "scan_id": scan_id,
        "url": url,
        "method": method,
        "resolved_ip": resolved_ip,
        "response": {
            "status_code": response_status,
            "headers": redact_headers(response_headers),
            "content_type": response_content_type,
            "redirect_destinations": redirect_destinations,
            "body": response_body,
        },
        "test_results": {k: v.model_dump() for k, v in test_results.items()},
        "score": score_result.model_dump(),
        "visualizations": {
            "latency": latency.model_dump(),
            "flow": flow.model_dump(),
            "findings_by_severity": findings_by_severity.model_dump(),
        },
        "scan_events": scan_events,
    }
    # Embed operation context if this scan originated from the Spec Analyzer
    if operation_context:
        result_payload["operation_context"] = operation_context

    # ── Step 9: Persist findings ─────────────────────────────────────────────
    db_findings = []
    for test_name, result in test_results.items():
        for f in result.findings:
            if f.get("status") not in ("fail", "warning"):
                continue  # Only persist actionable findings
            db_findings.append(Finding(
                scan_id=scan_id,
                title=f.get("check", f.get("name", "Unknown")),
                category=result.name,
                severity=f.get("severity") or "informational",
                confidence=f.get("confidence", "possible"),
                status=f.get("status", "fail"),
                evidence=f.get("evidence"),
                description=f.get("detail"),
                why_it_matters=f.get("why_it_matters"),
                remediation=f.get("remediation"),
                rule_reference=f.get("rule"),
            ))

    duration_ms = (time.monotonic() - started) * 1000

    # ── Step 10: Update scan record ──────────────────────────────────────────
    async with db.begin():
        result_q = await db.execute(select(Scan).where(Scan.id == scan_id))
        scan = result_q.scalar_one_or_none()
        if not scan:
            return

        scan.status = "completed"
        scan.completed_at = datetime.now(timezone.utc)
        scan.duration_ms = round(duration_ms, 2)
        scan.assessment_score = score_result.assessment_score
        scan.earned_points = score_result.earned_points
        scan.assessed_points = score_result.assessed_points
        scan.assessment_coverage = score_result.assessment_coverage
        scan.passed_checks = score_result.passed_checks
        scan.failed_checks = score_result.failed_checks
        scan.warning_checks = score_result.warning_checks
        scan.inconclusive_checks = score_result.inconclusive_checks
        scan.highest_severity = score_result.highest_severity
        scan.result_json = json.dumps(result_payload)

        for finding in db_findings:
            db.add(finding)

    # ── Step 11: Sync to Supabase Database & Storage ─────────────────────────
    try:
        from app.services.supabase_sync import sync_scan_to_supabase
        findings_dicts = [
            {
                "id": f.id,
                "title": f.title,
                "category": f.category,
                "severity": f.severity,
                "confidence": f.confidence,
                "status": f.status,
                "evidence": f.evidence,
                "description": f.description,
                "why_it_matters": f.why_it_matters,
                "remediation": f.remediation,
                "rule_reference": f.rule_reference,
            }
            for f in db_findings
        ]
        import asyncio
        asyncio.create_task(sync_scan_to_supabase(
            scan_id=scan.id,
            target_url=scan.url,
            hostname=scan.hostname,
            status=scan.status,
            score=scan.assessment_score,
            duration_ms=scan.duration_ms,
            passed_checks=scan.passed_checks,
            failed_checks=scan.failed_checks,
            warning_checks=scan.warning_checks,
            inconclusive_checks=scan.inconclusive_checks,
            highest_severity=scan.highest_severity,
            user_id=scan.user_id,
            user_email=scan.user_email,
            workspace_id=scan.workspace_id,
            findings=findings_dicts,
            visualizations=result_payload.get("visualizations"),
            started_at=scan.started_at.isoformat() if scan.started_at else None,
            completed_at=scan.completed_at.isoformat() if scan.completed_at else None,
            result_json=scan.result_json,
            earned_points=scan.earned_points,
            assessed_points=scan.assessed_points,
            assessment_coverage=scan.assessment_coverage,
        ))
    except Exception as exc:
        logger.error("Failed to trigger Supabase sync: %s", exc)


class _dummy_response:
    """Minimal mock for headers_checker when primary_response is unavailable."""
    def __init__(self, headers: Dict[str, str]):
        self.headers = headers
        self.status_code = 0
