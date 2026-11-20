"""
app/security/redaction.py — Redact secrets and sensitive values from logs and reports.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional

# Headers that must never appear in logs or reports
SENSITIVE_HEADERS = {
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
    "proxy-authorization",
    "www-authenticate",
}

# Patterns that suggest a secret in text (conservative — require context)
_SECRET_PATTERNS = [
    # Generic API key formats (20+ alphanumeric chars after key=/token=/secret=)
    re.compile(r'(?i)(api[_\-]?key|apikey|access[_\-]?token|secret[_\-]?key|auth[_\-]?token|bearer)\s*[=:]\s*["\']?([A-Za-z0-9\-_.~+/]{20,})["\']?'),
    # AWS access keys
    re.compile(r'AKIA[0-9A-Z]{16}'),
    # Generic password fields
    re.compile(r'(?i)(password|passwd|pwd)\s*[=:]\s*["\']?([^\s"\']{6,})["\']?'),
    # Private key header/footer
    re.compile(r'-----BEGIN [A-Z ]+PRIVATE KEY-----'),
    # Basic auth in URLs
    re.compile(r'(?i)(https?://)([^:@\s]+:[^@\s]+@)'),
    # JWT tokens (three base64 segments)
    re.compile(r'eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+'),
]

_REDACTED = "[REDACTED]"


def redact_headers(headers: Dict[str, str]) -> Dict[str, str]:
    """Return a copy of *headers* with sensitive values replaced."""
    return {
        k: (_REDACTED if k.lower() in SENSITIVE_HEADERS else v)
        for k, v in headers.items()
    }


def redact_text(text: str) -> str:
    """Replace likely secrets in *text* with a redaction marker."""
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub(lambda m: m.group(0)[: m.start(0) - m.start(0)] + _REDACTED, text)
    # More targeted substitution: replace the captured secret group where named
    for pattern in _SECRET_PATTERNS:
        try:
            text = pattern.sub(_redact_match, text)
        except Exception:
            pass
    return text


def _redact_match(m: re.Match) -> str:
    full = m.group(0)
    # If the pattern has a group 2 (the secret value), replace only that part
    try:
        secret = m.group(2)
        return full.replace(secret, _REDACTED)
    except IndexError:
        return _REDACTED


def redact_value(value: Any) -> Any:
    """Recursively redact secrets from JSON-like structures."""
    if isinstance(value, dict):
        return {k: _redact_dict_value(k, v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_value(item) for item in value]
    if isinstance(value, str):
        return redact_text(value)
    return value


_SENSITIVE_KEYS = {
    "password", "passwd", "pwd", "secret", "token", "api_key", "apikey",
    "auth", "authorization", "credential", "private_key", "access_key",
    "access_token", "refresh_token", "session", "cookie",
}


def _redact_dict_value(key: str, value: Any) -> Any:
    if key.lower() in _SENSITIVE_KEYS:
        return _REDACTED
    return redact_value(value)
