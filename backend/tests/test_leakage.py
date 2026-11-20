"""
app/tests/test_leakage.py — Tests for the information leakage scanner.
"""
import pytest
import asyncio
from app.scanners.leakage_checker import run


@pytest.mark.asyncio
async def test_clean_json_body():
    body = '{"status": "ok", "message": "Hello world"}'
    result = await run(body, "application/json")
    assert result.status == "pass"
    assert result.earned_points == 25.0


@pytest.mark.asyncio
async def test_detects_aws_key():
    body = '{"key": "AKIAIOSFODNN7EXAMPLE"}'
    result = await run(body, "application/json")
    assert result.status == "fail"
    assert result.earned_points < 25.0
    assert any("AWS" in f.get("check", "") for f in result.findings if f.get("status") == "fail")


@pytest.mark.asyncio
async def test_detects_stack_trace():
    body = 'Error: Traceback (most recent call last):\n  File "app.py", line 42, in get_user\n    raise ValueError("oops")'
    result = await run(body, "text/plain")
    assert result.status == "fail"
    assert any("Stack Trace" in f.get("check", "") for f in result.findings if f.get("status") == "fail")


@pytest.mark.asyncio
async def test_detects_jwt_token():
    jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    body = f'{{"token": "{jwt}"}}'
    result = await run(body, "application/json")
    assert result.status == "fail"


@pytest.mark.asyncio
async def test_detects_password_in_json():
    body = '{"username": "admin", "password": "supersecret123"}'
    result = await run(body, "application/json")
    assert result.status == "fail"
    assert any("password" in f.get("check", "").lower() for f in result.findings if f.get("status") == "fail")


@pytest.mark.asyncio
async def test_detects_db_error():
    body = "SQLSTATE[42000]: Syntax error or access violation"
    result = await run(body, "text/plain")
    assert result.status == "fail"


@pytest.mark.asyncio
async def test_evidence_is_redacted():
    body = '{"key": "AKIAIOSFODNN7EXAMPLE"}'
    result = await run(body, "application/json")
    for finding in result.findings:
        evidence = finding.get("evidence", "") or ""
        # The raw key should not appear verbatim in evidence
        assert "AKIAIOSFODNN7EXAMPLE" not in evidence or "[REDACTED]" in evidence


@pytest.mark.asyncio
async def test_clean_plain_text():
    body = "The quick brown fox jumps over the lazy dog."
    result = await run(body, "text/plain")
    assert result.status == "pass"
    assert result.earned_points == 25.0
