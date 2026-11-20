"""
app/services/visualization_service.py — Prepare chart data and flow graphs.

All data is derived from actual scan events. No illustrative or random data is inserted.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx

from app.config import get_settings
from app.schemas import (
    FindingsBySeverity,
    FlowEdge,
    FlowGraph,
    FlowNode,
    LatencyPoint,
    LatencyStats,
    TestResult,
    VisualizationsOut,
)
from app.security.url_validation import resolve_and_validate, validate_redirect_destination, URLValidationError

settings = get_settings()

_SEVERITY_COLORS = {
    "critical": "#ef4444",
    "high": "#f97316",
    "medium": "#eab308",
    "low": "#3b82f6",
    "informational": "#6b7280",
}


# ── Latency Sampling ─────────────────────────────────────────────────────────────

async def _single_request(
    client: httpx.AsyncClient, url: str, n: int, resolved_ip: Optional[str] = None
) -> LatencyPoint:
    """Make a single timed GET request and return a LatencyPoint."""
    start = time.monotonic()
    try:
        resp = await client.get(url, timeout=settings.request_timeout_seconds)
        elapsed_ms = (time.monotonic() - start) * 1000
        return LatencyPoint(
            request_number=n,
            response_time_ms=round(elapsed_ms, 2),
            status_code=resp.status_code,
            timed_out=False,
        )
    except httpx.TimeoutException:
        return LatencyPoint(
            request_number=n,
            response_time_ms=None,
            status_code=None,
            timed_out=True,
            error="Request timed out",
        )
    except Exception as exc:
        return LatencyPoint(
            request_number=n,
            response_time_ms=None,
            status_code=None,
            timed_out=False,
            error=str(exc)[:200],
        )


async def collect_latency_samples(url: str, resolved_ip: str) -> LatencyStats:
    """Run N sequential GET requests and collect latency data."""
    n_samples = settings.scan_latency_samples
    samples: List[LatencyPoint] = []

    async with httpx.AsyncClient(
        follow_redirects=False,
        limits=httpx.Limits(max_connections=1),
    ) as client:
        for i in range(1, n_samples + 1):
            point = await _single_request(client, url, i, resolved_ip)
            samples.append(point)
            if i < n_samples:
                await asyncio.sleep(0.3)  # Brief pause between samples

    valid_times = [p.response_time_ms for p in samples if p.response_time_ms is not None]
    failed = sum(1 for p in samples if p.response_time_ms is None)

    return LatencyStats(
        avg_ms=round(sum(valid_times) / len(valid_times), 2) if valid_times else None,
        min_ms=round(min(valid_times), 2) if valid_times else None,
        max_ms=round(max(valid_times), 2) if valid_times else None,
        failed_requests=failed,
        samples=samples,
    )


# ── Flow Graph Builder ────────────────────────────────────────────────────────────

def _count_check_findings(test_result: Optional[TestResult]) -> Dict[str, int]:
    """Count findings by status for a single test result."""
    if not test_result:
        return {"pass": 0, "fail": 0, "warning": 0, "inconclusive": 0, "total": 0}
    counts: Dict[str, int] = {"pass": 0, "fail": 0, "warning": 0, "inconclusive": 0}
    for f in test_result.findings:
        s = f.get("status", "inconclusive")
        counts[s] = counts.get(s, 0) + 1
    counts["total"] = sum(counts.values())
    return counts


def _check_status_label(test_result: Optional[TestResult]) -> str:
    """Return a short human label for the check status."""
    if not test_result:
        return "Not Run"
    return {
        "pass": "Passed",
        "fail": "Failed",
        "warning": "Warning",
        "inconclusive": "Inconclusive",
    }.get(test_result.status, "Unknown")


def build_flow_graph(
    url: str,
    scan_events: List[Dict[str, Any]],
    redirects: List[str],
    findings_count: int,
    *,
    test_results: Optional[Dict[str, TestResult]] = None,
    resolved_ip: Optional[str] = None,
    response_status: Optional[int] = None,
    duration_ms: Optional[float] = None,
    http_method: str = "GET",
) -> FlowGraph:
    """
    Generate a React Flow graph from actual scan events.

    Nodes represent real observed stages; edges represent transitions.
    Positions are NOT set here — the frontend uses Dagre for automatic layout.
    All position fields default to {x: 0, y: 0} and are overridden client-side.
    """
    nodes: List[FlowNode] = []
    edges: List[FlowEdge] = []
    parsed = urlparse(url)
    hostname = parsed.hostname or url

    def add_node(
        node_id: str,
        label: str,
        node_type: str,
        data: Dict[str, Any],
    ) -> FlowNode:
        node = FlowNode(
            id=node_id,
            type=node_type,
            label=label,
            data=data,
            position={"x": 0, "y": 0},  # Dagre calculates real position
        )
        nodes.append(node)
        return node

    def add_edge(
        source: str,
        target: str,
        label: str = "",
        animated: bool = False,
        color: str = "#6b7280",
    ):
        edges.append(FlowEdge(
            id=f"e-{source}-{target}",
            source=source,
            target=target,
            label=label,
            animated=animated,
            style={"stroke": color},
        ))

    # Helper to look up scan events
    def find_event(stage: str) -> Optional[Dict[str, Any]]:
        return next((e for e in scan_events if e.get("stage") == stage), None)

    test_results = test_results or {}

    # ── Stage 1: URL Submitted ───────────────────────────────────────────────
    add_node("n-input", f"URL Submitted", "input", {
        "url": url,
        "stage": "input",
        "stage_status": "completed",
        "description": f"Target: {hostname}",
        "icon": "globe",
    })

    # ── Stage 2: URL & Scope Validation ──────────────────────────────────────
    validation_event = find_event("validation")
    validation_status = (validation_event or {}).get("status", "unknown")
    validation_ok = validation_status == "ok"
    ip = (validation_event or {}).get("resolved_ip", resolved_ip)

    add_node("n-validation", "URL & Scope Validation", "validation", {
        "stage": "validation",
        "stage_status": "completed" if validation_ok else "failed",
        "resolved_ip": ip,
        "description": "SSRF-resistant validation: scheme, credentials, IP range, and scope checks.",
        "icon": "shield-check",
        "detail_items": [
            f"Resolved IP: {ip}" if ip else "Resolved IP: Unavailable",
            "Scheme validated" if validation_ok else f"Validation failed: {(validation_event or {}).get('error', 'Unknown error')}",
        ],
    })
    add_edge("n-input", "n-validation", "validate", color="#3b82f6")

    if not validation_ok:
        add_node("n-blocked", "Scan Blocked", "blocked", {
            "stage": "blocked",
            "stage_status": "failed",
            "reason": (validation_event or {}).get("error", "Validation failed"),
            "description": "The target URL did not pass validation. No HTTP request was sent.",
            "icon": "x-circle",
        })
        add_edge("n-validation", "n-blocked", "blocked", color="#ef4444")
        return FlowGraph(nodes=nodes, edges=edges)

    # ── Stage 3: DNS Resolution ──────────────────────────────────────────────
    add_node("n-dns", "DNS Resolution", "dns", {
        "stage": "dns",
        "stage_status": "completed" if ip else "skipped",
        "resolved_ip": ip,
        "description": f"Resolved {hostname} → {ip}" if ip else f"DNS resolution for {hostname}",
        "icon": "server",
    })
    add_edge("n-validation", "n-dns", "resolve", color="#06b6d4")

    # ── Stage 4: TLS Handshake ───────────────────────────────────────────────
    is_https = parsed.scheme.lower() == "https"
    tls_result = test_results.get("tls")
    tls_status = "completed"
    tls_desc = "TLS handshake and certificate verification"

    if not is_https:
        tls_status = "skipped"
        tls_desc = "Not applicable — target uses plain HTTP"
    elif tls_result and tls_result.status == "fail":
        tls_status = "warning"
        tls_desc = "TLS connection established but certificate issues detected"
    elif tls_result and tls_result.status == "pass":
        tls_desc = "TLS handshake successful, certificate verified"

    tls_evidence = tls_result.evidence if tls_result else {}
    tls_info = tls_evidence.get("tls_info", {}) if isinstance(tls_evidence, dict) else {}

    add_node("n-tls-handshake", "TLS Handshake", "tls_handshake", {
        "stage": "tls_handshake",
        "stage_status": tls_status,
        "description": tls_desc,
        "icon": "lock",
        "detail_items": [
            f"Protocol: {tls_info.get('tls_version', 'Unavailable')}",
            f"Cipher: {tls_info.get('cipher_name', 'Unavailable')}",
        ] if is_https else ["Not applicable for HTTP"],
    })
    add_edge("n-dns", "n-tls-handshake", "connect", color="#8b5cf6")

    # ── Stage 5: HTTP Request Prepared & Sent ────────────────────────────────
    request_event = find_event("request")
    method = (request_event or {}).get("method", http_method)
    path = parsed.path or "/"

    add_node("n-request", "HTTP Request Sent", "request", {
        "stage": "request",
        "stage_status": "completed",
        "method": method,
        "url": url,
        "description": f"{method} {path}",
        "icon": "send",
    })
    add_edge("n-tls-handshake", "n-request", f"{method}", animated=True, color="#06b6d4")

    # Check for request errors
    error_event = find_event("request_error")
    if error_event:
        add_node("n-request-error", "Request Failed", "error", {
            "stage": "request_error",
            "stage_status": "failed",
            "error": error_event.get("error", "Unknown error"),
            "description": error_event.get("error", "The HTTP request could not be completed."),
            "icon": "alert-triangle",
        })
        add_edge("n-request", "n-request-error", "error", color="#ef4444")

        add_node("n-final", "Final Results", "final", {
            "stage": "final",
            "stage_status": "failed",
            "finding_count": 0,
            "description": "Scan terminated due to connection failure.",
            "icon": "file-text",
        })
        add_edge("n-request-error", "n-final", "terminate", color="#ef4444")
        return FlowGraph(nodes=nodes, edges=edges)

    # ── Redirect handling ────────────────────────────────────────────────────
    if redirects:
        prev_id = "n-request"
        for i, redir in enumerate(redirects[:settings.max_redirects]):
            redir_id = f"n-redirect-{i}"
            redir_hostname = urlparse(redir).hostname or redir
            add_node(redir_id, f"Redirect {i+1}", "redirect", {
                "stage": "redirect",
                "stage_status": "completed",
                "destination": redir,
                "description": f"→ {redir_hostname}",
                "icon": "arrow-right-circle",
            })
            add_edge(prev_id, redir_id, "301/302", color="#f97316")
            prev_id = redir_id

    # ── Stage 6: HTTP Response Received ──────────────────────────────────────
    resp_event = find_event("response")
    status_code = (resp_event or {}).get("status_code", response_status or "?")
    content_type = (resp_event or {}).get("content_type", "")
    resp_size = (resp_event or {}).get("response_size_bytes")

    response_status_category = "completed"
    if isinstance(status_code, int):
        if status_code >= 500:
            response_status_category = "warning"
        elif status_code >= 400:
            response_status_category = "warning"

    add_node("n-response", f"Response Received", "response", {
        "stage": "response",
        "stage_status": response_status_category,
        "status_code": status_code,
        "content_type": content_type,
        "response_size_bytes": resp_size,
        "description": f"HTTP {status_code}" + (f" · {content_type.split(';')[0]}" if content_type else ""),
        "icon": "download",
        "redirect_count": len(redirects),
    })

    source_for_response = f"n-redirect-{len(redirects) - 1}" if redirects else "n-request"
    add_edge(source_for_response, "n-response", f"HTTP {status_code}", color="#22c55e" if isinstance(status_code, int) and status_code < 400 else "#f97316")

    # ── Stage 7: Security Analysis (parallel branches) ───────────────────────
    add_node("n-analysis", "Security Analysis", "analysis_hub", {
        "stage": "analysis",
        "stage_status": "completed",
        "description": "Four security vectors evaluated in parallel.",
        "icon": "search",
    })
    add_edge("n-response", "n-analysis", "analyze", color="#8b5cf6")

    # ── Branch A: TLS/HTTPS Security Check ───────────────────────────────────
    tls_counts = _count_check_findings(tls_result)
    tls_check_status = "completed"
    if not is_https:
        tls_check_status = "skipped"
    elif tls_result and tls_result.status == "fail":
        tls_check_status = "failed"
    elif tls_result and tls_result.status == "warning":
        tls_check_status = "warning"

    add_node("n-check-tls", "HTTPS / TLS Security", "security_check", {
        "stage": "check_tls",
        "stage_status": tls_check_status,
        "check_type": "tls",
        "check_label": _check_status_label(tls_result),
        "finding_count": tls_counts["total"],
        "findings_fail": tls_counts["fail"],
        "findings_warning": tls_counts["warning"],
        "findings_pass": tls_counts["pass"],
        "earned_points": tls_result.earned_points if tls_result else 0,
        "max_points": tls_result.max_points if tls_result else 30,
        "description": "Certificate validity, hostname match, TLS version, and protocol security.",
        "icon": "lock",
        "detail_items": tls_result.recommendations if tls_result else [],
    })
    add_edge("n-analysis", "n-check-tls", "TLS", color="#06b6d4")

    # ── Branch B: HTTP Security Headers Check ────────────────────────────────
    headers_result = test_results.get("headers")
    headers_counts = _count_check_findings(headers_result)
    headers_check_status = "completed"
    if headers_result and headers_result.status == "fail":
        headers_check_status = "failed"
    elif headers_result and headers_result.status == "warning":
        headers_check_status = "warning"
    elif not headers_result:
        headers_check_status = "skipped"

    add_node("n-check-headers", "HTTP Security Headers", "security_check", {
        "stage": "check_headers",
        "stage_status": headers_check_status,
        "check_type": "headers",
        "check_label": _check_status_label(headers_result),
        "finding_count": headers_counts["total"],
        "findings_fail": headers_counts["fail"],
        "findings_warning": headers_counts["warning"],
        "findings_pass": headers_counts["pass"],
        "earned_points": headers_result.earned_points if headers_result else 0,
        "max_points": headers_result.max_points if headers_result else 20,
        "description": "HSTS, CSP, X-Content-Type-Options, Cache-Control, and CORS evaluation.",
        "icon": "shield",
        "detail_items": headers_result.recommendations if headers_result else [],
    })
    add_edge("n-analysis", "n-check-headers", "Headers", color="#22c55e")

    # ── Branch C: Information Leakage Check ──────────────────────────────────
    leakage_result = test_results.get("leakage")
    leakage_counts = _count_check_findings(leakage_result)
    leakage_check_status = "completed"
    if leakage_result and leakage_result.status == "fail":
        leakage_check_status = "failed"
    elif leakage_result and leakage_result.status == "warning":
        leakage_check_status = "warning"
    elif not leakage_result:
        leakage_check_status = "skipped"

    add_node("n-check-leakage", "Information Leakage", "security_check", {
        "stage": "check_leakage",
        "stage_status": leakage_check_status,
        "check_type": "leakage",
        "check_label": _check_status_label(leakage_result),
        "finding_count": leakage_counts["total"],
        "findings_fail": leakage_counts["fail"],
        "findings_warning": leakage_counts["warning"],
        "findings_pass": leakage_counts["pass"],
        "earned_points": leakage_result.earned_points if leakage_result else 0,
        "max_points": leakage_result.max_points if leakage_result else 25,
        "description": "Stack traces, internal paths, sensitive data, debug info, and credential detection.",
        "icon": "eye",
        "detail_items": leakage_result.recommendations if leakage_result else [],
    })
    add_edge("n-analysis", "n-check-leakage", "Content", color="#eab308")

    # ── Branch D: Domain Reputation Check ────────────────────────────────────
    reputation_result = test_results.get("reputation")
    reputation_counts = _count_check_findings(reputation_result)
    reputation_check_status = "completed"
    if reputation_result and reputation_result.status == "fail":
        reputation_check_status = "failed"
    elif reputation_result and reputation_result.status == "warning":
        reputation_check_status = "warning"
    elif reputation_result and reputation_result.status == "inconclusive":
        reputation_check_status = "inconclusive"
    elif not reputation_result:
        reputation_check_status = "skipped"

    rep_evidence = reputation_result.evidence if reputation_result else {}
    active_providers = []
    if settings.virustotal_enabled:
        active_providers.append("VirusTotal")
    if settings.safe_browsing_enabled:
        active_providers.append("Google Safe Browsing")
    provider = ", ".join(active_providers) if active_providers else "Not configured"

    add_node("n-check-reputation", "Domain Reputation", "security_check", {
        "stage": "check_reputation",
        "stage_status": reputation_check_status,
        "check_type": "reputation",
        "check_label": _check_status_label(reputation_result),
        "finding_count": reputation_counts["total"],
        "findings_fail": reputation_counts["fail"],
        "findings_warning": reputation_counts["warning"],
        "findings_pass": reputation_counts["pass"],
        "earned_points": reputation_result.earned_points if reputation_result else 0,
        "max_points": reputation_result.max_points if reputation_result else 25,
        "provider": provider,
        "description": f"Threat intelligence feed ({provider}).",
        "icon": "activity",
        "detail_items": reputation_result.recommendations if reputation_result else [],
    })
    add_edge("n-analysis", "n-check-reputation", "Reputation", color="#a855f7")

    # ── Stage 8: Findings Correlation ────────────────────────────────────────
    total_findings = sum(
        _count_check_findings(test_results.get(k)).get("fail", 0) +
        _count_check_findings(test_results.get(k)).get("warning", 0)
        for k in ("tls", "headers", "leakage", "reputation")
    )

    correlation_status = "completed"
    if total_findings > 0:
        correlation_status = "warning"

    add_node("n-correlation", "Findings Correlation", "correlation", {
        "stage": "correlation",
        "stage_status": correlation_status,
        "finding_count": total_findings,
        "description": f"{total_findings} actionable finding(s) correlated across all security vectors." if total_findings > 0 else "No actionable findings detected.",
        "icon": "git-merge",
    })
    add_edge("n-check-tls", "n-correlation", "findings" if tls_counts["fail"] + tls_counts["warning"] > 0 else "", color="#06b6d4")
    add_edge("n-check-headers", "n-correlation", "findings" if headers_counts["fail"] + headers_counts["warning"] > 0 else "", color="#22c55e")
    add_edge("n-check-leakage", "n-correlation", "findings" if leakage_counts["fail"] + leakage_counts["warning"] > 0 else "", color="#eab308")
    add_edge("n-check-reputation", "n-correlation", "findings" if reputation_counts["fail"] + reputation_counts["warning"] > 0 else "", color="#a855f7")

    # ── Stage 9: Final Results ───────────────────────────────────────────────
    final_status = "completed"
    if total_findings > 0:
        final_status = "warning"

    final_desc = "All security checks completed."
    if duration_ms:
        final_desc += f" Total scan time: {duration_ms:.0f}ms."

    add_node("n-final", "Final Results", "final", {
        "stage": "final",
        "stage_status": final_status,
        "finding_count": total_findings,
        "duration_ms": duration_ms,
        "description": final_desc,
        "icon": "flag",
    })
    add_edge("n-correlation", "n-final", "complete", color="#22c55e" if total_findings == 0 else "#f97316")

    return FlowGraph(nodes=nodes, edges=edges)


# ── Findings by Severity ──────────────────────────────────────────────────────────

def count_findings_by_severity(test_results: Dict[str, TestResult]) -> FindingsBySeverity:
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0}
    for result in test_results.values():
        for finding in result.findings:
            sev = (finding.get("severity") or "").lower()
            if sev in counts and finding.get("status") in ("fail", "warning"):
                counts[sev] += 1
    return FindingsBySeverity(**counts)
