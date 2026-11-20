"""
app/scanners/tls_checker.py — Test 1: HTTPS and TLS Security (30 points).

Checks:
  - HTTPS usage
  - TLS certificate validity and trust (via httpx default verification)
  - Certificate hostname match
  - Certificate expiry date
  - Basic cipher / protocol info where available

Does NOT disable certificate verification to fake a pass.
"""
from __future__ import annotations

import ssl
import socket
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx

from app.schemas import TestResult


MAX_POINTS = 30

# Points allocated to individual sub-checks
_POINTS = {
    "https_scheme": 8,
    "cert_trusted": 10,
    "cert_hostname": 6,
    "cert_not_expired": 6,
}


def _get_cert_info(hostname: str, port: int = 443) -> Optional[Dict[str, Any]]:
    """Retrieve DER-encoded cert info from the server. Returns None on failure."""
    ctx = ssl.create_default_context()
    try:
        with ctx.wrap_socket(
            socket.create_connection((hostname, port), timeout=10),
            server_hostname=hostname,
        ) as ssock:
            cert = ssock.getpeercert()
            cipher = ssock.cipher()
            return {"cert": cert, "cipher": cipher}
    except ssl.SSLCertVerificationError as exc:
        return {"error": str(exc), "cert": None, "cipher": None}
    except Exception as exc:
        return {"error": str(exc), "cert": None, "cipher": None}


def _parse_cert_expiry(cert: Dict[str, Any]) -> Optional[datetime]:
    try:
        not_after = cert.get("notAfter")
        if not_after:
            return datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(
                tzinfo=timezone.utc
            )
    except Exception:
        pass
    return None


async def run(url: str) -> TestResult:
    parsed = urlparse(url)
    scheme = parsed.scheme.lower()
    hostname = parsed.hostname or ""
    port = parsed.port or (443 if scheme == "https" else 80)

    earned = 0.0
    findings: List[Dict[str, Any]] = []
    evidence: Dict[str, Any] = {"url": url, "scheme": scheme}
    recommendations: List[str] = []
    overall_status = "pass"

    # ── Check 1: HTTPS scheme ───────────────────────────────────────────────
    if scheme == "https":
        earned += _POINTS["https_scheme"]
        findings.append({
            "check": "HTTPS scheme",
            "status": "pass",
            "severity": None,
            "detail": "URL uses HTTPS.",
        })
    else:
        overall_status = "fail"
        findings.append({
            "check": "HTTPS scheme",
            "status": "fail",
            "severity": "high",
            "detail": "URL uses plain HTTP. All traffic is unencrypted and vulnerable to interception.",
        })
        recommendations.append(
            "Migrate to HTTPS with a valid TLS certificate from a trusted CA."
        )
        # TLS sub-checks cannot be performed on HTTP — mark inconclusive
        evidence["tls"] = "not_applicable"
        return TestResult(
            name="HTTPS and TLS Security",
            status="fail",
            earned_points=earned,
            max_points=MAX_POINTS,
            findings=findings,
            evidence=evidence,
            recommendations=recommendations,
        )

    # ── TLS certificate checks (HTTPS only) ────────────────────────────────
    cert_info = _get_cert_info(hostname, port)
    evidence["tls_info"] = {
        k: v for k, v in (cert_info or {}).items() if k != "cert"
    }

    if cert_info and cert_info.get("error") and not cert_info.get("cert"):
        # Certificate verification failed
        overall_status = "fail"
        findings.append({
            "check": "Certificate trust",
            "status": "fail",
            "severity": "critical",
            "detail": f"TLS verification failed: {cert_info['error']}",
        })
        recommendations.append(
            "Obtain a certificate from a publicly trusted Certificate Authority (CA) "
            "and ensure the chain is properly configured."
        )
        return TestResult(
            name="HTTPS and TLS Security",
            status="fail",
            earned_points=earned,
            max_points=MAX_POINTS,
            findings=findings,
            evidence=evidence,
            recommendations=recommendations,
        )

    cert = cert_info.get("cert") if cert_info else None
    cipher = cert_info.get("cipher") if cert_info else None

    if cipher:
        evidence["tls_info"]["cipher_name"] = cipher[0] if cipher else None
        evidence["tls_info"]["tls_version"] = cipher[1] if cipher and len(cipher) > 1 else None

    # ── Check 2: Certificate trusted ────────────────────────────────────────
    if cert:
        earned += _POINTS["cert_trusted"]
        findings.append({
            "check": "Certificate trust",
            "status": "pass",
            "severity": None,
            "detail": "Certificate is trusted by the system's CA bundle.",
        })
    else:
        overall_status = "fail"
        findings.append({
            "check": "Certificate trust",
            "status": "fail",
            "severity": "critical",
            "detail": "Could not retrieve a trusted certificate.",
        })
        recommendations.append("Ensure the certificate chain is correctly installed.")

    # ── Check 3: Hostname match ──────────────────────────────────────────────
    if cert:
        subject_alt_names = [
            v for key, v in cert.get("subjectAltName", []) if key == "DNS"
        ]
        subject_cn = dict(item for sublist in cert.get("subject", []) for item in sublist).get("commonName", "")
        evidence["tls_info"]["subject_alt_names"] = subject_alt_names
        evidence["tls_info"]["common_name"] = subject_cn

        # Python ssl already verified hostname; if we got here it matched
        earned += _POINTS["cert_hostname"]
        findings.append({
            "check": "Hostname match",
            "status": "pass",
            "severity": None,
            "detail": f"Certificate covers hostname '{hostname}'.",
        })

    # ── Check 4: Certificate expiry ──────────────────────────────────────────
    if cert:
        expiry = _parse_cert_expiry(cert)
        now = datetime.now(timezone.utc)
        evidence["tls_info"]["not_after"] = cert.get("notAfter")

        if expiry:
            days_remaining = (expiry - now).days
            evidence["tls_info"]["days_until_expiry"] = days_remaining

            if days_remaining < 0:
                overall_status = "fail"
                findings.append({
                    "check": "Certificate expiry",
                    "status": "fail",
                    "severity": "critical",
                    "detail": f"Certificate expired {abs(days_remaining)} days ago ({cert.get('notAfter')}).",
                })
                recommendations.append("Renew the TLS certificate immediately.")
            elif days_remaining < 30:
                if overall_status == "pass":
                    overall_status = "warning"
                findings.append({
                    "check": "Certificate expiry",
                    "status": "warning",
                    "severity": "medium",
                    "detail": f"Certificate expires in {days_remaining} days ({cert.get('notAfter')}). Renewal recommended.",
                })
                recommendations.append("Renew the certificate before it expires.")
            else:
                earned += _POINTS["cert_not_expired"]
                findings.append({
                    "check": "Certificate expiry",
                    "status": "pass",
                    "severity": None,
                    "detail": f"Certificate valid for {days_remaining} more days (expires {cert.get('notAfter')}).",
                })
        else:
            findings.append({
                "check": "Certificate expiry",
                "status": "inconclusive",
                "severity": None,
                "detail": "Could not parse certificate expiry date.",
            })
            if overall_status == "pass":
                overall_status = "warning"

    return TestResult(
        name="HTTPS and TLS Security",
        status=overall_status,
        earned_points=earned,
        max_points=MAX_POINTS,
        findings=findings,
        evidence=evidence,
        recommendations=recommendations,
    )
