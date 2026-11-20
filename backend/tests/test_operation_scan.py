"""
app/tests/test_operation_scan.py — Tests for the operation scan service.
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.schemas import OperationScanRequest
from app.services import openapi_service
from app.services.operation_scan_service import (
    _substitute_path_params,
    create_operation_scan,
)


# ── Path parameter substitution ────────────────────────────────────────────────

def test_substitute_no_params():
    assert _substitute_path_params("/pets", {}) == "/pets"


def test_substitute_single_param():
    result = _substitute_path_params("/pets/{petId}", {"petId": "42"})
    assert result == "/pets/42"


def test_substitute_multiple_params():
    result = _substitute_path_params("/users/{userId}/orders/{orderId}", {"userId": "1", "orderId": "99"})
    assert result == "/users/1/orders/99"


def test_substitute_missing_param_raises():
    with pytest.raises(ValueError, match="petId"):
        _substitute_path_params("/pets/{petId}", {})


def test_substitute_unsafe_param_value_raises():
    """Path param values with shell metacharacters must be rejected."""
    with pytest.raises(ValueError, match="invalid characters"):
        _substitute_path_params("/pets/{petId}", {"petId": "../../etc/passwd"})


def test_substitute_percent_encoded_is_allowed():
    result = _substitute_path_params("/pets/{petId}", {"petId": "hello%20world"})
    assert result == "/pets/hello%20world"


# ── Schema validation ──────────────────────────────────────────────────────────

def test_operation_scan_request_normalises_method():
    req = OperationScanRequest(
        spec_id="abc",
        path="/pet",
        method="post",
        base_url="https://example.com",
        confirm_destructive=True,
    )
    assert req.method == "POST"


def test_operation_scan_request_rejects_invalid_method():
    import pydantic
    with pytest.raises(pydantic.ValidationError, match="Method must be one of"):
        OperationScanRequest(
            spec_id="abc",
            path="/pet",
            method="CONNECT",
            base_url="https://example.com",
        )


def test_operation_scan_request_rejects_path_without_slash():
    import pydantic
    with pytest.raises(pydantic.ValidationError, match="path must start with"):
        OperationScanRequest(
            spec_id="abc",
            path="pet",
            method="GET",
            base_url="https://example.com",
        )


def test_operation_scan_request_rejects_base_url_without_scheme():
    import pydantic
    with pytest.raises(pydantic.ValidationError):
        OperationScanRequest(
            spec_id="abc",
            path="/pet",
            method="GET",
            base_url="example.com/api",
        )


# ── Service layer tests ────────────────────────────────────────────────────────

def _make_mock_db():
    """Return a minimal AsyncSession mock that supports async with db.begin()."""
    db = AsyncMock()

    # db.begin() must be a sync call that returns an async context manager
    class _FakeCtx:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False

    db.begin = MagicMock(return_value=_FakeCtx())
    db.add = MagicMock()
    return db


SAMPLE_SPEC = {
    "openapi": "3.0.0",
    "info": {"title": "Petstore", "version": "1.0.0"},
    "paths": {
        "/pet": {
            "post": {"summary": "Add a pet", "responses": {"200": {"description": "ok"}}},
        },
        "/pet/{petId}": {
            "get": {"summary": "Find pet by ID", "responses": {"200": {"description": "ok"}}},
        },
    },
}


@pytest.mark.asyncio
async def test_create_operation_scan_spec_not_in_cache():
    req = OperationScanRequest(
        spec_id="nonexistent-spec-id",
        path="/pet",
        method="GET",
        base_url="https://petstore3.swagger.io/api/v3",
    )
    db = _make_mock_db()
    with pytest.raises(ValueError, match="not found in the server cache"):
        await create_operation_scan(req, db)


@pytest.mark.asyncio
async def test_create_operation_scan_operation_not_in_spec(monkeypatch):
    """Submitting a (method, path) not in the spec must raise ValueError."""
    # Insert a fake spec into the cache
    from app.schemas import SpecAnalysisOut
    fake_analysis = SpecAnalysisOut(
        spec_id="spec-001",
        title="Petstore",
        version="1.0",
        base_url=None,
        endpoints=[],
        auth_schemes=[],
        total_endpoints=0,
        deprecated_count=0,
    )
    openapi_service._spec_cache["spec-001"] = {"raw": SAMPLE_SPEC, "analysis": fake_analysis}

    req = OperationScanRequest(
        spec_id="spec-001",
        path="/does-not-exist",
        method="GET",
        base_url="https://petstore3.swagger.io/api/v3",
    )
    db = _make_mock_db()
    with pytest.raises(ValueError, match="was not found in the imported specification"):
        await create_operation_scan(req, db)

    del openapi_service._spec_cache["spec-001"]


@pytest.mark.asyncio
async def test_create_operation_scan_destructive_without_confirmation(monkeypatch):
    """POST without confirm_destructive must be rejected."""
    from app.schemas import SpecAnalysisOut
    fake_analysis = SpecAnalysisOut(
        spec_id="spec-002",
        title="Petstore",
        version="1.0",
        base_url=None,
        endpoints=[],
        auth_schemes=[],
        total_endpoints=0,
        deprecated_count=0,
    )
    openapi_service._spec_cache["spec-002"] = {"raw": SAMPLE_SPEC, "analysis": fake_analysis}

    req = OperationScanRequest(
        spec_id="spec-002",
        path="/pet",
        method="POST",
        base_url="https://petstore3.swagger.io/api/v3",
        confirm_destructive=False,  # gate not opened
    )
    db = _make_mock_db()
    with pytest.raises(ValueError, match="confirm_destructive"):
        await create_operation_scan(req, db)

    del openapi_service._spec_cache["spec-002"]


@pytest.mark.asyncio
async def test_create_operation_scan_private_base_url_rejected(monkeypatch):
    """SSRF: base_url pointing at a private IP must be rejected."""
    from app.schemas import SpecAnalysisOut
    fake_analysis = SpecAnalysisOut(
        spec_id="spec-003",
        title="Internal",
        version="1.0",
        base_url=None,
        endpoints=[],
        auth_schemes=[],
        total_endpoints=0,
        deprecated_count=0,
    )
    internal_spec = {
        "paths": {
            "/pet/{petId}": {
                "get": {"summary": "Find pet", "responses": {}},
            }
        }
    }
    openapi_service._spec_cache["spec-003"] = {"raw": internal_spec, "analysis": fake_analysis}

    req = OperationScanRequest(
        spec_id="spec-003",
        path="/pet/{petId}",
        method="GET",
        base_url="http://192.168.1.1",
        path_params={"petId": "1"},
    )
    db = _make_mock_db()
    with pytest.raises(ValueError, match="rejected by security validator"):
        await create_operation_scan(req, db)

    del openapi_service._spec_cache["spec-003"]


# ── Schema: base_url minimum-length fix ───────────────────────────────────────

def test_relative_base_url_rejected_by_scheme_validator():
    """
    base_url='/api/v3' (7 chars) used to fail min_length=8.
    Now min_length=1 so Pydantic no longer rejects it before the validator runs.
    The scheme validator must produce a clear, field-named error instead of
    the opaque 'String should have at least 8 characters'.
    """
    import pydantic
    with pytest.raises(pydantic.ValidationError) as exc_info:
        OperationScanRequest(
            spec_id="abc",
            path="/api/v3/pet",
            method="GET",
            base_url="/api/v3",   # relative — no scheme
        )
    errors = exc_info.value.errors()
    # Should be exactly one error on the base_url field
    assert len(errors) == 1
    err = errors[0]
    assert err["loc"][-1] == "base_url"
    # Must NOT say "String should have at least 8 characters"
    assert "8 characters" not in err["msg"]
    # Must give a helpful message about absolute URLs
    assert "http" in err["msg"].lower() or "absolute" in err["msg"].lower()


def test_short_but_valid_base_url_passes_schema():
    """http://a is only 8 chars but is a valid absolute URL — must not be rejected."""
    req = OperationScanRequest(
        spec_id="abc",
        path="/ping",
        method="GET",
        base_url="http://a",
    )
    assert req.base_url == "http://a"


def test_base_url_trailing_slash_stripped():
    req = OperationScanRequest(
        spec_id="abc",
        path="/ping",
        method="GET",
        base_url="https://api.example.com/",
    )
    assert req.base_url == "https://api.example.com"


# ── Service: GET works without auth ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_operation_without_auth_succeeds(monkeypatch):
    """
    A GET operation must be dispatchable without any auth_header.
    auth_header is entirely optional.
    """
    from app.schemas import SpecAnalysisOut
    spec_id = "spec-get-noauth"
    fake_analysis = SpecAnalysisOut(
        spec_id=spec_id,
        title="Petstore",
        version="1.0",
        base_url=None,
        endpoints=[],
        auth_schemes=[],
        total_endpoints=0,
        deprecated_count=0,
    )
    openapi_service._spec_cache[spec_id] = {"raw": SAMPLE_SPEC, "analysis": fake_analysis}

    # Patch SSRF validator to accept petstore URL
    from app.security import url_validation
    monkeypatch.setattr(
        url_validation,
        "resolve_and_validate",
        lambda url: (url, "1.2.3.4"),
    )

    req = OperationScanRequest(
        spec_id=spec_id,
        path="/pet/{petId}",
        method="GET",
        base_url="https://petstore3.swagger.io/api/v3",
        path_params={"petId": "1"},
        # auth_header intentionally omitted
    )
    db = _make_mock_db()
    scan_id, validated_url, scan_kwargs = await create_operation_scan(req, db)

    assert scan_id
    assert validated_url == "https://petstore3.swagger.io/api/v3/pet/1"
    assert scan_kwargs["http_method"] == "GET"
    assert "auth_header" not in scan_kwargs   # not stored when absent

    del openapi_service._spec_cache[spec_id]


@pytest.mark.asyncio
async def test_post_operation_with_body_and_confirmation(monkeypatch):
    """POST with confirm_destructive=True and a request body must dispatch correctly."""
    from app.schemas import SpecAnalysisOut
    spec_id = "spec-post-body"
    fake_analysis = SpecAnalysisOut(
        spec_id=spec_id,
        title="Petstore",
        version="1.0",
        base_url=None,
        endpoints=[],
        auth_schemes=[],
        total_endpoints=0,
        deprecated_count=0,
    )
    openapi_service._spec_cache[spec_id] = {"raw": SAMPLE_SPEC, "analysis": fake_analysis}

    from app.security import url_validation
    monkeypatch.setattr(
        url_validation,
        "resolve_and_validate",
        lambda url: (url, "1.2.3.4"),
    )

    req = OperationScanRequest(
        spec_id=spec_id,
        path="/pet",
        method="POST",
        base_url="https://petstore3.swagger.io/api/v3",
        request_body={"name": "doggie", "status": "available"},
        confirm_destructive=True,
    )
    db = _make_mock_db()
    scan_id, validated_url, scan_kwargs = await create_operation_scan(req, db)

    assert scan_id
    assert scan_kwargs["http_method"] == "POST"
    assert scan_kwargs.get("request_body_json") == {"name": "doggie", "status": "available"}

    del openapi_service._spec_cache[spec_id]


@pytest.mark.asyncio
async def test_put_operation_with_path_params_and_body(monkeypatch):
    """PUT with path params, body, and confirmation must resolve the path correctly."""
    from app.schemas import SpecAnalysisOut
    spec_id = "spec-put"
    put_spec = {
        "paths": {
            "/pet/{petId}": {
                "put": {"summary": "Update pet", "responses": {}},
            }
        }
    }
    fake_analysis = SpecAnalysisOut(
        spec_id=spec_id,
        title="Petstore",
        version="1.0",
        base_url=None,
        endpoints=[],
        auth_schemes=[],
        total_endpoints=0,
        deprecated_count=0,
    )
    openapi_service._spec_cache[spec_id] = {"raw": put_spec, "analysis": fake_analysis}

    from app.security import url_validation
    monkeypatch.setattr(
        url_validation,
        "resolve_and_validate",
        lambda url: (url, "1.2.3.4"),
    )

    req = OperationScanRequest(
        spec_id=spec_id,
        path="/pet/{petId}",
        method="PUT",
        base_url="https://petstore3.swagger.io/api/v3",
        path_params={"petId": "42"},
        request_body={"id": 42, "name": "Max", "status": "sold"},
        confirm_destructive=True,
    )
    db = _make_mock_db()
    scan_id, validated_url, scan_kwargs = await create_operation_scan(req, db)

    assert "/pet/42" in validated_url
    assert scan_kwargs["http_method"] == "PUT"

    del openapi_service._spec_cache[spec_id]


@pytest.mark.asyncio
async def test_auth_header_present_in_scan_kwargs_but_not_in_context(monkeypatch):
    """
    When auth_header is supplied it must appear in scan_kwargs (for the HTTP
    request) but must NOT appear in operation_context (which is persisted).
    """
    from app.schemas import SpecAnalysisOut
    spec_id = "spec-auth"
    fake_analysis = SpecAnalysisOut(
        spec_id=spec_id, title="Petstore", version="1.0", base_url=None,
        endpoints=[], auth_schemes=[], total_endpoints=0, deprecated_count=0,
    )
    openapi_service._spec_cache[spec_id] = {"raw": SAMPLE_SPEC, "analysis": fake_analysis}

    from app.security import url_validation
    monkeypatch.setattr(url_validation, "resolve_and_validate", lambda url: (url, "1.2.3.4"))

    req = OperationScanRequest(
        spec_id=spec_id,
        path="/pet/{petId}",
        method="GET",
        base_url="https://petstore3.swagger.io/api/v3",
        path_params={"petId": "1"},
        auth_header="Bearer super-secret-token",
    )
    db = _make_mock_db()
    scan_id, validated_url, scan_kwargs = await create_operation_scan(req, db)

    # Auth passed to HTTP layer
    assert scan_kwargs.get("auth_header") == "Bearer super-secret-token"
    # Auth must NOT appear in the operation_context that gets persisted
    ctx = scan_kwargs.get("operation_context", {})
    assert "auth_header" not in ctx
    assert "super-secret-token" not in str(ctx)

    del openapi_service._spec_cache[spec_id]

