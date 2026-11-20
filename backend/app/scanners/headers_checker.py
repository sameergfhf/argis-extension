"""
app/scanners/headers_checker.py — Test 2: HTTP Security Headers (20 points).

Context-aware evaluation rules
────────────────────────────────
Each check has one of four statuses:

  PASS            — Header is present and correctly configured.
  FAIL            — Header is required for this response context and is absent/misconfigured.
  WARNING         — Header would improve security but its absence is not a definitive control gap.
  NOT_APPLICABLE  — Header has no security relevance for this response type; no points awarded
                    or deducted, and the absence is not reported as a problem.

Applicability model
───────────────────
Response context is inferred from:
  - Content-Type (JSON, HTML, binary, text)
  - Authorization signal: presence of an Authorization/Cookie request header in the scan is
    unknown, but we can detect response signals such as Set-Cookie, WWW-Authenticate,
    or X-Auth-* response headers that suggest the endpoint handles authentication.
  - Cache-control directive classification (public vs private data)

Header-specific rules
─────────────────────
Strict-Transport-Security  — Applicable to all HTTPS responses (already filtered by TLS check).
                             FAIL if absent or max-age=0.

X-Content-Type-Options     — Applicable to all responses. Prevents MIME sniffing.
                             FAIL if not "nosniff".

Content-Security-Policy    — Applicable to HTML responses (browser rendering risk exists).
                             NOT_APPLICABLE for JSON/binary responses unless the CSP header
                             is already present (in which case PASS is awarded as a bonus).
                             Never FAIL for a JSON-only API.

Cache-Control              — Contextual:
                               • If the response signals personalised or authenticated data
                                 (Set-Cookie, X-Auth-*, X-User-*, Content-Location, Vary: Authorization)
                                 → FAIL if no-store/private/no-cache is absent.
                               • If the response appears to be public/cacheable data
                                 (no auth signals, explicit public or max-age directive)
                                 → PASS (caching is acceptable for public data).
                               • If there are no clear signals either way
                                 → WARNING if the directive is absent or permissive.

X-Frame-Options            — Applicable only to HTML responses.
                             NOT_APPLICABLE for JSON/binary responses.
                             If present for a JSON API, award credit as a bonus PASS.

Scoring
───────
Maximum points: 20
  HSTS            6  (always applicable)
  X-Content-Type  4  (always applicable)
  CSP             4  (HTML only; bonus credit for JSON)
  Cache-Control   4  (contextual weighting, see above)
  X-Frame-Options 2  (HTML only; bonus credit for JSON)

For NOT_APPLICABLE checks the points are simply not included in the denominator
(they neither add to earned_points nor to max assessed points).  The TestResult
max_points field reflects the full 20 so the scoring engine can compute coverage
correctly; assessed_points is computed in scoring.py based on the overall status.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

import httpx

from app.schemas import TestResult

# ── Constants ───────────────────────────────────────────────────────────────────

MAX_POINTS = 20

# Statuses used internally
PASS = "pass"
FAIL = "fail"
WARNING = "warning"
NOT_APPLICABLE = "not_applicable"

# Auth-signal response headers: presence suggests the endpoint handles credentials
# or returns personalised data that must not be cached publicly.
_AUTH_SIGNAL_HEADERS: Set[str] = {
    "set-cookie",
    "www-authenticate",
    "x-auth-token",
    "x-user-id",
    "x-user-name",
    "x-authenticated-user",
    "x-account-id",
    "authorization",          # rare in responses but possible
}

# Cache directives that indicate the response signals personal / sensitive data
_PRIVATE_CACHE_SIGNALS = {"no-store", "private", "no-cache"}

# Cache directives that explicitly declare the resource is public
_PUBLIC_CACHE_SIGNALS = {"public", "s-maxage"}


# ── Content-type helpers ────────────────────────────────────────────────────────

def _is_html(content_type: str) -> bool:
    return "text/html" in content_type.lower()


def _is_json(content_type: str) -> bool:
    ct = content_type.lower()
    return "application/json" in ct or "application/ld+json" in ct or "+json" in ct


def _is_binary(content_type: str) -> bool:
    ct = content_type.lower()
    return any(
        t in ct
        for t in (
            "image/", "video/", "audio/",
            "application/octet-stream",
            "application/zip",
            "application/pdf",
            "application/wasm",
        )
    )


# ── Auth-signal detection ───────────────────────────────────────────────────────

def _response_has_auth_signals(headers: Dict[str, str]) -> bool:
    """Return True if the response headers suggest personalised / authenticated data."""
    header_keys = set(headers.keys())
    return bool(header_keys & _AUTH_SIGNAL_HEADERS)


def _response_has_vary_authorization(headers: Dict[str, str]) -> bool:
    vary = headers.get("vary", "")
    return "authorization" in vary.lower() or "cookie" in vary.lower()


# ── Cache-Control context classifier ───────────────────────────────────────────

def _cache_control_context(
    cache_value: Optional[str],
    has_auth_signals: bool,
    has_vary_auth: bool,
) -> tuple[str, str, str]:
    """
    Return (status, detail, recommendation) for Cache-Control.

    Decision matrix:
    ┌──────────────────────────┬──────────────────────────┬──────────────┐
    │ Auth signals present?    │ Cache-Control value       │ Status       │
    ├──────────────────────────┼──────────────────────────┼──────────────┤
    │ Yes                      │ no-store/private/no-cache │ PASS         │
    │ Yes                      │ public / absent           │ FAIL         │
    │ No                       │ no-store/private/no-cache │ PASS         │
    │ No                       │ public (explicit)         │ PASS         │
    │ No                       │ absent                    │ WARNING      │
    │ No                       │ permissive (max-age only) │ WARNING      │
    └──────────────────────────┴──────────────────────────┴──────────────┘
    """
    is_sensitive = has_auth_signals or has_vary_auth

    if cache_value is not None:
        cv_lower = cache_value.lower()
        has_private = any(d in cv_lower for d in _PRIVATE_CACHE_SIGNALS)
        has_public  = any(d in cv_lower for d in _PUBLIC_CACHE_SIGNALS)
    else:
        has_private = False
        has_public  = False

    if is_sensitive:
        if has_private:
            return (
                PASS,
                "Cache-Control correctly restricts caching for a response with authentication signals "
                f"(directive: '{cache_value}').",
                "",
            )
        else:
            present = f"'{cache_value}'" if cache_value else "absent"
            return (
                FAIL,
                f"Cache-Control is {present} but the response carries authentication signals "
                "(Set-Cookie or similar). Sensitive responses must include no-store, private, or no-cache.",
                "Set 'Cache-Control: no-store' or 'private' on responses that contain "
                "session tokens, cookies, or personalised data.",
            )
    else:
        # No strong auth signals — public data is acceptable to cache
        if has_private:
            return (
                PASS,
                f"Cache-Control restricts caching ('{cache_value}'). "
                "Conservative policy — no auth signals detected in this response.",
                "",
            )
        if has_public or (cache_value and "max-age" in cache_value.lower()):
            return (
                PASS,
                f"Cache-Control allows caching ('{cache_value}'). "
                "No authentication signals detected; caching of this response appears appropriate.",
                "",
            )
        # Header absent or minimal
        detail = (
            f"Cache-Control is {'absent' if cache_value is None else repr(cache_value)}. "
            "No authentication signals were detected in this response, so intermediary caching "
            "may be acceptable. However, if this endpoint can return personalised data under "
            "certain conditions, add an explicit Cache-Control directive."
        )
        return (
            WARNING,
            detail,
            "Consider adding an explicit Cache-Control directive. Use 'no-store' or 'private' "
            "if the response can contain user-specific data; use 'public, max-age=N' for "
            "genuinely cacheable public resources.",
        )


# ── Main runner ─────────────────────────────────────────────────────────────────

async def run(response: httpx.Response) -> TestResult:
    """Evaluate HTTP security headers with full context awareness."""
    headers: Dict[str, str] = {k.lower(): v for k, v in response.headers.items()}
    content_type = headers.get("content-type", "")

    is_html   = _is_html(content_type)
    is_json   = _is_json(content_type)
    is_binary = _is_binary(content_type)
    has_auth  = _response_has_auth_signals(headers)
    has_vary  = _response_has_vary_authorization(headers)

    # Build observed-headers evidence (only the security-relevant ones)
    security_header_names = {
        "strict-transport-security", "x-content-type-options",
        "content-security-policy", "cache-control", "x-frame-options",
    }
    observed = {k: v for k, v in headers.items() if k in security_header_names}

    evidence: Dict[str, Any] = {
        "content_type": content_type,
        "response_context": {
            "is_html": is_html,
            "is_json": is_json,
            "is_binary": is_binary,
            "has_auth_signals": has_auth,
            "has_vary_authorization": has_vary,
            "inferred_data_sensitivity": "sensitive" if (has_auth or has_vary) else "unknown/public",
        },
        "observed_security_headers": observed,
    }

    earned  = 0.0
    findings: List[Dict[str, Any]] = []
    recommendations: List[str] = []
    # Track only FAIL and WARNING for overall status — NOT_APPLICABLE is neutral
    effective_statuses: List[str] = []

    # ── 1. Strict-Transport-Security (6 pts) — always applicable ────────────────
    hsts_val = headers.get("strict-transport-security")
    if hsts_val and "max-age" in hsts_val.lower():
        # Warn if max-age is very short (< 1 day = 86400 s)
        try:
            age_str = [p for p in hsts_val.lower().split(";") if "max-age" in p][0]
            age_val = int(age_str.split("=")[1].strip())
            if age_val == 0:
                effective_statuses.append(FAIL)
                earned_hsts = 0.0
                findings.append({
                    "check": "Strict-Transport-Security",
                    "status": FAIL,
                    "severity": "medium",
                    "applicable": True,
                    "detail": "HSTS header is present but max-age=0 disables it.",
                    "value": hsts_val,
                    "rule": "OWASP ASVS V9.2.1",
                })
                recommendations.append(
                    "Set 'Strict-Transport-Security: max-age=63072000; includeSubDomains' "
                    "to enforce HTTPS for at least two years."
                )
            elif age_val < 86_400:
                effective_statuses.append(WARNING)
                earned_hsts = 3.0  # partial credit
                findings.append({
                    "check": "Strict-Transport-Security",
                    "status": WARNING,
                    "severity": "low",
                    "applicable": True,
                    "detail": f"HSTS max-age is very short ({age_val}s). Recommend at least 31536000 (1 year).",
                    "value": hsts_val,
                    "rule": "OWASP ASVS V9.2.1",
                })
                recommendations.append("Increase HSTS max-age to at least 31536000 seconds (1 year).")
            else:
                effective_statuses.append(PASS)
                earned_hsts = 6.0
                findings.append({
                    "check": "Strict-Transport-Security",
                    "status": PASS,
                    "severity": None,
                    "applicable": True,
                    "detail": f"HSTS present with max-age={age_val}s.",
                    "value": hsts_val,
                })
        except (IndexError, ValueError):
            effective_statuses.append(PASS)
            earned_hsts = 6.0
            findings.append({
                "check": "Strict-Transport-Security",
                "status": PASS,
                "severity": None,
                "applicable": True,
                "detail": "HSTS header present with max-age directive.",
                "value": hsts_val,
            })
    else:
        effective_statuses.append(FAIL)
        earned_hsts = 0.0
        findings.append({
            "check": "Strict-Transport-Security",
            "status": FAIL,
            "severity": "medium",
            "applicable": True,
            "detail": "Strict-Transport-Security header is missing or does not contain max-age.",
            "value": hsts_val,
            "rule": "OWASP ASVS V9.2.1",
        })
        recommendations.append(
            "Add 'Strict-Transport-Security: max-age=63072000; includeSubDomains; preload' "
            "to instruct clients to always use HTTPS."
        )
    earned += earned_hsts

    # ── 2. X-Content-Type-Options (4 pts) — always applicable ──────────────────
    xcto_val = headers.get("x-content-type-options")
    if xcto_val and xcto_val.strip().lower() == "nosniff":
        effective_statuses.append(PASS)
        earned += 4.0
        findings.append({
            "check": "X-Content-Type-Options",
            "status": PASS,
            "severity": None,
            "applicable": True,
            "detail": "X-Content-Type-Options: nosniff is set.",
            "value": xcto_val,
        })
    else:
        effective_statuses.append(FAIL)
        findings.append({
            "check": "X-Content-Type-Options",
            "status": FAIL,
            "severity": "low",
            "applicable": True,
            "detail": (
                "X-Content-Type-Options header is missing or not set to 'nosniff'. "
                f"Observed: {repr(xcto_val) if xcto_val else 'absent'}."
            ),
            "value": xcto_val,
            "rule": "OWASP ASVS V14.4.4",
        })
        recommendations.append(
            "Set 'X-Content-Type-Options: nosniff' to prevent MIME-type sniffing attacks."
        )

    # ── 3. Content-Security-Policy (4 pts) — HTML required; JSON informational ──
    csp_val = headers.get("content-security-policy")
    if is_html:
        # CSP is a real control gap for HTML responses
        if csp_val and len(csp_val.strip()) > 0:
            effective_statuses.append(PASS)
            earned += 4.0
            findings.append({
                "check": "Content-Security-Policy",
                "status": PASS,
                "severity": None,
                "applicable": True,
                "detail": f"CSP header is present for an HTML response: '{csp_val[:120]}'.",
                "value": csp_val,
            })
        else:
            effective_statuses.append(FAIL)
            findings.append({
                "check": "Content-Security-Policy",
                "status": FAIL,
                "severity": "medium",
                "applicable": True,
                "detail": (
                    "Content-Security-Policy is absent. This endpoint returns HTML, "
                    "which can be rendered by browsers. A CSP significantly reduces XSS impact."
                ),
                "value": None,
                "rule": "OWASP ASVS V14.4.3",
            })
            recommendations.append(
                "Add a Content-Security-Policy header to all HTML responses to mitigate XSS risks."
            )
    else:
        # JSON, binary, or other non-HTML content
        if csp_val and len(csp_val.strip()) > 0:
            # Present as a bonus — good practice but not required
            effective_statuses.append(PASS)
            earned += 4.0
            findings.append({
                "check": "Content-Security-Policy",
                "status": PASS,
                "severity": None,
                "applicable": False,
                "detail": (
                    f"CSP header is set ('{csp_val[:120]}'). "
                    "Not required for this non-HTML response type, but awarded as a defence-in-depth measure."
                ),
                "value": csp_val,
            })
        else:
            # NOT_APPLICABLE — do not count against the score
            findings.append({
                "check": "Content-Security-Policy",
                "status": NOT_APPLICABLE,
                "severity": None,
                "applicable": False,
                "detail": (
                    f"Content-Security-Policy is not applicable to this response "
                    f"(Content-Type: {content_type or 'unknown'}). "
                    "CSP is a browser rendering control; JSON and binary responses are not rendered as documents. "
                    "No points deducted."
                ),
                "value": None,
            })
            # Not added to effective_statuses — neutral

    # ── 4. Cache-Control (4 pts) — context-dependent ────────────────────────────
    cache_val = headers.get("cache-control")
    cc_status, cc_detail, cc_rec = _cache_control_context(cache_val, has_auth, has_vary)

    if cc_status == PASS:
        effective_statuses.append(PASS)
        earned += 4.0
    elif cc_status == FAIL:
        effective_statuses.append(FAIL)
        if cc_rec:
            recommendations.append(cc_rec)
    else:  # WARNING
        effective_statuses.append(WARNING)
        if cc_rec:
            recommendations.append(cc_rec)

    findings.append({
        "check": "Cache-Control",
        "status": cc_status,
        "severity": "medium" if cc_status == FAIL else ("low" if cc_status == WARNING else None),
        "applicable": True,
        "detail": cc_detail,
        "value": cache_val,
        "context": {
            "has_auth_signals": has_auth,
            "has_vary_authorization": has_vary,
            "inferred_sensitivity": "sensitive" if (has_auth or has_vary) else "public/unknown",
        },
        **({"rule": "OWASP ASVS V8.3.4"} if cc_status in (FAIL, WARNING) else {}),
    })

    # ── 5. X-Frame-Options (2 pts) — HTML required; JSON informational ──────────
    xfo_val = headers.get("x-frame-options")
    if is_html:
        if xfo_val and xfo_val.strip().upper() in ("DENY", "SAMEORIGIN"):
            effective_statuses.append(PASS)
            earned += 2.0
            findings.append({
                "check": "X-Frame-Options",
                "status": PASS,
                "severity": None,
                "applicable": True,
                "detail": f"X-Frame-Options: {xfo_val.strip().upper()} set correctly for HTML response.",
                "value": xfo_val,
            })
        else:
            effective_statuses.append(FAIL)
            present = f"'{xfo_val}'" if xfo_val else "absent"
            findings.append({
                "check": "X-Frame-Options",
                "status": FAIL,
                "severity": "low",
                "applicable": True,
                "detail": (
                    f"X-Frame-Options is {present}. This HTML response could be embedded in "
                    "an iframe by a third-party page, enabling clickjacking attacks."
                ),
                "value": xfo_val,
                "rule": "OWASP ASVS V14.4.2",
            })
            recommendations.append(
                "Set 'X-Frame-Options: DENY' or use 'Content-Security-Policy: frame-ancestors none' "
                "to prevent clickjacking on HTML responses."
            )
    else:
        if xfo_val and xfo_val.strip().upper() in ("DENY", "SAMEORIGIN"):
            # Present as a bonus for non-HTML responses
            effective_statuses.append(PASS)
            earned += 2.0
            findings.append({
                "check": "X-Frame-Options",
                "status": PASS,
                "severity": None,
                "applicable": False,
                "detail": (
                    f"X-Frame-Options: {xfo_val.strip().upper()} is present. "
                    "Not required for non-HTML responses, but awarded as a defence-in-depth measure."
                ),
                "value": xfo_val,
            })
        else:
            # NOT_APPLICABLE — non-HTML responses cannot be framed
            findings.append({
                "check": "X-Frame-Options",
                "status": NOT_APPLICABLE,
                "severity": None,
                "applicable": False,
                "detail": (
                    "X-Frame-Options is not applicable to this response "
                    f"(Content-Type: {content_type or 'unknown'}). "
                    "Only HTML responses can be embedded in iframes. No points deducted."
                ),
                "value": xfo_val,
            })
            # Not added to effective_statuses — neutral

    # ── Overall status ──────────────────────────────────────────────────────────
    if FAIL in effective_statuses:
        overall_status = FAIL
    elif WARNING in effective_statuses:
        overall_status = WARNING
    elif all(s == PASS for s in effective_statuses) and effective_statuses:
        overall_status = PASS
    else:
        # All checks were NOT_APPLICABLE or mixed inconclusive — shouldn't happen
        # but guard against empty list
        overall_status = WARNING

    return TestResult(
        name="HTTP Security Headers",
        status=overall_status,
        earned_points=round(earned, 1),
        max_points=MAX_POINTS,
        findings=findings,
        evidence=evidence,
        recommendations=list(dict.fromkeys(recommendations)),  # deduplicated, ordered
    )
