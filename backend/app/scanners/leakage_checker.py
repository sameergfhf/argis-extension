"""
app/scanners/leakage_checker.py — Test 3: Information Leakage (25 points).

Inspects bounded response content for leaked secrets, stack traces, debug info,
internal paths, database errors, and sensitive JSON fields.

Rules:
- Uses conservative pattern matching with confidence scoring.
- Redacts detected secrets before including them in reports.
- Enforces response-size limits and processing timeouts.
- Clearly communicates that only observed response content was analyzed.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Dict, List, Optional, Tuple

from app.schemas import TestResult
from app.security.redaction import redact_text, redact_value

MAX_POINTS = 25
MAX_ANALYSIS_BYTES = 524_288  # 512 KB
MAX_ANALYSIS_TIME_S = 5.0

# ── Detection Rules ─────────────────────────────────────────────────────────────
# Each rule: (name, pattern, severity, confidence, why_it_matters, points_deducted)
# Points are deducted from 25 maximum; 0 means informational only.

_TEXT_RULES: List[Dict[str, Any]] = [
    {
        "name": "AWS Access Key",
        "pattern": re.compile(r'\bAKIA[0-9A-Z]{16}\b'),
        "severity": "critical",
        "confidence": "confirmed",
        "points": 10,
        "why": "An AWS Access Key ID was found in the response body. If accompanied by a secret key, this could allow unauthorized AWS resource access.",
        "remediation": "Immediately revoke this credential and audit all systems that had access to it. Never embed AWS credentials in API responses.",
    },
    {
        "name": "Generic API Key / Token",
        "pattern": re.compile(
            r'(?i)(?:api[_\-]?key|access[_\-]?token|auth[_\-]?token|secret[_\-]?key|bearer)\s*[=:]\s*["\']?([A-Za-z0-9\-_.~+/]{20,})["\']?'
        ),
        "severity": "critical",
        "confidence": "likely",
        "points": 8,
        "why": "A field resembling an API key or access token was found in the response. If genuine, this credential could allow unauthorized access.",
        "remediation": "Remove credential values from API responses. Use short-lived tokens and rotate any exposed credentials immediately.",
    },
    {
        "name": "JWT Token",
        "pattern": re.compile(r'\beyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b'),
        "severity": "high",
        "confidence": "confirmed",
        "points": 7,
        "why": "A JSON Web Token was found in the response body. Exposing JWTs allows token theft and potential unauthorized access.",
        "remediation": "Return tokens only through secure, appropriate channels. Avoid including them in general API responses.",
    },
    {
        "name": "Private Key Material",
        "pattern": re.compile(r'-----BEGIN [A-Z ]+PRIVATE KEY-----'),
        "severity": "critical",
        "confidence": "confirmed",
        "points": 10,
        "why": "Private key material was found in the response. This is a critical exposure that can lead to complete compromise.",
        "remediation": "Immediately revoke and replace the exposed key. Investigate how private key material appeared in the response.",
    },
    {
        "name": "Stack Trace",
        "pattern": re.compile(
            r'(?i)(?:Traceback \(most recent call last\)|at\s+[\w.$]+\([\w.]+:\d+\)|Exception in thread|java\.lang\.|\.py", line \d+)',
            re.MULTILINE,
        ),
        "severity": "medium",
        "confidence": "likely",
        "points": 5,
        "why": "A stack trace in the response reveals internal code structure, file paths, and potentially sensitive implementation details.",
        "remediation": "Disable detailed error output in production. Return generic error messages to clients.",
    },
    {
        "name": "Internal File Path",
        "pattern": re.compile(
            r'(?i)(?:/home/|/var/|/etc/|/usr/|/opt/|C:\\\\Users\\\\|C:\\\\Windows\\\\|/root/)'
        ),
        "severity": "low",
        "confidence": "possible",
        "points": 3,
        "why": "An internal filesystem path was found in the response, revealing server directory structure.",
        "remediation": "Avoid including filesystem paths in error messages or API responses.",
    },
    {
        "name": "Database Error Message",
        "pattern": re.compile(
            r'(?i)(?:SQL syntax|mysql_fetch|pg_query|ORA-\d+|SQLSTATE|sqlite3\.OperationalError|relation .+ does not exist)',
        ),
        "severity": "high",
        "confidence": "likely",
        "points": 6,
        "why": "A database error message was found in the response, revealing the database type, schema details, and potential injection points.",
        "remediation": "Suppress all raw database errors in production API responses. Log them server-side and return a generic error message.",
    },
    {
        "name": "Password Field in Response",
        "pattern": re.compile(
            r'(?i)(?:"password"\s*:\s*"[^"]{3,}"|"passwd"\s*:\s*"[^"]{3,}"|"pwd"\s*:\s*"[^"]{3,}")'
        ),
        "severity": "critical",
        "confidence": "likely",
        "points": 8,
        "why": "A field named 'password' with a non-empty value was found in the response. Passwords should never be returned in API responses.",
        "remediation": "Remove password fields from API responses. If hashed values must be compared, do so server-side only.",
    },
    {
        "name": "Debug Mode / Development Info",
        "pattern": re.compile(
            r'(?i)(?:debug\s*[:=]\s*true|development\s*mode|werkzeug|django\.debug|flask\.debug)',
        ),
        "severity": "medium",
        "confidence": "possible",
        "points": 4,
        "why": "Debug mode indicators were found, suggesting the application may be running with developer settings enabled in production.",
        "remediation": "Disable debug mode in production deployments.",
    },
]

# JSON keys that should never have non-null values in responses
_SENSITIVE_JSON_KEYS = {
    "password", "passwd", "pwd", "secret", "private_key", "access_secret",
    "client_secret", "token_secret",
}


def _check_json_keys(body: str) -> List[Dict[str, Any]]:
    """Look for sensitive keys with non-empty values in a JSON body."""
    findings = []
    try:
        data = json.loads(body)
    except Exception:
        return findings

    def _walk(obj: Any, path: str = "") -> None:
        if isinstance(obj, dict):
            for k, v in obj.items():
                full_key = f"{path}.{k}" if path else k
                if k.lower() in _SENSITIVE_JSON_KEYS and v not in (None, "", [], {}):
                    findings.append({
                        "name": f"Sensitive JSON key '{k}'",
                        "path": full_key,
                        "severity": "critical",
                        "confidence": "likely",
                        "points": 8,
                        "why": f"The JSON response contains a field '{full_key}' with a non-empty value. This field name strongly suggests sensitive data.",
                        "remediation": f"Remove or null the '{k}' field from API responses.",
                        "evidence": f"Key '{full_key}' present with non-empty value",
                    })
                _walk(v, full_key)
        elif isinstance(obj, list):
            for i, item in enumerate(obj[:20]):  # limit iteration
                _walk(item, f"{path}[{i}]")

    _walk(data)
    return findings


async def run(response_body: str, content_type: str) -> TestResult:
    start = time.monotonic()
    earned = MAX_POINTS
    findings: List[Dict[str, Any]] = []
    evidence: Dict[str, Any] = {
        "analyzed_bytes": len(response_body.encode("utf-8", errors="replace")),
        "content_type": content_type,
        "note": "Only observable response content was analyzed. The absence of findings does not guarantee the API is free of leakage in other endpoints or error conditions.",
    }
    recommendations: List[str] = []
    overall_status = "pass"
    deducted_keys: set = set()  # Prevent double-counting

    # Truncate if needed
    body = response_body[:MAX_ANALYSIS_BYTES]

    # ── Text pattern checks ─────────────────────────────────────────────────
    for rule in _TEXT_RULES:
        if time.monotonic() - start > MAX_ANALYSIS_TIME_S:
            findings.append({
                "check": "Analysis timeout",
                "status": "inconclusive",
                "detail": "Analysis time limit reached. Not all patterns were checked.",
            })
            break

        match = rule["pattern"].search(body)
        if match:
            redacted_evidence = redact_text(match.group(0))
            key = rule["name"]
            if key not in deducted_keys:
                deduction = min(rule["points"], earned)
                earned -= deduction
                deducted_keys.add(key)

            overall_status = "fail"
            findings.append({
                "check": rule["name"],
                "status": "fail",
                "severity": rule["severity"],
                "confidence": rule["confidence"],
                "evidence": f"Pattern matched: {redacted_evidence}",
                "why_it_matters": rule["why"],
                "remediation": rule["remediation"],
                "points_deducted": rule["points"],
            })
            recommendations.append(rule["remediation"])

    # ── JSON-specific key checks ────────────────────────────────────────────
    if "json" in content_type.lower():
        json_findings = _check_json_keys(body)
        for jf in json_findings:
            key = jf["name"]
            if key not in deducted_keys:
                deduction = min(jf["points"], earned)
                earned -= deduction
                deducted_keys.add(key)

            overall_status = "fail"
            findings.append({
                "check": jf["name"],
                "status": "fail",
                "severity": jf["severity"],
                "confidence": jf["confidence"],
                "evidence": jf["evidence"],
                "why_it_matters": jf["why"],
                "remediation": jf["remediation"],
                "points_deducted": jf["points"],
            })
            recommendations.append(jf["remediation"])

    # Ensure earned doesn't go below 0
    earned = max(0.0, earned)

    if not findings:
        findings.append({
            "check": "Information leakage",
            "status": "pass",
            "detail": "No obvious leakage patterns detected in the observed response content.",
        })

    return TestResult(
        name="Information Leakage",
        status=overall_status,
        earned_points=earned,
        max_points=MAX_POINTS,
        findings=findings,
        evidence=evidence,
        recommendations=list(set(recommendations)),
    )
