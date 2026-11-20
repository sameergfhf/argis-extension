import pytest
import httpx
import asyncio

BASE_URL = "http://localhost:8000/api"

@pytest.mark.asyncio
async def test_live_health():
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{BASE_URL}/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["database"] == "ok"

@pytest.mark.asyncio
async def test_live_scan_lifecycle():
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Create scan
        resp = await client.post(f"{BASE_URL}/scans", json={"url": "https://httpbin.org/get"})
        assert resp.status_code == 202
        scan = resp.json()
        scan_id = scan["id"]
        assert scan["status"] == "pending"

        # Poll until completed or failed
        final_scan = None
        for _ in range(25):
            await asyncio.sleep(1.0)
            status_resp = await client.get(f"{BASE_URL}/scans/{scan_id}")
            assert status_resp.status_code == 200
            final_scan = status_resp.json()
            if final_scan["status"] in ("completed", "failed"):
                break

        assert final_scan is not None
        print("Final scan state:", final_scan["status"], final_scan.get("error_message"))

        if final_scan["status"] == "completed":
            # Findings
            findings_resp = await client.get(f"{BASE_URL}/scans/{scan_id}/findings")
            assert findings_resp.status_code == 200
            findings = findings_resp.json()
            assert isinstance(findings, list)

            # Visualizations
            viz_resp = await client.get(f"{BASE_URL}/scans/{scan_id}/visualizations")
            assert viz_resp.status_code == 200
            viz = viz_resp.json()
            assert "latency" in viz
            assert "flow" in viz
            assert "findings_by_severity" in viz

            # PDF Report
            report_resp = await client.get(f"{BASE_URL}/scans/{scan_id}/report")
            assert report_resp.status_code == 200
            assert report_resp.headers["content-type"] == "application/pdf"
            assert len(report_resp.content) > 1000

@pytest.mark.asyncio
async def test_live_history_and_compare():
    async with httpx.AsyncClient(timeout=15.0) as client:
        # History
        hist_resp = await client.get(f"{BASE_URL}/scans/history")
        assert hist_resp.status_code == 200
        hist = hist_resp.json()
        assert "scans" in hist
        assert "total" in hist

        if len(hist["scans"]) >= 2:
            id_a = hist["scans"][0]["id"]
            id_b = hist["scans"][1]["id"]
            comp_resp = await client.post(
                f"{BASE_URL}/scans/{id_a}/compare",
                json={"scan_id_a": id_a, "scan_id_b": id_b}
            )
            assert comp_resp.status_code == 200
            comp = comp_resp.json()
            assert "scan_a" in comp
            assert "scan_b" in comp

@pytest.mark.asyncio
async def test_live_spec_analyzer():
    async with httpx.AsyncClient(timeout=15.0) as client:
        sample_spec = """
openapi: 3.0.0
info:
  title: Sample Test API
  version: 1.0.0
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      summary: List users
      responses:
        '200':
          description: Successful response
"""
        files = {"file": ("openapi.yaml", sample_spec.encode("utf-8"), "application/x-yaml")}
        resp = await client.post(f"{BASE_URL}/specifications/analyze", files=files)
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Sample Test API"
        assert data["total_endpoints"] >= 1
