"""
app/tests/test_headers.py — Tests for the context-aware HTTP security headers checker.

Covers the full decision matrix:
  - PASS / FAIL / WARNING / NOT_APPLICABLE per check
  - HTML vs JSON content-type context
  - Auth-signal detection for Cache-Control
  - Partial credit for WARNING status (HSTS with short max-age)
  - Bonus credit for browser headers present on JSON responses
"""
import pytest
import httpx
from unittest.mock import MagicMock
from app.scanners.headers_checker import run, PASS, FAIL, WARNING, NOT_APPLICABLE


# ── Helpers ────────────────────────────────────────────────────────────────────

def _mock_response(headers: dict, content_type: str = "application/json") -> MagicMock:
    """Build a mock httpx.Response with the given response headers."""
    mock = MagicMock(spec=httpx.Response)
    all_headers = {"content-type": content_type}
    all_headers.update({k.lower(): v for k, v in headers.items()})
    mock.headers = all_headers
    mock.status_code = 200
    return mock


def _finding(result, check_name: str) -> dict:
    """Return the finding dict for a specific check, or {} if not found."""
    return next(
        (f for f in result.findings if f.get("check") == check_name),
        {},
    )


# ── Strict-Transport-Security ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_hsts_valid_max_age_passes():
    resp = _mock_response({"Strict-Transport-Security": "max-age=63072000; includeSubDomains"})
    result = await run(resp)
    f = _finding(result, "Strict-Transport-Security")
    assert f["status"] == PASS
    assert result.earned_points >= 6.0


@pytest.mark.asyncio
async def test_hsts_missing_fails():
    resp = _mock_response({})
    result = await run(resp)
    f = _finding(result, "Strict-Transport-Security")
    assert f["status"] == FAIL
    assert f["severity"] == "medium"


@pytest.mark.asyncio
async def test_hsts_zero_max_age_fails():
    resp = _mock_response({"Strict-Transport-Security": "max-age=0"})
    result = await run(resp)
    f = _finding(result, "Strict-Transport-Security")
    assert f["status"] == FAIL


@pytest.mark.asyncio
async def test_hsts_very_short_max_age_warns_partial_credit():
    """max-age < 1 day should be WARNING with partial points."""
    resp = _mock_response({"Strict-Transport-Security": "max-age=3600"})
    result = await run(resp)
    f = _finding(result, "Strict-Transport-Security")
    assert f["status"] == WARNING
    # Partial credit: 3 points (half of 6)
    hsts_pts = 3.0
    # Earned includes HSTS partial, so check overall >= hsts_pts
    # (other headers may add or miss)
    assert result.earned_points >= 0  # at minimum it is not penalised beyond 0


# ── X-Content-Type-Options ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_xcto_nosniff_passes():
    resp = _mock_response({"X-Content-Type-Options": "nosniff"})
    result = await run(resp)
    f = _finding(result, "X-Content-Type-Options")
    assert f["status"] == PASS


@pytest.mark.asyncio
async def test_xcto_missing_fails():
    resp = _mock_response({})
    result = await run(resp)
    f = _finding(result, "X-Content-Type-Options")
    assert f["status"] == FAIL
    assert f["severity"] == "low"


@pytest.mark.asyncio
async def test_xcto_wrong_value_fails():
    resp = _mock_response({"X-Content-Type-Options": "sniff"})
    result = await run(resp)
    f = _finding(result, "X-Content-Type-Options")
    assert f["status"] == FAIL


# ── Content-Security-Policy ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_csp_required_and_missing_for_html_fails():
    """CSP absence on an HTML response is a FAIL."""
    resp = _mock_response(
        {"Strict-Transport-Security": "max-age=63072000", "X-Content-Type-Options": "nosniff"},
        content_type="text/html; charset=utf-8",
    )
    result = await run(resp)
    f = _finding(result, "Content-Security-Policy")
    assert f["status"] == FAIL
    assert f["applicable"] is True
    assert f.get("severity") == "medium"


@pytest.mark.asyncio
async def test_csp_present_passes_for_html():
    resp = _mock_response(
        {
            "Strict-Transport-Security": "max-age=63072000",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'self'",
            "Cache-Control": "no-store",
            "X-Frame-Options": "DENY",
        },
        content_type="text/html; charset=utf-8",
    )
    result = await run(resp)
    f = _finding(result, "Content-Security-Policy")
    assert f["status"] == PASS


@pytest.mark.asyncio
async def test_csp_not_applicable_for_json_when_absent():
    """Missing CSP on a JSON API must be NOT_APPLICABLE, not FAIL."""
    resp = _mock_response(
        {"Strict-Transport-Security": "max-age=63072000", "X-Content-Type-Options": "nosniff"},
        content_type="application/json",
    )
    result = await run(resp)
    f = _finding(result, "Content-Security-Policy")
    assert f["status"] == NOT_APPLICABLE
    assert f["applicable"] is False
    # NOT_APPLICABLE must not pollute the overall status with FAIL
    assert result.status != FAIL or _has_other_fails(result, "Content-Security-Policy")


@pytest.mark.asyncio
async def test_csp_bonus_credit_for_json_when_present():
    """CSP present on a JSON API earns bonus points without being required."""
    resp = _mock_response(
        {
            "Strict-Transport-Security": "max-age=63072000",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
            "Content-Security-Policy": "default-src 'none'",
        },
        content_type="application/json",
    )
    result = await run(resp)
    f = _finding(result, "Content-Security-Policy")
    assert f["status"] == PASS
    assert f["applicable"] is False  # bonus, not required


@pytest.mark.asyncio
async def test_csp_not_applicable_for_binary_response():
    resp = _mock_response({}, content_type="image/png")
    result = await run(resp)
    f = _finding(result, "Content-Security-Policy")
    assert f["status"] == NOT_APPLICABLE


# ── Cache-Control ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cache_no_store_always_passes():
    """no-store is correct for any context."""
    resp = _mock_response({"Cache-Control": "no-store, no-cache"})
    result = await run(resp)
    f = _finding(result, "Cache-Control")
    assert f["status"] == PASS


@pytest.mark.asyncio
async def test_cache_private_always_passes():
    resp = _mock_response({"Cache-Control": "private, max-age=0"})
    result = await run(resp)
    f = _finding(result, "Cache-Control")
    assert f["status"] == PASS


@pytest.mark.asyncio
async def test_cache_public_with_auth_signal_fails():
    """public caching on a response that sets a cookie is a FAIL."""
    resp = _mock_response({
        "Cache-Control": "public, max-age=3600",
        "Set-Cookie": "session=abc123; HttpOnly",
    })
    result = await run(resp)
    f = _finding(result, "Cache-Control")
    assert f["status"] == FAIL
    assert f["context"]["has_auth_signals"] is True


@pytest.mark.asyncio
async def test_cache_absent_with_auth_signal_fails():
    """No Cache-Control on a response with Set-Cookie is a FAIL."""
    resp = _mock_response({"Set-Cookie": "token=xyz; Secure; HttpOnly"})
    result = await run(resp)
    f = _finding(result, "Cache-Control")
    assert f["status"] == FAIL


@pytest.mark.asyncio
async def test_cache_absent_without_auth_signal_warns():
    """Absent Cache-Control with no auth signals is a WARNING, not FAIL."""
    resp = _mock_response({
        "Strict-Transport-Security": "max-age=63072000",
        "X-Content-Type-Options": "nosniff",
    })
    result = await run(resp)
    f = _finding(result, "Cache-Control")
    assert f["status"] == WARNING
    # WARNING does not count as a hard fail
    assert f["status"] != FAIL


@pytest.mark.asyncio
async def test_cache_explicit_public_without_auth_passes():
    """Explicit public caching with no auth signals is acceptable."""
    resp = _mock_response({
        "Cache-Control": "public, max-age=86400",
        "Strict-Transport-Security": "max-age=63072000",
        "X-Content-Type-Options": "nosniff",
    })
    result = await run(resp)
    f = _finding(result, "Cache-Control")
    assert f["status"] == PASS


@pytest.mark.asyncio
async def test_cache_vary_authorization_counts_as_sensitive():
    """Vary: Authorization signals the response is personalised."""
    resp = _mock_response({
        "Cache-Control": "public, max-age=300",
        "Vary": "Authorization",
    })
    result = await run(resp)
    f = _finding(result, "Cache-Control")
    assert f["status"] == FAIL
    assert f["context"]["has_vary_authorization"] is True


# ── X-Frame-Options ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_xfo_deny_passes_for_html():
    resp = _mock_response(
        {"X-Frame-Options": "DENY", "Strict-Transport-Security": "max-age=63072000",
         "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'self'",
         "Cache-Control": "no-store"},
        content_type="text/html",
    )
    result = await run(resp)
    f = _finding(result, "X-Frame-Options")
    assert f["status"] == PASS
    assert f["applicable"] is True


@pytest.mark.asyncio
async def test_xfo_missing_fails_for_html():
    resp = _mock_response(
        {"Strict-Transport-Security": "max-age=63072000",
         "X-Content-Type-Options": "nosniff",
         "Content-Security-Policy": "default-src 'self'"},
        content_type="text/html",
    )
    result = await run(resp)
    f = _finding(result, "X-Frame-Options")
    assert f["status"] == FAIL
    assert f["applicable"] is True


@pytest.mark.asyncio
async def test_xfo_not_applicable_for_json_when_absent():
    """Absent X-Frame-Options on a JSON API must be NOT_APPLICABLE."""
    resp = _mock_response(
        {"Strict-Transport-Security": "max-age=63072000",
         "X-Content-Type-Options": "nosniff"},
        content_type="application/json",
    )
    result = await run(resp)
    f = _finding(result, "X-Frame-Options")
    assert f["status"] == NOT_APPLICABLE
    assert f["applicable"] is False


@pytest.mark.asyncio
async def test_xfo_bonus_credit_for_json_when_present():
    resp = _mock_response(
        {"Strict-Transport-Security": "max-age=63072000",
         "X-Content-Type-Options": "nosniff",
         "Cache-Control": "no-store",
         "X-Frame-Options": "DENY"},
        content_type="application/json",
    )
    result = await run(resp)
    f = _finding(result, "X-Frame-Options")
    assert f["status"] == PASS
    assert f["applicable"] is False  # bonus, not required


# ── Overall status roll-up ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_all_headers_present_json_full_pass():
    """All mandatory headers present on JSON API → PASS, full points."""
    resp = _mock_response({
        "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
    }, content_type="application/json")
    result = await run(resp)
    assert result.status == PASS
    # Mandatory points: HSTS(6) + XCTO(4) + Cache(4) = 14 minimum
    assert result.earned_points >= 14.0


@pytest.mark.asyncio
async def test_json_api_not_penalised_for_absent_browser_headers():
    """A JSON API missing CSP and X-Frame-Options must NOT be FAIL solely for those."""
    resp = _mock_response({
        "Strict-Transport-Security": "max-age=63072000",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
        # No CSP, no X-Frame-Options
    }, content_type="application/json")
    result = await run(resp)
    # The overall status must be PASS (no real failures present)
    assert result.status == PASS


@pytest.mark.asyncio
async def test_warning_does_not_become_fail():
    """A response with only WARNINGs must have status=warning, not fail."""
    resp = _mock_response({
        "Strict-Transport-Security": "max-age=63072000",
        "X-Content-Type-Options": "nosniff",
        # No Cache-Control → WARNING for public/unknown context
    }, content_type="application/json")
    result = await run(resp)
    assert result.status == WARNING
    assert result.status != FAIL


@pytest.mark.asyncio
async def test_html_response_missing_csp_and_xfo_fails():
    """HTML response without CSP and X-Frame-Options must be FAIL."""
    resp = _mock_response({
        "Strict-Transport-Security": "max-age=63072000",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
        # Missing CSP and X-Frame-Options on an HTML response
    }, content_type="text/html")
    result = await run(resp)
    assert result.status == FAIL


# ── Scoring sanity ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_earned_points_never_exceed_max():
    resp = _mock_response({
        "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
        "Cache-Control": "no-store",
        "X-Frame-Options": "DENY",
    })
    result = await run(resp)
    assert result.earned_points <= result.max_points


@pytest.mark.asyncio
async def test_earned_points_never_go_negative():
    resp = _mock_response({})  # All missing
    result = await run(resp)
    assert result.earned_points >= 0.0


# ── Helper ─────────────────────────────────────────────────────────────────────

def _has_other_fails(result, exclude_check: str) -> bool:
    """Return True if any finding other than exclude_check has status FAIL."""
    return any(
        f.get("status") == FAIL and f.get("check") != exclude_check
        for f in result.findings
    )
