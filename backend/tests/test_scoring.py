"""
app/tests/test_scoring.py — Tests for the scoring engine.
"""
import pytest
from app.schemas import TestResult
from app.services.scoring import calculate_score


def _make_result(name, status, earned, max_pts, findings=None):
    return TestResult(
        name=name,
        status=status,
        earned_points=earned,
        max_points=max_pts,
        findings=findings or [],
        evidence={},
        recommendations=[],
    )


def test_full_score_all_pass():
    results = {
        "tls": _make_result("TLS", "pass", 30, 30),
        "headers": _make_result("Headers", "pass", 20, 20),
        "leakage": _make_result("Leakage", "pass", 25, 25),
        "reputation": _make_result("Reputation", "pass", 25, 25),
    }
    score = calculate_score(results)
    assert score.assessment_score == 100.0
    assert score.assessed_points == 100.0
    assert score.assessment_coverage == 100.0


def test_score_with_failures():
    results = {
        "tls": _make_result("TLS", "fail", 8, 30),
        "headers": _make_result("Headers", "pass", 20, 20),
        "leakage": _make_result("Leakage", "pass", 25, 25),
        "reputation": _make_result("Reputation", "pass", 25, 25),
    }
    score = calculate_score(results)
    assert score.earned_points == 78.0
    assert score.assessed_points == 100.0
    assert score.assessment_score == 78.0


def test_inconclusive_excluded_from_denominator():
    results = {
        "tls": _make_result("TLS", "pass", 30, 30),
        "headers": _make_result("Headers", "pass", 20, 20),
        "leakage": _make_result("Leakage", "pass", 25, 25),
        "reputation": _make_result("Reputation", "inconclusive", 0, 25),
    }
    score = calculate_score(results)
    assert score.assessed_points == 75.0
    assert score.assessment_score == 100.0
    assert score.assessment_coverage < 100.0


def test_all_inconclusive_returns_none_score():
    results = {
        "tls": _make_result("TLS", "inconclusive", 0, 30),
        "headers": _make_result("Headers", "inconclusive", 0, 20),
        "leakage": _make_result("Leakage", "inconclusive", 0, 25),
        "reputation": _make_result("Reputation", "inconclusive", 0, 25),
    }
    score = calculate_score(results)
    assert score.assessment_score is None
    assert score.assessed_points == 0.0


def test_highest_severity_detection():
    results = {
        "tls": _make_result("TLS", "fail", 0, 30, findings=[
            {"status": "fail", "severity": "medium", "check": "x"},
            {"status": "fail", "severity": "critical", "check": "y"},
        ]),
        "headers": _make_result("Headers", "pass", 20, 20),
        "leakage": _make_result("Leakage", "pass", 25, 25),
        "reputation": _make_result("Reputation", "pass", 25, 25),
    }
    score = calculate_score(results)
    assert score.highest_severity == "critical"


def test_zero_points_earned():
    results = {
        "tls": _make_result("TLS", "fail", 0, 30),
        "headers": _make_result("Headers", "fail", 0, 20),
        "leakage": _make_result("Leakage", "fail", 0, 25),
        "reputation": _make_result("Reputation", "fail", 0, 25),
    }
    score = calculate_score(results)
    assert score.assessment_score == 0.0
    assert score.earned_points == 0.0
