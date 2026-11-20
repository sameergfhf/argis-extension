"""
app/services/supabase_sync.py — Direct sync and queries against Supabase Database and Storage.
Guarantees all scans, findings, visualizations, and audit artifacts reside in Supabase.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional
import httpx
from app.config import get_settings

logger = logging.getLogger(__name__)

STORAGE_BUCKET = "aegis-storage"


def _get_supabase_config() -> tuple[str, str]:
    settings = get_settings()
    url = settings.supabase_url.rstrip("/")
    key = settings.supabase_service_role_key or settings.supabase_key
    return url, key


def _get_rest_headers(upsert: bool = True) -> Dict[str, str]:
    _, key = _get_supabase_config()
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if upsert:
        headers["Prefer"] = "return=representation,resolution=merge-duplicates"
    return headers


async def upload_file_to_storage(path: str, content: str, content_type: str = "application/json") -> Optional[str]:
    """Uploads a file string to Supabase Storage and returns its public URL."""
    url_base, key = _get_supabase_config()
    url = f"{url_base}/storage/v1/object/{STORAGE_BUCKET}/{path}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, content=content.encode("utf-8"))
            if resp.status_code in (200, 201):
                public_url = f"{url_base}/storage/v1/object/public/{STORAGE_BUCKET}/{path}"
                logger.info("Uploaded to Supabase Storage: %s -> %s", path, public_url)
                return public_url
            else:
                logger.warning("Supabase storage upload failed for %s: %s %s", path, resp.status_code, resp.text)
    except Exception as e:
        logger.error("Exception during Supabase storage upload for %s: %s", path, e)
    return None


async def sync_scan_to_supabase(
    scan_id: str,
    target_url: str,
    hostname: str,
    status: str,
    score: Optional[float],
    duration_ms: Optional[float],
    passed_checks: int,
    failed_checks: int,
    warning_checks: int,
    inconclusive_checks: int,
    highest_severity: Optional[str],
    user_id: Optional[str],
    user_email: Optional[str],
    findings: List[Dict[str, Any]],
    visualizations: Optional[Dict[str, Any]] = None,
    started_at: Optional[str] = None,
    completed_at: Optional[str] = None,
    result_json: Optional[str] = None,
    workspace_id: Optional[str] = None,
    earned_points: Optional[float] = None,
    assessed_points: Optional[float] = None,
    assessment_coverage: Optional[float] = None,
) -> bool:
    """
    Persists scan metadata, findings, and graph visualizations directly into Supabase.
    """
    vis_url = None
    flow_url = None

    # 1. Upload Visualizations & Flow Diagram to Supabase Storage Bucket
    if visualizations:
        try:
            vis_url = await upload_file_to_storage(
                f"scans/{scan_id}/visualizations.json",
                json.dumps(visualizations),
            )
            if "flow" in visualizations:
                flow_url = await upload_file_to_storage(
                    f"scans/{scan_id}/flow-diagram.json",
                    json.dumps(visualizations["flow"]),
                )
        except Exception as e:
            logger.error("Failed uploading visualizations to storage: %s", e)

    # Keep this payload in sync with persistScanToSupabase() in the frontend.
    # Both writers upsert the same row, and Supabase replaces the whole
    # `metadata` JSON object, so a partial payload silently erases fields
    # (this is what used to blank out assessment_coverage in history).
    metadata = {
        "hostname": hostname,
        "duration_ms": duration_ms,
        "passed_checks": passed_checks,
        "failed_checks": failed_checks,
        "warning_checks": warning_checks,
        "inconclusive_checks": inconclusive_checks,
        "highest_severity": highest_severity,
        "earned_points": earned_points,
        "assessed_points": assessed_points,
        "assessment_coverage": assessment_coverage,
        "user_email": user_email,
        "storage_visualizations_url": vis_url,
        "storage_flow_url": flow_url,
        "result_json": result_json,
    }

    # 2. Upsert Scan record into public.scans
    scan_row = {
        "id": scan_id,
        "user_id": user_id,
        "workspace_id": workspace_id,
        "target_url": target_url,
        "scan_type": "full",
        "status": status,
        "score": score,
        "findings_count": failed_checks + warning_checks,
        "metadata": metadata,
    }
    if started_at:
        scan_row["started_at"] = started_at
    if completed_at:
        scan_row["completed_at"] = completed_at

    try:
        url_base, _ = _get_supabase_config()
        rest_headers = _get_rest_headers(upsert=True)
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{url_base}/rest/v1/scans",
                headers=rest_headers,
                json=scan_row,
            )
            if resp.status_code not in (200, 201):
                logger.warning("Supabase scan upsert returned %s: %s", resp.status_code, resp.text)
            else:
                logger.info("Successfully synced scan %s to Supabase public.scans", scan_id)

            # 3. Upsert Findings into public.scan_findings
            if findings:
                finding_rows = []
                for f in findings:
                    f_meta = {
                        "category": f.get("category", "General"),
                        "confidence": f.get("confidence", "possible"),
                        "status": f.get("status", "fail"),
                        "why_it_matters": f.get("why_it_matters"),
                        "rule_reference": f.get("rule_reference"),
                    }
                    finding_rows.append({
                        "id": f.get("id"),
                        "scan_id": scan_id,
                        "user_id": user_id,
                        "title": f.get("title", "Finding"),
                        "description": f.get("description", ""),
                        "severity": f.get("severity", "informational"),
                        "endpoint": f.get("evidence", "")[:255] if f.get("evidence") else None,
                        "evidence": f.get("evidence", ""),
                        "remediation": f.get("remediation", ""),
                        "metadata": f_meta,
                    })

                f_resp = await client.post(
                    f"{url_base}/rest/v1/scan_findings",
                    headers=rest_headers,
                    json=finding_rows,
                )
                if f_resp.status_code not in (200, 201):
                    logger.warning("Supabase findings upsert returned %s: %s", f_resp.status_code, f_resp.text)
                else:
                    logger.info("Successfully synced %d findings to Supabase public.scan_findings", len(finding_rows))

        return True
    except Exception as e:
        logger.error("Error syncing to Supabase: %s", e)
        return False
