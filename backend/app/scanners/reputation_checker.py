"""
app/scanners/reputation_checker.py — Test 4: Domain & Redirect Reputation (25 points).

Checks the submitted hostname and redirect destinations against VirusTotal.
Clearly distinguishes:
  - Threat match (malicious / suspicious)
  - No known threat found
  - Unknown (API unavailable, quota exceeded, or key not configured)

Does NOT follow redirects blindly — each destination is validated through
url_validation before being queried.
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx

from app.config import get_settings
from app.schemas import TestResult
from app.security.url_validation import validate_redirect_destination, URLValidationError

MAX_POINTS = 25
_VT_URL = "https://www.virustotal.com/api/v3/domains/{domain}"
_VT_URL_LOOKUP = "https://www.virustotal.com/api/v3/urls"
_GSB_URL = "https://safebrowsing.googleapis.com/v4/threatMatches:find"


async def _query_virustotal_domain(client: httpx.AsyncClient, domain: str) -> Dict[str, Any]:
    """Query VT domain report. Returns result dict with status and raw data."""
    settings = get_settings()
    if not settings.virustotal_enabled:
        return {"status": "unavailable", "reason": "VirusTotal API key not configured."}

    try:
        resp = await client.get(
            _VT_URL.format(domain=domain),
            headers={"x-apikey": settings.virustotal_api_key},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            stats = data.get("data", {}).get("attributes", {}).get("last_analysis_stats", {})
            malicious = stats.get("malicious", 0)
            suspicious = stats.get("suspicious", 0)
            harmless = stats.get("harmless", 0)
            undetected = stats.get("undetected", 0)
            total = malicious + suspicious + harmless + undetected

            return {
                "status": "threat" if malicious > 0 else ("suspicious" if suspicious > 0 else "clean"),
                "malicious_votes": malicious,
                "suspicious_votes": suspicious,
                "harmless_votes": harmless,
                "total_engines": total,
                "reputation": data.get("data", {}).get("attributes", {}).get("reputation", None),
            }
        elif resp.status_code == 404:
            return {"status": "unknown", "reason": "Domain not found in VirusTotal database."}
        elif resp.status_code == 429:
            return {"status": "unavailable", "reason": "VirusTotal rate limit exceeded."}
        else:
            return {"status": "unavailable", "reason": f"VirusTotal returned HTTP {resp.status_code}."}
    except httpx.TimeoutException:
        return {"status": "unavailable", "reason": "VirusTotal request timed out."}
    except Exception as exc:
        return {"status": "unavailable", "reason": f"VirusTotal query failed: {exc}"}


async def _query_google_safe_browsing(client: httpx.AsyncClient, urls: List[str]) -> Dict[str, Any]:
    """Query Google Safe Browsing Lookup API v4 for threat matches."""
    settings = get_settings()
    if not settings.safe_browsing_enabled:
        return {"status": "unavailable", "reason": "Google Safe Browsing API key not configured."}

    valid_urls = [u for u in urls if u and isinstance(u, str)]
    if not valid_urls:
        return {"status": "clean", "matches": []}

    try:
        payload = {
            "client": {"clientId": "api-sentinel", "clientVersion": "1.0.0"},
            "threatInfo": {
                "threatTypes": [
                    "MALWARE",
                    "SOCIAL_ENGINEERING",
                    "UNWANTED_SOFTWARE",
                    "POTENTIALLY_HARMFUL_APPLICATION",
                ],
                "platformTypes": ["ANY_PLATFORM"],
                "threatEntryTypes": ["URL"],
                "threatEntries": [{"url": u} for u in valid_urls],
            },
        }
        resp = await client.post(
            f"{_GSB_URL}?key={settings.google_safe_browsing_api_key}",
            json=payload,
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            matches = data.get("matches", [])
            if matches:
                threat_types = sorted(list({m.get("threatType") for m in matches if m.get("threatType")}))
                return {
                    "status": "threat",
                    "matches": matches,
                    "threat_types": threat_types,
                }
            return {"status": "clean", "matches": []}
        elif resp.status_code == 400:
            return {"status": "unavailable", "reason": "Google Safe Browsing invalid request format."}
        elif resp.status_code == 403:
            return {"status": "unavailable", "reason": "Google Safe Browsing key invalid or unauthorized."}
        elif resp.status_code == 429:
            return {"status": "unavailable", "reason": "Google Safe Browsing quota exceeded."}
        else:
            return {"status": "unavailable", "reason": f"Google Safe Browsing returned HTTP {resp.status_code}."}
    except httpx.TimeoutException:
        return {"status": "unavailable", "reason": "Google Safe Browsing request timed out."}
    except Exception as exc:
        return {"status": "unavailable", "reason": f"Google Safe Browsing query failed: {exc}"}


async def run(
    url: str,
    redirect_destinations: Optional[List[str]] = None,
) -> TestResult:
    settings = get_settings()
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    redirect_destinations = redirect_destinations or []

    active_providers: List[str] = []
    if settings.virustotal_enabled:
        active_providers.append("VirusTotal")
    if settings.safe_browsing_enabled:
        active_providers.append("Google Safe Browsing")

    provider_str = ", ".join(active_providers) if active_providers else "none"

    earned = MAX_POINTS
    findings: List[Dict[str, Any]] = []
    evidence: Dict[str, Any] = {
        "queried_domain": hostname,
        "redirect_destinations": redirect_destinations,
        "provider": provider_str,
        "active_providers": active_providers,
    }
    recommendations: List[str] = []
    overall_status = "pass"

    # Always document the Threat Intelligence Provider configuration
    if active_providers:
        findings.append({
            "check": "Threat intelligence provider",
            "status": "pass",
            "severity": None,
            "detail": f"Active threat intelligence feed(s): {provider_str}.",
        })
    else:
        overall_status = "inconclusive"
        findings.append({
            "check": "Threat intelligence provider",
            "status": "inconclusive",
            "severity": None,
            "detail": "No threat intelligence API key configured. Configure VIRUSTOTAL_API_KEY or GOOGLE_SAFE_BROWSING_API_KEY in .env to enable reputation checks.",
        })
        earned = 0.0

    async with httpx.AsyncClient() as client:
        # ── 1. VirusTotal Domain Check ──────────────────────────────────────
        if settings.virustotal_enabled:
            vt_result = await _query_virustotal_domain(client, hostname)
            evidence["virustotal_domain_result"] = vt_result

            if vt_result["status"] == "threat":
                earned -= 20
                overall_status = "fail"
                findings.append({
                    "check": f"Domain reputation: {hostname}",
                    "status": "fail",
                    "severity": "critical",
                    "confidence": "confirmed",
                    "detail": (
                        f"VirusTotal flagged '{hostname}' as malicious "
                        f"({vt_result['malicious_votes']} engines)."
                    ),
                    "why_it_matters": "The domain is identified as malicious by multiple threat intelligence engines.",
                    "remediation": "Do not interact with this API. Investigate whether this domain has been compromised.",
                })
            elif vt_result["status"] == "suspicious":
                earned -= 10
                if overall_status != "fail":
                    overall_status = "warning"
                findings.append({
                    "check": f"Domain reputation: {hostname}",
                    "status": "warning",
                    "severity": "high",
                    "confidence": "likely",
                    "detail": (
                        f"VirusTotal flagged '{hostname}' as suspicious "
                        f"({vt_result['suspicious_votes']} engines)."
                    ),
                    "why_it_matters": "Some threat intelligence engines classify this domain as suspicious.",
                    "remediation": "Investigate the domain before integrating this API.",
                })
            elif vt_result["status"] == "clean":
                findings.append({
                    "check": f"Domain reputation: {hostname}",
                    "status": "pass",
                    "severity": None,
                    "detail": (
                        f"VirusTotal found no malicious signals for '{hostname}' "
                        f"({vt_result['harmless_votes']} harmless / {vt_result['total_engines']} engines)."
                    ),
                })
            elif vt_result["status"] == "unknown":
                earned -= 5
                if overall_status == "pass":
                    overall_status = "inconclusive"
                findings.append({
                    "check": f"Domain reputation: {hostname}",
                    "status": "inconclusive",
                    "severity": "informational",
                    "detail": f"Domain '{hostname}' is not in the VirusTotal database. This may indicate a new or very low-traffic domain.",
                })
            else:  # unavailable
                findings.append({
                    "check": f"Domain reputation: {hostname}",
                    "status": "inconclusive",
                    "severity": None,
                    "detail": f"VirusTotal check unavailable: {vt_result.get('reason', 'Unknown error')}",
                })

        # ── 2. Google Safe Browsing Check ───────────────────────────────────
        if settings.safe_browsing_enabled:
            urls_to_check = [url, f"https://{hostname}/", f"http://{hostname}/"]
            gsb_result = await _query_google_safe_browsing(client, urls_to_check)
            evidence["google_safe_browsing_result"] = gsb_result

            if gsb_result["status"] == "threat":
                earned -= 20
                overall_status = "fail"
                threat_labels = ", ".join(gsb_result.get("threat_types", ["MALICIOUS"]))
                findings.append({
                    "check": f"Google Safe Browsing: {hostname}",
                    "status": "fail",
                    "severity": "critical",
                    "confidence": "confirmed",
                    "detail": f"Google Safe Browsing flagged '{hostname}' as a threat: {threat_labels}.",
                    "why_it_matters": "Google Safe Browsing has identified this URL/domain as containing malware, phishing, or unwanted software.",
                    "remediation": "Avoid contacting this host. Verify domain safety before calling.",
                })
            elif gsb_result["status"] == "clean":
                findings.append({
                    "check": f"Google Safe Browsing: {hostname}",
                    "status": "pass",
                    "severity": None,
                    "detail": f"Google Safe Browsing found no threats for '{hostname}'.",
                })
            else:
                findings.append({
                    "check": f"Google Safe Browsing: {hostname}",
                    "status": "inconclusive",
                    "severity": None,
                    "detail": f"Google Safe Browsing unavailable: {gsb_result.get('reason', 'Unknown error')}",
                })

        # ── 3. Redirect Destination Checks ──────────────────────────────────
        valid_redirect_urls: List[str] = []
        for dest_url in redirect_destinations[:5]:
            dest_hostname = urlparse(dest_url).hostname or ""
            if not dest_hostname or dest_hostname == hostname:
                continue

            try:
                validate_redirect_destination(dest_url)
                valid_redirect_urls.append(dest_url)
            except URLValidationError as exc:
                findings.append({
                    "check": f"Redirect destination: {dest_hostname}",
                    "status": "fail",
                    "severity": "high",
                    "detail": f"Redirect to blocked destination: {exc}",
                })
                earned -= 10
                overall_status = "fail"
                continue

            if settings.virustotal_enabled:
                dest_vt = await _query_virustotal_domain(client, dest_hostname)
                evidence[f"redirect_vt_{dest_hostname}"] = dest_vt

                if dest_vt["status"] == "threat":
                    earned -= 15
                    overall_status = "fail"
                    findings.append({
                        "check": f"Redirect destination: {dest_hostname}",
                        "status": "fail",
                        "severity": "critical",
                        "confidence": "confirmed",
                        "detail": f"Redirect destination '{dest_hostname}' is flagged as malicious by VirusTotal.",
                        "why_it_matters": "A redirect to a malicious domain could expose users to phishing, malware, or data theft.",
                        "remediation": "Investigate why this API redirects to a flagged domain.",
                    })
                elif dest_vt["status"] == "clean":
                    findings.append({
                        "check": f"Redirect destination: {dest_hostname}",
                        "status": "pass",
                        "detail": f"Redirect destination '{dest_hostname}' has a clean VirusTotal reputation.",
                    })

        if settings.safe_browsing_enabled and valid_redirect_urls:
            dest_gsb = await _query_google_safe_browsing(client, valid_redirect_urls)
            evidence["redirect_gsb"] = dest_gsb
            if dest_gsb["status"] == "threat":
                earned -= 15
                overall_status = "fail"
                threat_labels = ", ".join(dest_gsb.get("threat_types", ["MALICIOUS"]))
                findings.append({
                    "check": "Redirect destinations (Google Safe Browsing)",
                    "status": "fail",
                    "severity": "critical",
                    "confidence": "confirmed",
                    "detail": f"One or more redirect destinations flagged by Google Safe Browsing: {threat_labels}.",
                })

    # Clamp earned points
    earned = max(0.0, min(earned, MAX_POINTS))

    # If no provider is configured, cannot assess
    if not active_providers:
        earned = 0.0

    return TestResult(
        name="Domain and Redirect Reputation",
        status=overall_status,
        earned_points=earned,
        max_points=MAX_POINTS,
        findings=findings,
        evidence=evidence,
        recommendations=recommendations,
    )
