// src/components/ScoreCard.tsx — Security Assessment Score display with balanced telemetry
import type { Scan, Finding, FindingsBySeverity } from '../types';
import { Clock, CheckCircle2, XCircle, AlertTriangle, MinusCircle } from 'lucide-react';
import { SeverityBadge } from './ui';

interface Props {
  scan: Scan;
  findings?: Finding[];
  findingsBySeverity?: FindingsBySeverity;
}

function getScoreTheme(score?: number | null) {
  if (score === undefined || score === null) {
    return {
      color: 'var(--color-muted)',
      grade: '—',
      label: 'No assessment data',
      ring: 'var(--color-line-strong)',
    };
  }
  if (score >= 90) {
    return {
      color: 'var(--aegis-safe-fg)',
      grade: 'A+',
      label: 'Hardened perimeter',
      ring: 'var(--aegis-safe-fg)',
    };
  }
  if (score >= 75) {
    return {
      color: 'var(--aegis-info-fg)',
      grade: 'B',
      label: 'Satisfactory posture',
      ring: 'var(--aegis-info-fg)',
    };
  }
  if (score >= 50) {
    return {
      color: 'var(--aegis-medium-fg)',
      grade: 'C',
      label: 'Weaknesses present',
      ring: 'var(--aegis-medium-fg)',
    };
  }
  return {
    color: 'var(--aegis-critical-fg)',
    grade: 'F',
    label: 'Critical exposures detected',
    ring: 'var(--aegis-critical-fg)',
  };
}

export default function ScoreCard({ scan }: Props) {
  const score = scan.assessment_score;
  const theme = getScoreTheme(score);
  const normalizedScore = score !== undefined && score !== null ? Math.min(100, Math.max(0, score)) : 0;
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - normalizedScore / 100);

  const duration = scan.duration_ms
    ? scan.duration_ms >= 1000
      ? `${(scan.duration_ms / 1000).toFixed(2)}s`
      : `${Math.round(scan.duration_ms)}ms`
    : null;

  const rawCoverage = scan.assessment_coverage;
  const hasCoverage = typeof rawCoverage === 'number' && Number.isFinite(rawCoverage);
  const coveragePct = hasCoverage
    ? Math.min(
        100,
        Math.max(0, rawCoverage > 1 ? Math.round(rawCoverage) : Math.round(rawCoverage * 100)),
      )
    : null;
  const coverageText = coveragePct === null ? '—' : `${coveragePct}%`;

  const passed = scan.passed_checks ?? 0;
  const failed = scan.failed_checks ?? 0;
  const warnings = scan.warning_checks ?? 0;
  const inconclusive = scan.inconclusive_checks ?? 0;
  const totalChecks = passed + failed + warnings + inconclusive;

  const pointsPct = scan.assessed_points
    ? Math.min(100, Math.max(0, Math.round(((scan.earned_points ?? 0) / scan.assessed_points) * 100)))
    : 0;

  const metrics = [
    { label: 'Earned points', value: `${scan.earned_points?.toFixed(0) ?? 0}`, suffix: `/ ${scan.assessed_points?.toFixed(0) ?? 100}`, note: 'Weighted audit score', tone: 'text-ink' },
    { label: 'Coverage', value: coverageText, suffix: '', note: 'Execution depth', tone: hasCoverage ? 'text-ink' : 'text-muted' },
    { label: 'Passed', value: `${passed}`, suffix: `/ ${totalChecks || 1}`, note: 'Standards verified', tone: 'text-safe' },
    { label: 'Failed', value: `${failed}`, suffix: 'flagged', note: 'Requires remediation', tone: failed > 0 ? 'text-critical' : 'text-muted' },
  ];

  return (
    <section
      role="region"
      aria-label="Security assessment score summary"
      className="aegis-panel flex flex-col"
    >
      <div className="aegis-panel-head">
        <div className="min-w-0">
          <p className="aegis-eyebrow">Posture / assessment</p>
          <h2 className="mt-1.5 font-display text-[17px] font-semibold tracking-tight text-ink">
            Security assessment score
          </h2>
        </div>
        {duration ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {duration} probe
          </span>
        ) : null}
      </div>

      <div className="grid flex-1 gap-0 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col justify-between gap-5 border-b border-line p-5 sm:border-b-0 sm:border-r">
          <div className="flex items-center gap-5">
            <div
              role="progressbar"
              aria-valuenow={score !== null && score !== undefined ? Math.round(score) : 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Security score: ${score !== null && score !== undefined ? Math.round(score) : 'undetermined'} out of 100`}
              className="relative h-[128px] w-[128px] shrink-0"
            >
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r={radius} fill="transparent" stroke="var(--color-line)" strokeWidth="4" />
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="transparent"
                  stroke={theme.ring}
                  strokeWidth="4"
                  strokeLinecap="butt"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.2,0.7,0.3,1)' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-[42px] font-semibold leading-none tracking-[-0.05em] tabular-nums text-ink">
                  {score !== undefined && score !== null ? score.toFixed(0) : '—'}
                </span>
                <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">of 100</span>
              </div>
            </div>

            <div className="min-w-0">
              <span
                className="inline-flex items-center border px-2 py-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em]"
                style={{
                  color: theme.color,
                  borderColor: `color-mix(in srgb, ${theme.color} 32%, transparent)`,
                  background: `color-mix(in srgb, ${theme.color} 8%, transparent)`,
                }}
              >
                Grade {theme.grade}
              </span>
              <p className="mt-2.5 text-[13.5px] font-semibold leading-snug text-ink">{theme.label}</p>
              {scan.highest_severity ? (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="aegis-label !text-[9.5px]">Peak</span>
                  <SeverityBadge severity={scan.highest_severity} size="xs" />
                </div>
              ) : null}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
              <span>Points realization</span>
              <span className="tabular-nums text-ink">{pointsPct}%</span>
            </div>
            <div className="mt-2 h-[3px] w-full bg-line">
              <div
                className="h-full transition-[width] duration-700"
                style={{ width: `${pointsPct}%`, backgroundColor: theme.color }}
              />
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2">
          {metrics.map((metric, index) => (
            <div
              key={metric.label}
              className={`px-4 py-4 ${index % 2 === 1 ? 'border-l border-line' : ''} ${index > 1 ? 'border-t border-line' : ''}`}
            >
              <dt className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">{metric.label}</dt>
              <dd className="mt-2 flex items-baseline gap-1.5">
                <span className={`font-display text-[26px] font-semibold leading-none tracking-[-0.04em] tabular-nums ${metric.tone}`}>
                  {metric.value}
                </span>
                {metric.suffix ? <span className="font-mono text-[10px] text-muted">{metric.suffix}</span> : null}
              </dd>
              <dd className="mt-1.5 font-mono text-[10px] leading-tight text-muted">{metric.note}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="border-t border-line px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="aegis-label !text-[9.5px]">Assessment checks</span>
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 font-mono text-[10px]">
            <span className="flex items-center gap-1.5 text-safe">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              {passed} pass
            </span>
            {failed > 0 ? (
              <span className="flex items-center gap-1.5 text-critical">
                <XCircle className="h-3 w-3" aria-hidden="true" />
                {failed} fail
              </span>
            ) : null}
            {warnings > 0 ? (
              <span className="flex items-center gap-1.5 text-high">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {warnings} warn
              </span>
            ) : null}
            {inconclusive > 0 ? (
              <span className="flex items-center gap-1.5 text-muted">
                <MinusCircle className="h-3 w-3" aria-hidden="true" />
                {inconclusive} n/a
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-2.5 flex h-[3px] w-full overflow-hidden bg-line" aria-hidden="true">
          {totalChecks > 0 ? (
            <>
              <div style={{ width: `${(passed / totalChecks) * 100}%` }} className="h-full bg-safe" />
              <div style={{ width: `${(failed / totalChecks) * 100}%` }} className="h-full bg-critical" />
              <div style={{ width: `${(warnings / totalChecks) * 100}%` }} className="h-full bg-high" />
              <div style={{ width: `${(inconclusive / totalChecks) * 100}%` }} className="h-full bg-line-strong" />
            </>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
          <span>Score = weighted strength</span>
          <span>Coverage = validated depth {coverageText}</span>
          <span>Deterministic · no inference</span>
        </div>
      </div>
    </section>
  );
}
