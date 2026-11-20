"""
app/services/openapi_service.py — Parse and analyze OpenAPI specifications.

Spec cache
──────────
Parsed spec dicts are stored in a module-level LRU dict (_spec_cache) so that
the operation scan service can later validate that a submitted (method, path)
actually exists in the imported specification.  The cache holds at most
MAX_CACHED_SPECS entries; the oldest is evicted when the limit is reached.
"""
from __future__ import annotations

import json
import uuid
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx
import yaml

from app.config import get_settings
from app.schemas import EndpointInfo, SpecAnalysisOut
from app.security.url_validation import resolve_and_validate, URLValidationError

settings = get_settings()
_MAX_SPEC_BYTES = 2_097_152  # 2 MB

# ── Spec cache ──────────────────────────────────────────────────────────────────
# Maps spec_id → {"raw": dict, "analysis": SpecAnalysisOut}
MAX_CACHED_SPECS = 100
_spec_cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()


def _cache_spec(spec_id: str, raw: Dict[str, Any], analysis: SpecAnalysisOut) -> None:
    """Store spec in cache, evicting the oldest entry if necessary."""
    _spec_cache[spec_id] = {"raw": raw, "analysis": analysis}
    _spec_cache.move_to_end(spec_id)
    if len(_spec_cache) > MAX_CACHED_SPECS:
        _spec_cache.popitem(last=False)


def get_cached_spec(spec_id: str) -> Optional[Dict[str, Any]]:
    """Return cached spec entry or None if not found / expired."""
    entry = _spec_cache.get(spec_id)
    if entry:
        _spec_cache.move_to_end(spec_id)
    return entry


def find_operation(
    spec_dict: Dict[str, Any],
    method: str,
    path: str,
) -> Optional[Dict[str, Any]]:
    """
    Locate a specific operation in the raw spec dict.
    Returns the operation dict on success, or None if not found.
    """
    paths = spec_dict.get("paths", {})
    path_item = paths.get(path)
    if not isinstance(path_item, dict):
        return None
    return path_item.get(method.lower())


def _safe_yaml_load(content: str) -> Any:
    """Load YAML without enabling arbitrary object construction."""
    return yaml.safe_load(content)


def _parse_spec(data: Dict[str, Any], *, cache: bool = True) -> SpecAnalysisOut:
    spec_id = str(uuid.uuid4())

    # Support OpenAPI 3.x and Swagger 2.x
    info = data.get("info", {})
    title = info.get("title")
    version = info.get("version")

    # Base URL
    base_url = None
    if "servers" in data:
        servers = data["servers"]
        if servers:
            base_url = servers[0].get("url")
    elif "host" in data:
        scheme = (data.get("schemes") or ["https"])[0]
        base_url = f"{scheme}://{data['host']}{data.get('basePath', '')}"

    # Global auth schemes
    auth_schemes: List[str] = []
    sec_defs = data.get("securityDefinitions") or data.get("components", {}).get("securitySchemes", {})
    auth_schemes = list(sec_defs.keys()) if sec_defs else []

    # Endpoints
    paths = data.get("paths", {})
    endpoints: List[EndpointInfo] = []
    deprecated_count = 0

    _methods = ["get", "post", "put", "patch", "delete", "head", "options", "trace"]

    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method in _methods:
            operation = path_item.get(method)
            if not operation or not isinstance(operation, dict):
                continue

            deprecated = operation.get("deprecated", False)
            if deprecated:
                deprecated_count += 1

            # Extract auth for this operation
            op_security = operation.get("security", data.get("security", []))
            op_auth = []
            for sec_req in (op_security or []):
                op_auth.extend(sec_req.keys())

            # Responses
            responses = {
                str(code): {
                    "description": resp.get("description", ""),
                }
                for code, resp in (operation.get("responses") or {}).items()
            }

            endpoints.append(EndpointInfo(
                path=path,
                method=method.upper(),
                summary=operation.get("summary"),
                description=operation.get("description"),
                parameters=operation.get("parameters", []),
                request_body=operation.get("requestBody"),
                responses=responses,
                auth_schemes=op_auth or auth_schemes,
                deprecated=deprecated,
            ))

    analysis = SpecAnalysisOut(
        spec_id=spec_id,
        title=title,
        version=str(version) if version else None,
        base_url=base_url,
        endpoints=endpoints,
        auth_schemes=auth_schemes,
        total_endpoints=len(endpoints),
        deprecated_count=deprecated_count,
    )
    if cache:
        _cache_spec(spec_id, data, analysis)
    return analysis


async def analyze_url(spec_url: str) -> SpecAnalysisOut:
    """Fetch a remote OpenAPI spec URL after SSRF validation."""
    try:
        resolve_and_validate(spec_url)
    except URLValidationError as exc:
        raise ValueError(f"Spec URL rejected: {exc}") from exc

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(spec_url)
        resp.raise_for_status()
        content = resp.content[:_MAX_SPEC_BYTES].decode("utf-8", errors="replace")

    return _parse_from_text(content, spec_url)


def analyze_upload(content: bytes, filename: str) -> SpecAnalysisOut:
    """Parse an uploaded spec file (JSON or YAML)."""
    if len(content) > _MAX_SPEC_BYTES:
        raise ValueError("Uploaded spec file exceeds 2 MB size limit.")
    text = content.decode("utf-8", errors="replace")
    return _parse_from_text(text, filename)


def _parse_from_text(text: str, source: str) -> SpecAnalysisOut:  # noqa: D401
    """Parse JSON or YAML spec text."""
    data: Any
    if source.endswith(".yaml") or source.endswith(".yml"):
        data = _safe_yaml_load(text)
    else:
        # Try JSON first, fall back to YAML
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            data = _safe_yaml_load(text)

    if not isinstance(data, dict):
        raise ValueError("Specification could not be parsed as a JSON or YAML object.")

    return _parse_spec(data)
