"""
app/services/operation_scan_service.py
───────────────────────────────────────
Validate and dispatch a scan for a single OpenAPI operation.

Security model
──────────────
1. The spec_id is looked up in the server-side spec cache.  If the spec is
   not present (e.g. the server restarted) a clear error is returned.
2. The (method, path) pair is resolved against the *cached* specification
   dict.  The frontend cannot invent a path or method that is not in the spec.
3. The final request URL (base_url + resolved path) is passed through the
   existing SSRF validator before any HTTP connection is made.
4. Destructive methods (POST, PUT, PATCH, DELETE) require the caller to
   explicitly set confirm_destructive=True.
5. The auth_header is used only for the outgoing HTTP request and is never
   written to the database, result_json, or any log.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan import Scan
from app.schemas import OperationScanRequest
from app.security.url_validation import resolve_and_validate, URLValidationError
from app.services import openapi_service, scan_service

_DESTRUCTIVE = {"POST", "PUT", "PATCH", "DELETE"}

# Characters allowed in path-param substitution values.
# Conservative allowlist: alphanumeric, hyphen, underscore, dot, tilde, percent.
_SAFE_PARAM_VALUE = re.compile(r"^[A-Za-z0-9\-_.~%]+$")


def _substitute_path_params(path: str, path_params: Dict[str, str]) -> str:
    """
    Replace {param} placeholders with caller-supplied values.

    Raises
    ------
    ValueError
        If a required placeholder has no supplied value, or if a supplied
        value contains characters outside the safe allowlist.
    """
    # Find all placeholders in the path
    placeholders = re.findall(r"\{([^}]+)\}", path)
    resolved = path
    for placeholder in placeholders:
        value = path_params.get(placeholder)
        if value is None:
            raise ValueError(
                f"Path parameter '{{{placeholder}}}' is required but was not provided."
            )
        if not _SAFE_PARAM_VALUE.match(value):
            raise ValueError(
                f"Path parameter '{placeholder}' contains invalid characters. "
                "Only alphanumeric, hyphen, underscore, dot, tilde, and percent are allowed."
            )
        resolved = resolved.replace(f"{{{placeholder}}}", value)
    return resolved


async def create_operation_scan(
    request: OperationScanRequest,
    db: AsyncSession,
    user_id: Optional[str] = None,
    user_email: Optional[str] = None,
) -> str:
    """
    Validate the operation against the cached spec, build the target URL,
    create a Scan ORM record, and dispatch the scan pipeline.

    Returns
    -------
    str
        The new scan_id (UUID).

    Raises
    ------
    ValueError
        On any validation failure (spec not found, operation not found,
        path param issues, SSRF rejection, destructive without confirmation).
    """
    # ── 1. Look up spec in cache ─────────────────────────────────────────────
    cache_entry = openapi_service.get_cached_spec(request.spec_id)
    if cache_entry is None:
        raise ValueError(
            f"Specification '{request.spec_id}' was not found in the server cache. "
            "Re-import the specification using the API Spec Analyzer, then try again. "
            "(Specifications are held in memory and are cleared on server restart.)"
        )

    raw_spec: Dict[str, Any] = cache_entry["raw"]
    analysis = cache_entry["analysis"]

    # ── 2. Validate (method, path) against the spec ──────────────────────────
    operation = openapi_service.find_operation(raw_spec, request.method, request.path)
    if operation is None:
        raise ValueError(
            f"Operation '{request.method} {request.path}' was not found in the "
            f"imported specification '{analysis.title or request.spec_id}'. "
            "Verify the method and path match the specification exactly."
        )

    # ── 3. Safety gate for destructive methods ───────────────────────────────
    if request.method in _DESTRUCTIVE and not request.confirm_destructive:
        raise ValueError(
            f"'{request.method} {request.path}' is a destructive operation that can "
            "modify or delete data. Set confirm_destructive=true and ensure you have "
            "explicit permission to test this endpoint before proceeding."
        )

    # ── 4. Substitute path parameters ────────────────────────────────────────
    try:
        resolved_path = _substitute_path_params(request.path, request.path_params)
    except ValueError:
        raise

    # ── 5. Build and SSRF-validate the final URL ─────────────────────────────
    full_url = request.base_url + resolved_path
    try:
        validated_url, resolved_ip = resolve_and_validate(full_url)
    except URLValidationError as exc:
        raise ValueError(f"Target URL rejected by security validator: {exc}") from exc

    # ── 6. Build operation context (safe to store — auth_header excluded) ────
    parsed = urlparse(validated_url)
    hostname = parsed.hostname or validated_url

    # Gather operation-level metadata for UI display
    op_security = operation.get("security", raw_spec.get("security", []))
    op_auth_schemes: List[str] = []
    for sec_req in (op_security or []):
        op_auth_schemes.extend(sec_req.keys())

    operation_context: Dict[str, Any] = {
        "from_spec": True,
        "spec_id": request.spec_id,
        "spec_title": analysis.title,
        "spec_version": analysis.version,
        "path": request.path,
        "method": request.method,
        "resolved_path": resolved_path,
        "summary": operation.get("summary"),
        "description": operation.get("description"),
        "parameters": operation.get("parameters", []),
        "request_body_schema": operation.get("requestBody"),
        "responses": {
            str(code): {"description": resp.get("description", "")}
            for code, resp in (operation.get("responses") or {}).items()
        },
        "auth_schemes": op_auth_schemes or analysis.auth_schemes,
        "deprecated": operation.get("deprecated", False),
        "path_params_supplied": list(request.path_params.keys()),
        "query_params_supplied": list(request.query_params.keys()),
        "has_request_body": request.request_body is not None,
        "has_auth": request.auth_header is not None,
    }

    # ── 7. Create Scan ORM record ─────────────────────────────────────────────
    scan_id = str(uuid.uuid4())
    scan = Scan(
        id=scan_id,
        url=validated_url,
        hostname=hostname,
        status="pending",
        user_id=user_id,
        user_email=user_email,
        workspace_id=request.workspace_id,
    )
    async with db.begin():
        db.add(scan)

    # ── 8. Dispatch scan pipeline (background) ───────────────────────────────
    # NOTE: The caller (route handler) is responsible for wrapping this in a
    # BackgroundTasks.add_task call so the HTTP response is returned promptly.
    # We return a coroutine factory instead of awaiting it here.

    # Build the kwargs dict — auth_header is passed but never stored
    scan_kwargs: Dict[str, Any] = {
        "http_method": request.method,
        "operation_context": operation_context,
        "query_params": request.query_params if request.query_params else None,
    }
    if request.request_body is not None:
        scan_kwargs["request_body_json"] = request.request_body
    if request.auth_header:
        scan_kwargs["auth_header"] = request.auth_header  # ephemeral — not stored

    return scan_id, validated_url, scan_kwargs
