import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Scan,
  AlertCircle,
  Globe,
  ArrowRight,
  Search,
  User,
  Users,
  Crosshair,
  RefreshCw,
  History,
  FileCode2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useScan } from '../hooks/useScan';
import { getScanHistory } from '../services/api';
import type { ScanSummary } from '../types';
import { Button, Badge, EmptyState, SeverityBadge } from '../components/ui';

const SAMPLE_PRESETS = [
  { label: 'GitHub', url: 'https://api.github.com' },
  { label: 'Stripe', url: 'https://api.stripe.com/v1/charges' },
  { label: 'JSONPlaceholder', url: 'https://jsonplaceholder.typicode.com/posts' },
  { label: 'HTTPBin', url: 'https://httpbin.org/get' },
];

const GUARDRAILS = [
  { label: 'SSRF guard', detail: 'Private, loopback, and metadata ranges rejected before connect.' },
  { label: 'Non-destructive', detail: 'Observable probes only. No writes, fuzzing, or payloads.' },
  { label: 'Secret redaction', detail: 'Tokens and credentials removed from captured evidence.' },
  { label: 'Coverage aware', detail: 'Unassessed checks reduce coverage, not the observed score.' },
];

function formatStarted(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function scoreTone(score?: number | null) {
  if (score === undefined || score === null) return { text: 'text-muted', grade: '—' };
  if (score >= 90) return { text: 'text-safe', grade: 'A+' };
  if (score >= 75) return { text: 'text-info', grade: 'B' };
  if (score >= 50) return { text: 'text-medium', grade: 'C' };
  return { text: 'text-critical', grade: 'F' };
}

const statusTone: Record<string, string> = {
  completed: 'bg-safe',
  running: 'bg-forest',
  pending: 'bg-medium',
  failed: 'bg-critical',
  cancelled: 'bg-muted',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { isLoading, error, startScan, scan } = useScan();
  const [url, setUrl] = useState('');
  const [scanScope, setScanScope] = useState<'workspace' | 'personal'>('workspace');
  const [recentScans, setRecentScans] = useState<ScanSummary[]>([]);
  const [totalScans, setTotalScans] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error'>('loading');

  const loadRecentScans = useCallback(() => {
    setHistoryState('loading');
    getScanHistory(10, 0, 'workspace', currentWorkspace?.id)
      .then((r) => {
        setRecentScans(r.scans);
        setTotalScans(r.total);
        setHistoryState('ready');
      })
      .catch(() => setHistoryState('error'));
  }, [currentWorkspace?.id]);

  useEffect(() => {
    loadRecentScans();
  }, [loadRecentScans]);

  useEffect(() => {
    if (scan?.status === 'completed') navigate(`/scan/${scan.id}`);
  }, [scan, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return toast.error('Please enter an API URL to scan.');
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return toast.error('URL must begin with http:// or https://');
    }
    const targetWorkspaceId = user && scanScope === 'workspace' ? currentWorkspace?.id : null;
    await startScan(trimmed, undefined, targetWorkspaceId);
  };

  const completedScans = recentScans.filter(
    (s) => s.assessment_score !== undefined && s.assessment_score !== null,
  );
  const avgScore =
    completedScans.length > 0
      ? completedScans.reduce((acc, s) => acc + (s.assessment_score ?? 0), 0) / completedScans.length
      : null;
  const passedScans = completedScans.filter((s) => (s.assessment_score ?? 0) >= 75).length;
  const criticalExposures = completedScans.filter((s) => (s.assessment_score ?? 0) < 50).length;
  const filteredRecentScans = recentScans.filter(
    (s) =>
      !searchQuery ||
      s.hostname.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.url.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const watching = scan?.status === 'running' || scan?.status === 'pending';

  return (
    <div className="aegis-container pb-16">
      <header className="aegis-page-header">
        <div className="min-w-0">
          <p className="aegis-eyebrow">Workspace / {currentWorkspace?.name ?? 'Personal'}</p>
          <h1 className="aegis-page-title">Run a scan. Read the evidence.</h1>
          <p className="aegis-lede mt-4">
            One deterministic pass across transport, policy, leakage, and reputation — then a score you can
            trace back to each observation.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/history')}
            leftIcon={<History className="h-3.5 w-3.5" />}
          >
            History
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/spec')}
            leftIcon={<FileCode2 className="h-3.5 w-3.5" />}
          >
            Spec analyzer
          </Button>
        </div>
      </header>

      <section className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div className="aegis-panel">
          <div className="aegis-panel-head">
            <div className="flex items-center gap-3">
              <span className="aegis-index">01</span>
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight text-ink">New assessment</h2>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  Direct endpoint probe
                </p>
              </div>
            </div>
            <Badge variant="success" size="xs">
              <Shield className="h-3 w-3" aria-hidden="true" />
              Non-destructive
            </Badge>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 p-4 sm:p-5">
            {user ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="aegis-label mr-1">Retain in</span>
                <div className="flex border border-line-strong" role="group" aria-label="Scan retention scope">
                  <button
                    type="button"
                    aria-pressed={scanScope === 'workspace'}
                    onClick={() => setScanScope('workspace')}
                    className={`flex min-h-9 items-center gap-1.5 px-3 font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors ${
                      scanScope === 'workspace' ? 'bg-ink text-canvas' : 'bg-paper text-muted hover:text-ink'
                    }`}
                  >
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    Team
                  </button>
                  <button
                    type="button"
                    aria-pressed={scanScope === 'personal'}
                    onClick={() => setScanScope('personal')}
                    className={`flex min-h-9 items-center gap-1.5 border-l border-line-strong px-3 font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors ${
                      scanScope === 'personal' ? 'bg-ink text-canvas' : 'bg-paper text-muted hover:text-ink'
                    }`}
                  >
                    <User className="h-3.5 w-3.5" aria-hidden="true" />
                    Personal
                  </button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="aegis-input-shell min-w-0 flex-1 gap-3 px-4">
                <Globe className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                <label htmlFor="api-url-input" className="sr-only">
                  Target API URL
                </label>
                <input
                  id="api-url-input"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://api.domain.com/v1/health"
                  className="min-h-12 w-full bg-transparent font-mono text-[13px] text-ink outline-none placeholder:text-muted"
                  disabled={isLoading || watching}
                />
              </div>
              <Button
                id="start-scan-btn"
                type="submit"
                variant="primary"
                disabled={!url.trim() || isLoading || watching}
                isLoading={isLoading || watching}
                leftIcon={<Scan className="h-4 w-4" />}
                className="w-full shrink-0 justify-center sm:w-auto"
              >
                {watching ? 'Probing…' : 'Run scan'}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="aegis-label">Presets</span>
              {SAMPLE_PRESETS.map((preset) => (
                <button
                  key={preset.url}
                  type="button"
                  onClick={() => setUrl(preset.url)}
                  disabled={isLoading || watching}
                  className="inline-flex min-h-6 items-center font-mono text-[11px] text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink disabled:text-faint disabled:no-underline"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {watching ? (
              <div aria-live="polite" className="border border-line-strong bg-canvas px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                    <span className="aegis-live-dot aegis-live-dot--pulse" aria-hidden="true" />
                    Probe in progress
                  </p>
                  <Badge variant="cyan" size="xs">
                    {scan?.status}
                  </Badge>
                </div>
                <p className="mt-1 truncate font-mono text-[10.5px] text-muted">{scan?.url}</p>
              </div>
            ) : null}

            {error ? (
              <div role="alert" className="flex items-start gap-2 border border-critical/30 bg-critical/8 px-4 py-3 text-[12.5px] text-critical">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            <p className="border-t border-line pt-3 font-mono text-[10px] uppercase leading-relaxed tracking-[0.08em] text-muted">
              Probe sequence runs server-side. Destructive methods require explicit confirmation in operation scan.
            </p>
          </form>
        </div>

        <aside className="aegis-panel">
          <div className="aegis-panel-head">
            <div className="flex items-center gap-3">
              <span className="aegis-index">02</span>
              <h2 className="text-[15px] font-semibold tracking-tight text-ink">Guardrails</h2>
            </div>
            <Shield className="h-4 w-4 text-forest" aria-hidden="true" />
          </div>
          <dl>
            {GUARDRAILS.map((item) => (
              <div key={item.label} className="border-b border-line px-4 py-3 last:border-b-0 sm:px-5">
                <dt className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink">
                  <span className="h-1 w-1 bg-safe" aria-hidden="true" />
                  {item.label}
                </dt>
                <dd className="mt-1.5 text-[12px] leading-relaxed text-muted">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </section>

      <section aria-label="Scan summary metrics" className="grid grid-cols-2 border border-line bg-paper sm:grid-cols-4">
        {[
          { label: 'Monitored', value: totalScans, note: 'Retained scans', tone: 'text-ink' },
          {
            label: 'Average',
            value: avgScore !== null ? avgScore.toFixed(0) : '—',
            note: 'Last 10 completed',
            tone: 'text-ink',
          },
          { label: 'Passing', value: passedScans, note: 'Score ≥ 75', tone: 'text-safe' },
          { label: 'Attention', value: criticalExposures, note: 'Score < 50', tone: 'text-critical' },
        ].map((metric, index) => (
          <div
            key={metric.label}
            className={`px-4 py-5 sm:px-5 ${index % 2 === 1 ? 'border-l border-line' : ''} ${index > 1 ? 'border-t border-line sm:border-t-0' : ''} ${index === 2 ? 'sm:border-l' : ''}`}
          >
            <p className="aegis-metric-label">{metric.label}</p>
            <p className={`aegis-metric-value mt-2 ${metric.tone}`}>{metric.value}</p>
            <p className="aegis-metric-note mt-2">{metric.note}</p>
          </div>
        ))}
      </section>

      <section className="mt-12">
        <div className="flex flex-col gap-4 border-b border-line-strong pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="aegis-eyebrow">Assessments</p>
            <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-ink">Recent scans</h2>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                aria-label="Filter recent scans"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter hostname or URL"
                className="min-h-10 w-full rounded-[6px] border border-line-strong bg-paper py-2 pl-9 pr-3 font-mono text-[11.5px] text-ink outline-none placeholder:text-muted focus:border-forest focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--aegis-focus)_14%,transparent)]"
              />
            </div>
            {recentScans.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/history')}
                rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                className="shrink-0"
              >
                All
              </Button>
            ) : null}
          </div>
        </div>

        {historyState === 'error' ? (
          <div className="mt-5 flex flex-col items-start gap-3 border border-critical/30 bg-critical/8 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-critical">History unavailable</p>
              <p className="mt-1 text-[13px] text-muted">The scan history service did not respond.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={loadRecentScans} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
              Retry
            </Button>
          </div>
        ) : historyState === 'loading' ? (
          <div className="mt-5 space-y-2" aria-busy="true" aria-label="Loading recent scans">
            {[0, 1, 2].map((row) => (
              <div key={row} className="skeleton h-16 w-full" />
            ))}
          </div>
        ) : filteredRecentScans.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              icon={searchQuery ? Search : Shield}
              title={searchQuery ? 'No matching scans' : 'No scans yet'}
              description={
                searchQuery
                  ? `Nothing in the last ten scans matches “${searchQuery}”.`
                  : 'Paste an API URL above to run the first assessment for this workspace.'
              }
              action={
                searchQuery ? (
                  <Button variant="secondary" size="sm" onClick={() => setSearchQuery('')}>
                    Clear filter
                  </Button>
                ) : (
                  <Button
                    variant="signal"
                    size="sm"
                    onClick={() => setUrl('https://api.github.com')}
                    leftIcon={<Crosshair className="h-3.5 w-3.5" />}
                  >
                    Use GitHub API
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <ul className="border-b border-line">
            {filteredRecentScans.map((s, index) => {
              const tone = scoreTone(s.assessment_score);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/scan/${s.id}`)}
                    className="group grid w-full grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-line px-1 py-4 text-left transition-colors last:border-b-0 hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--aegis-focus)] md:grid-cols-[32px_minmax(0,1fr)_100px_140px_120px_24px]"
                  >
                    <span className="hidden font-mono text-[10px] text-muted md:block">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">{s.hostname}</span>
                      <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted">{s.url}</span>
                    </span>
                    <span className="text-right md:text-left">
                      <span className={`font-display text-xl font-semibold leading-none tracking-tight ${tone.text}`}>
                        {s.assessment_score !== undefined && s.assessment_score !== null
                          ? s.assessment_score.toFixed(0)
                          : '—'}
                      </span>
                      <span className="ml-1 font-mono text-[9.5px] text-muted">{tone.grade}</span>
                    </span>
                    <span className="col-start-2 flex items-center gap-2 md:col-start-auto">
                      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                        <span className={`h-1.5 w-1.5 ${statusTone[s.status] ?? 'bg-muted'}`} aria-hidden="true" />
                        {s.status}
                      </span>
                      {s.highest_severity ? <SeverityBadge severity={s.highest_severity} size="xs" /> : null}
                    </span>
                    <span className="col-start-2 font-mono text-[10px] text-muted md:col-start-auto">
                      <time dateTime={s.started_at}>{formatStarted(s.started_at)}</time>
                    </span>
                    <ArrowRight
                      className="col-start-3 row-start-1 hidden h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-forest md:block"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
