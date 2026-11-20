"""
app/api/auth.py — User extraction and authentication dependency.
Extracts user ID and email from Supabase Bearer token or client headers.
"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Optional

from fastapi import Header, Request


@dataclass
class UserContext:
    id: str
    email: Optional[str] = None


def decode_jwt_payload_unverified(token: str) -> dict:
    """Extract claims from a JWT without external key verification."""
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return {}
        payload_b64 = parts[1]
        # Fix padding
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        decoded = base64.urlsafe_b64decode(padded)
        return json.loads(decoded)
    except Exception:
        return {}


async def get_current_user_optional(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
) -> Optional[UserContext]:
    """
    Returns the authenticated user's context if provided, else None.
    Supports either explicit X-User-* headers or standard Supabase Authorization: Bearer <jwt>.
    """
    # 1. Check explicit client headers first
    if x_user_id:
        return UserContext(id=x_user_id.strip(), email=x_user_email.strip() if x_user_email else None)

    # 2. Check Bearer token
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
        claims = decode_jwt_payload_unverified(token)
        user_id = claims.get("sub")
        email = claims.get("email")
        if user_id:
            return UserContext(id=str(user_id), email=str(email) if email else None)

    return None
