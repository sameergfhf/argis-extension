"""
app/tests/test_url_validation.py — Tests for SSRF-resistant URL validation.
"""
import pytest
from app.security.url_validation import resolve_and_validate, URLValidationError


def test_valid_https_url():
    url, ip = resolve_and_validate("https://httpbin.org/get")
    assert url.startswith("https://")
    assert ip  # Some IP was returned


def test_blocks_http_loopback():
    with pytest.raises(URLValidationError, match="blocked"):
        resolve_and_validate("http://127.0.0.1/secret")


def test_blocks_localhost():
    with pytest.raises(URLValidationError):
        resolve_and_validate("http://localhost/admin")


def test_blocks_private_ipv4():
    with pytest.raises(URLValidationError, match="blocked"):
        resolve_and_validate("http://192.168.1.1/api")


def test_blocks_private_10_range():
    with pytest.raises(URLValidationError, match="blocked"):
        resolve_and_validate("http://10.0.0.1/api")


def test_blocks_link_local():
    with pytest.raises(URLValidationError, match="blocked"):
        resolve_and_validate("http://169.254.169.254/metadata")


def test_blocks_ftp_scheme():
    with pytest.raises(URLValidationError, match="Scheme"):
        resolve_and_validate("ftp://example.com/file")


def test_blocks_file_scheme():
    with pytest.raises(URLValidationError, match="Scheme"):
        resolve_and_validate("file:///etc/passwd")


def test_blocks_credentials_in_url():
    with pytest.raises(URLValidationError, match="credentials"):
        resolve_and_validate("https://user:password@example.com/api")


def test_rejects_missing_hostname():
    with pytest.raises(URLValidationError, match="hostname"):
        resolve_and_validate("https:///no-host")


def test_blocks_raw_private_ip_in_url():
    with pytest.raises(URLValidationError, match="blocked"):
        resolve_and_validate("https://172.16.0.1/api")
