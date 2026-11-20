"""
app/security/url_validation.py — SSRF-resistant URL validation.

Blocks:
  - Non-HTTP(S) schemes
  - Embedded credentials
  - Loopback, private, link-local, multicast, reserved, and metadata-service IPs
  - Unresolvable hostnames

All DNS resolution is done here so the resolved IP can be reused during the
actual connection (callers must pass verify_ip=True to httpx / enforce network-
level egress restrictions for full protection against DNS rebinding).
"""
from __future__ import annotations

import ipaddress
import re
import socket
from typing import List, Tuple
from urllib.parse import urlparse

# ── Blocked Networks ────────────────────────────────────────────────────────────
_BLOCKED_NETWORKS: List[ipaddress.IPv4Network | ipaddress.IPv6Network] = [
    # Loopback
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    # Private / RFC-1918
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    # Link-local
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("fe80::/10"),
    # Multicast
    ipaddress.ip_network("224.0.0.0/4"),
    ipaddress.ip_network("ff00::/8"),
    # Unspecified / any
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::/128"),
    # Reserved / documentation
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
    ipaddress.ip_network("240.0.0.0/4"),
    # Unique local (IPv6 private)
    ipaddress.ip_network("fc00::/7"),
    # AWS metadata service
    ipaddress.ip_network("169.254.169.254/32"),
    # GCP metadata service
    ipaddress.ip_network("169.254.169.254/32"),
    # Azure metadata service
    ipaddress.ip_network("168.63.129.16/32"),
]

_ALLOWED_SCHEMES = {"http", "https"}
_CREDENTIAL_RE = re.compile(r"@", re.IGNORECASE)


class URLValidationError(ValueError):
    """Raised when a submitted URL fails security validation."""


def _is_ip_blocked(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr)
        return any(ip in net for net in _BLOCKED_NETWORKS)
    except ValueError:
        return True  # Unparseable — block by default


def resolve_and_validate(url: str) -> Tuple[str, str]:
    """
    Validate *url* and resolve its hostname to an IP address.

    Returns:
        (validated_url, resolved_ip)

    Raises:
        URLValidationError on any security violation.
    """
    try:
        parsed = urlparse(url)
    except Exception as exc:
        raise URLValidationError(f"URL parse error: {exc}") from exc

    # Scheme check
    if parsed.scheme.lower() not in _ALLOWED_SCHEMES:
        raise URLValidationError(
            f"Scheme '{parsed.scheme}' is not allowed. Only http and https are permitted."
        )

    # Credential check
    if parsed.username or parsed.password:
        raise URLValidationError(
            "URLs must not contain embedded credentials."
        )

    hostname = parsed.hostname
    if not hostname:
        raise URLValidationError("URL must include a hostname.")

    # Reject raw IPs that are in blocked ranges immediately
    try:
        raw_ip = ipaddress.ip_address(hostname)
        if _is_ip_blocked(str(raw_ip)):
            raise URLValidationError(
                f"The IP address {raw_ip} is not reachable from the scanner."
            )
        return url, str(raw_ip)
    except ValueError:
        pass  # hostname is not a raw IP — continue to DNS resolution

    # DNS resolution
    try:
        infos = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror as exc:
        raise URLValidationError(f"Hostname '{hostname}' could not be resolved: {exc}") from exc

    if not infos:
        raise URLValidationError(f"No DNS records found for '{hostname}'.")

    # Validate every resolved address
    resolved_ips = []
    for af, _type, _proto, _cname, sockaddr in infos:
        addr = sockaddr[0]
        if _is_ip_blocked(addr):
            raise URLValidationError(
                f"Hostname '{hostname}' resolves to a blocked address ({addr})."
            )
        resolved_ips.append(addr)

    # Return the first resolved IP for logging / binding purposes
    return url, resolved_ips[0]


def validate_redirect_destination(url: str) -> Tuple[str, str]:
    """
    Same as resolve_and_validate but used for redirect destinations.
    Provides a distinct call site for audit logging.
    """
    return resolve_and_validate(url)
