// src/components/TestResultCard.tsx — Security test result card with telemetry breakdown
import { useState, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  MinusCircle,
  ChevronDown,
  Wrench,
  Check,
  Copy,
} from 'lucide-react';
import type { TestResult, Severity } from '../types';
import { SeverityBadge } from './ui';
import toast from 'react-hot-toast';

interface Props {
  testKey: string;
  result: TestResult;
}

const SCANNER_DESCRIPTIONS: Record<string, string> = {
  tls: 'Cryptographic protocol version, certificate trust chain validity, cipher suites, and expiry.',
  headers: 'Defense-in-depth response headers: HSTS, CSP, X-Content-Type-Options, and framing controls.',
  leakage: 'Exposed server banners, stack traces, internal paths, and debug metadata in payloads.',
  reputation: 'Cross-reference against global threat intelligence feeds and public reputation indices.',
};

const STATUS_CONFIG = {
  pass: {
    icon: CheckCircle2,
    color: 'text-safe',
    bg: 'bg-safe/10',
    border: 'border-safe/30',
    label: 'PASS',
    barColor: 'bg-safe',
  },
  fail: {
    icon: XCircle,
    color: 'text-critical',
    bg: 'bg-critical/10',
    border: 'border-critical/30',
    label: 'FAIL',
    barColor: 'bg-critical',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-high',
    bg: 'bg-high/10',
    border: 'border-high/30',
    label: 'WARNING',
    barColor: 'bg-high',
  },
  inconclusive: {
    icon: HelpCircle,
    color: 'text-muted',
    bg: 'bg-elevated',
    border: 'border-line',
    label: 'INCONCLUSIVE',
    barColor: 'bg-line-strong',
  },
};

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  informational: 1,
};

export default function TestResultCard({ testKey, result }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const config =
    STATUS_CONFIG[result.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.inconclusive;
  const Icon = config.icon;
  const description = SCANNER_DESCRIPTIONS[testKey] || 'Security posture evaluation module.';

  const checkCounts = useMemo(() => {
    let passed = 0;
    let failed = 0;
    let warnings = 0;
    let inconclusive = 0;

    for (const f of result.findings) {
      const st = String(f.status || '').toLowerCase();
      if (st === 'pass') passed++;
      else if (st === 'fail') failed++;
      else if (st === 'warning') warnings++;
      else inconclusive++;
    }

    return { passed, failed, warnings, inconclusive, total: result.findings.length };
  }, [result.findings]);

  const highestSeverity = useMemo<Severity | null>(() => {
    let top: Severity | null = null;
    let topScore = 0;

    for (const f of result.findings) {
      if (f.status === 'fail' || f.status === 'warning') {
        const sev = (f.severity as Severity) || 'informational';
        const score = SEVERITY_ORDER[sev] || 0;
        if (score > topScore) {
          topScore = score;
          top = sev;
        }
      }
    }
    return top;
  }, [result.findings]);

  const pct = Math.min(100, Math.max(0, (result.earned_points / (result.max_points || 1)) * 100));

  const handleCopyEvidence = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Detail copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <article className="aegis-panel overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={`test-${testKey}-details`}
        className="group flex cursor-pointer select-none flex-col gap-4 px-4 py-4 transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--aegis-focus)] sm:px-5 lg:flex-row lg:items-center"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        id={`test-${testKey}`}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border ${config.border} ${config.bg}`}>
            <Icon className={`h-4 w-4 ${config.color}`} aria-hidden="true" />
          </div>

          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[13.5px] font-semibold tracking-tight text-ink">{result.name}</h3>
              {highestSeverity ? <SeverityBadge severity={highestSeverity} size="xs" /> : null}
            </div>

            <p className="max-w-2xl text-[12px] leading-relaxed text-muted">{description}</p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5 font-mono text-[10px]">
              <span className="flex items-center gap-1 text-safe">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                {checkCounts.passed} passed
              </span>
              {checkCounts.failed > 0 ? (
                <span className="flex items-center gap-1 text-critical">
                  <XCircle className="h-3 w-3" aria-hidden="true" />
                  {checkCounts.failed} failed
                </span>
              ) : null}
              {checkCounts.warnings > 0 ? (
                <span className="flex items-center gap-1 text-high">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  {checkCounts.warnings} warning
                </span>
              ) : null}
              {checkCounts.inconclusive > 0 ? (
                <span className="flex items-center gap-1 text-muted">
                  <MinusCircle className="h-3 w-3" aria-hidden="true" />
                  {checkCounts.inconclusive} n/a
                </span>
              ) : null}
              <span className="text-muted">/{checkCounts.total} checks</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-line pt-3 lg:justify-end lg:border-t-0 lg:pt-0">
          <div className="min-w-[96px]">
            <div className="flex items-baseline gap-1 font-mono">
              <span className={`text-[14px] font-semibold tabular-nums ${config.color}`}>
                {result.earned_points.toFixed(0)}
              </span>
              <span className="text-[10px] text-muted">/ {result.max_points} pts</span>
              <span className="text-[9.5px] text-muted">({Math.round(pct)}%)</span>
            </div>
            <div className="mt-1.5 h-[3px] w-24 bg-line">
              <div className={`h-full ${config.barColor} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
            </div>
          </div>

          <span className={`shrink-0 rounded-[4px] border px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.08em] ${config.bg} ${config.color} ${config.border}`}>
            {config.label}
          </span>

          <span className="rounded-[6px] p-1 text-muted transition-colors group-hover:text-ink" aria-hidden="true">
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </span>
        </div>
      </div>

      {expanded ? (
        <div
          id={`test-${testKey}-details`}
          role="region"
          aria-label={`${result.name} evidence and remediation`}
          className="aegis-reveal space-y-4 border-t border-line bg-canvas px-4 py-5 sm:px-5"
        >
          <section>
            <div className="mb-2 flex items-center justify-between">
              <span className="aegis-label !text-[9.5px]">Verification checklist</span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                {result.findings.length} evaluated
              </span>
            </div>

            <ul className="aegis-panel divide-y divide-line">
              {result.findings.map((finding, i) => {
                const findingStatus = String(finding.status || 'inconclusive').toLowerCase();
                const severity = finding.severity as Severity | undefined;
                const check =
                  (finding.check as string | undefined) ??
                  (finding.name as string | undefined) ??
                  'Security check';
                const detail =
                  (finding.detail as string | undefined) ??
                  (finding.evidence as string | undefined) ??
                  (finding.value as string | undefined);
                const rule = finding.rule as string | undefined;
                const remediation = finding.remediation as string | undefined;

                const isPass = findingStatus === 'pass';
                const isFail = findingStatus === 'fail';
                const isWarn = findingStatus === 'warning';
                const isNA =
                  findingStatus === 'not_applicable' ||
                  findingStatus === 'inconclusive' ||
                  findingStatus === 'skipped';

                return (
                  <li key={i} className="px-3.5 py-3.5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {isPass ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-safe" aria-hidden="true" />
                        ) : isFail ? (
                          <XCircle className="h-4 w-4 shrink-0 text-critical" aria-hidden="true" />
                        ) : isWarn ? (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-high" aria-hidden="true" />
                        ) : (
                          <MinusCircle className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                        )}
                        <span className="truncate text-[12.5px] font-medium text-ink">{check}</span>
                        {rule ? (
                          <span className="shrink-0 border border-line px-1.5 py-0.5 font-mono text-[9px] text-muted">
                            {rule}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-2 pl-6 sm:pl-0">
                        {severity ? <SeverityBadge severity={severity} size="xs" /> : null}
                        <span
                          className={`border px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.06em] ${
                            isPass
                              ? 'border-safe/30 bg-safe/10 text-safe'
                              : isFail
                                ? 'border-critical/30 bg-critical/10 text-critical'
                                : isWarn
                                  ? 'border-high/30 bg-high/10 text-high'
                                  : 'border-line bg-elevated text-muted'
                          }`}
                        >
                          {isNA ? 'N/A' : findingStatus}
                        </span>
                      </div>
                    </div>

                    {detail ? (
                      <div className="relative mt-2 pl-6">
                        <p className="break-words border border-line bg-paper px-2.5 py-2 pr-11 font-mono text-[11px] leading-relaxed text-muted">
                          {String(detail)}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleCopyEvidence(String(detail), `finding-${i}`)}
                          className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-[6px] text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                          title="Copy detail"
                          aria-label="Copy finding detail"
                        >
                          {copiedKey === `finding-${i}` ? (
                            <Check className="h-3 w-3 text-safe" aria-hidden="true" />
                          ) : (
                            <Copy className="h-3 w-3" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    ) : null}

                    {remediation ? (
                      <div className="mt-2 ml-6 border-l-2 border-l-forest bg-safe/6 px-3 py-2">
                        <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-forest">
                          <Wrench className="h-3 w-3" aria-hidden="true" />
                          Remediation
                        </p>
                        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{remediation}</p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          {result.recommendations.length > 0 ? (
            <section className="border-l-2 border-l-forest bg-paper px-3.5 py-3">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-forest">Security recommendations</p>
              <ul className="mt-1.5 space-y-1">
                {result.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted">
                    <span className="mt-[7px] h-1 w-1 shrink-0 bg-forest" aria-hidden="true" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
