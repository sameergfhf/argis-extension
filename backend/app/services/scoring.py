"""
app/services/scoring.py — Evidence-based security assessment scoring.

Rules:
- Only applicable tests with meaningful results contribute to the score.
- Inconclusive tests do not auto-pass or auto-fail.
- If no points are assessed, the score is None.
- assessment_score = earned_points / assessed_points * 100
"""
from __future__ import annotations

from typing import Dict, Optional

from app.schemas import ScoreResult, TestResult

_SEVERITY_ORDER = ["critical", "high", "medium", "low", "informational"]


def _highest_severity(results: Dict[str, TestResult]) -> Optional[str]:
    found = set()
    for result in results.values():
        for finding in result.findings:
            sev = finding.get("severity")
            if sev and sev in _SEVERITY_ORDER:
                found.add(sev)
    for sev in _SEVERITY_ORDER:
        if sev in found:
            return sev
    return None


def _status_counts(results: Dict[str, TestResult]):
    passed = failed = warnings = inconclusive = 0
    for result in results.values():
        for f in result.findings:
            status = f.get("status", "")
            if status == "pass":
                passed += 1
            elif status == "fail":
                failed += 1
            elif status == "warning":
                warnings += 1
            elif status == "inconclusive":
                inconclusive += 1
    return passed, failed, warnings, inconclusive


def calculate_score(results: Dict[str, TestResult]) -> ScoreResult:
    """
    Calculate an evidence-based assessment score from individual test results.

    Only tests that produced meaningful (non-inconclusive overall) results
    contribute to assessed_points.
    """
    earned_points = 0.0
    assessed_points = 0.0

    for name, result in results.items():
        if result.status == "inconclusive":
            # The test could not produce a meaningful result — exclude from denominator
            continue
        assessed_points += result.max_points
        earned_points += result.earned_points

    if assessed_points == 0:
        assessment_score = None
        assessment_coverage = 0.0
    else:
        assessment_score = round((earned_points / assessed_points) * 100, 1)
        total_possible = sum(r.max_points for r in results.values())
        assessment_coverage = round((assessed_points / total_possible) * 100, 1) if total_possible else 0.0

    passed, failed, warnings, inconclusive = _status_counts(results)
    highest = _highest_severity(results)

    return ScoreResult(
        assessment_score=assessment_score,
        earned_points=round(earned_points, 1),
        assessed_points=round(assessed_points, 1),
        assessment_coverage=round(
            (assessed_points / sum(r.max_points for r in results.values()) * 100)
            if results else 0.0,
            1,
        ),
        passed_checks=passed,
        failed_checks=failed,
        warning_checks=warnings,
        inconclusive_checks=inconclusive,
        highest_severity=highest,
        test_results={k: v for k, v in results.items()},
    )
