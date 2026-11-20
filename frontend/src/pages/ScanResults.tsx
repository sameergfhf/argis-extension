// src/pages/ScanResults.tsx — Security scan evaluation view
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Download,
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  Shield,
  LogIn,
  Search,
  Clock,
  ChevronDown,
  RotateCw,
  Copy,
  Check,
  Wrench,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useScan } from '../hooks/useScan';
import { getReportUrl, createScan } from '../services/api';
import ScoreCard from '../components/ScoreCard';
import TestResultCard from '../components/TestResultCard';
import LatencyChart from '../components/LatencyChart';
import FlowDiagram from '../components/FlowDiagram';
import FindingsChart from '../components/FindingsChart';
import RequestInspector from '../components/RequestInspector';
import SecurityHeadersMatrix from '../components/SecurityHeadersMatrix';
import { Button, SeverityBadge, Badge, Spinner } from '../components/ui';

const TEST_ORDER = ['tls', 'headers', 'leakage', 'reputation'] as const;

const VECTOR_LABELS: Record<string, string> = {
  tls: 'Transport / TLS',
  headers: 'Policy / headers',
  leakage: 'Disclosure / leakage',
  reputation: 'Intel / reputation',
};

export default function ScanResults() {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { scan, findings, visualizations, isLoading, isPolling, error, loadScan } = useScan();

  const [findingSearch, setFindingSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null);
  const [isRescanning, setIsRescanning] = useState(false);
  const [copiedEvidenceId, setCopiedEvidenceId] = useState<string | null>(null);

  useEffect(() => {
    if (scanId) {
      loadScan(scanId);
    }
  }, [scanId, loadScan]);

  const handleRescan = async () => {
    if (!scan?.url) return;
    try {
      setIsRescanning(true);
      toast.loading('Dispatching new audit for target…', { id: 'rescan' });
      const newScan = await createScan(scan.url, 'Re-scan triggered from results page');
      toast.success('New scan initiated!', { id: 'rescan' });
      navigate(`/scan/${newScan.id}`);
    } catch {
      toast.error('Failed to trigger re-scan', { id: 'rescan' });
    } finally {
      setIsRescanning(false);
    }
  };

  const handleCopyEvidence = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEvidenceId(id);
    toast.success('Evidence copied to clipboard');
    setTimeout(() => setCopiedEvidenceId(null), 2000);
  };

  if (isLoading && !scan) {
    return (
      <div className="aegis-container flex min-h-[60vh] items-center justify-center py-16">
        <div className="aegis-panel flex max-w-sm flex-col items-center gap-3 px-8 py-10 text-center">
          <Spinner size="lg" label="" />
          <p className="font-display text-[15px] font-semibold text-ink">Loading security telemetry</p>
          <p className="text-[11.5px] leading-relaxed text-muted">
            Retrieving scan metrics, findings, and behavior flow graph.
          </p>
        </div>
      </div>
    );
  }

  if (error && !scan) {
    return (
      <div className="aegis-container flex min-h-[60vh] items-center justify-center py-16">
        <div className="aegis-panel max-w-md px-6 py-8 text-center">
          <AlertCircle className="mx-auto h-6 w-6 text-critical" aria-hidden="true" />
          <h2 className="mt-3 font-display text-[17px] font-semibold text-ink">Error loading scan</h2>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{error}</p>
          <Button
            variant="secondary"
            size="md"
            className="mt-5"
            onClick={() => navigate(session ? '/dashboard' : '/')}
          >
            &larr; {session ? 'Back to dashboard' : 'Back to home'}
          </Button>
        </div>
      </div>
    );
  }

  if (!scan) return null;

  // Parse test results & response headers from result_json
  let testResults: Record<string, import('../types').TestResult> = {};
  let rawHeaders: Record<string, string> = {};
  try {
    if (scan.result_json) {
      const data = JSON.parse(scan.result_json);
      testResults = data.test_results ?? {};
      rawHeaders = data.response?.headers ?? {};
    }
  } catch {
    /* ignore */
  }

  const isRunning = scan.status === 'pending' || scan.status === 'running';
  const isFailed = scan.status === 'failed';

  const severityOptions = ['all', 'critical', 'high', 'medium', 'low', 'informational'];

  // Filter findings
  const filteredFindings = findings.filter((f) => {
    const matchesSearch =
      !findingSearch ||
      f.title.toLowerCase().includes(findingSearch.toLowerCase()) ||
      (f.description ?? '').toLowerCase().includes(findingSearch.toLowerCase());
    const matchesSeverity = severityFilter === 'all' || f.severity === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  const vectorCount = TEST_ORDER.filter((key) => testResults[key]).length;

  return (
    <div className="aegis-container aegis-reveal pb-16">
      {!session ? (
        <div className="mt-4 flex flex-col items-start justify-between gap-3 border border-line-strong bg-forest/5 px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5 text-forest">
            <Shield className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="text-[12px]">
              Viewing this assessment in <strong className="font-semibold">guest mode</strong>.
            </span>
          </div>
          <Link to="/auth" className="aegis-secondary-action">
            <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sm:hidden">Sign in to save</span>
            <span className="hidden sm:inline">Sign in to save to workspace history</span>
          </Link>
        </div>
      ) : null}

      <header className="aegis-page-header">
        <div className="min-w-0">
          <button
            onClick={() => navigate(session ? '/dashboard' : '/')}
            className="aegis-ghost-action -ml-2 mb-2 min-h-9 px-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{session ? 'Back to dashboard' : 'Back to home'}</span>
          </button>

          <p className="aegis-eyebrow">Assessment / result</p>

          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <h1 className="break-words font-mono text-[22px] font-semibold tracking-[-0.02em] text-ink sm:text-[26px]">
              {scan.hostname}
            </h1>
            {scan.url.startsWith('https://') ? (
              <Badge variant="success" size="xs">
                HTTPS
              </Badge>
            ) : null}
            {scan.duration_ms ? (
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {(scan.duration_ms / 1000).toFixed(2)}s probe
              </span>
            ) : null}
          </div>

          <p className="mt-2 max-w-2xl break-all font-mono text-[12px] text-muted">{scan.url}</p>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line pt-3 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
            <span>
              Status <span className="text-ink">{scan.status}</span>
            </span>
            <span>
              Vectors <span className="tabular-nums text-ink">{vectorCount}/4</span>
            </span>
            <span>
              Findings <span className="tabular-nums text-ink">{findings.length}</span>
            </span>
            <span>
              Scan ID <span className="text-ink">{scan.id.slice(0, 8)}</span>
            </span>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {isPolling ? (
            <div
              className="flex min-h-9 w-full items-center justify-center gap-2 border border-line-strong bg-canvas px-3 font-mono text-[10px] uppercase tracking-[0.08em] text-forest sm:w-auto"
              aria-live="polite"
            >
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <span>Scanning target…</span>
            </div>
          ) : null}

          {scan.status === 'completed' ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRescan}
                disabled={isRescanning}
                leftIcon={
                  <RotateCw
                    className={`h-3.5 w-3.5 ${isRescanning ? 'animate-spin text-forest' : ''}`}
                  />
                }
                className="w-full sm:w-auto"
              >
                Re-scan
              </Button>

              <a
                href={getReportUrl(scan.id)}
                download
                id="download-report-btn"
                className="aegis-primary-action w-full justify-center sm:w-auto"
                onClick={() => toast.success('Downloading compliance-ready PDF report…')}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>Export PDF report</span>
              </a>
            </>
          ) : null}
        </div>
      </header>

      {isRunning ? (
        <section
          className="aegis-panel border-line-strong"
          aria-live="polite"
          aria-busy="true"
          aria-label="Scan in progress"
        >
          <div className="aegis-panel-head">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-line-strong bg-canvas">
                <Shield className="h-4 w-4 text-forest" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="aegis-eyebrow">Live / probe</p>
                <p className="mt-1 font-display text-[15px] font-semibold text-ink">
                  Security audit in progress
                </p>
              </div>
            </div>
            <Badge variant="cyan" size="xs" pulse>
              Running
            </Badge>
          </div>

          <div className="px-4 py-4 sm:px-5">
            <p className="break-all font-mono text-[11px] text-muted">{scan.url}</p>
            <ol className="mt-4 grid gap-px bg-line sm:grid-cols-4">
              {TEST_ORDER.map((key) => (
                <li key={key} className="flex items-center gap-2 bg-paper px-3 py-2.5">
                  <span className="aegis-live-dot aegis-live-dot--pulse" aria-hidden="true" />
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                    {VECTOR_LABELS[key]}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {isFailed ? (
        <div
          className="mt-4 flex items-start gap-3 border border-critical/30 bg-critical/5 px-4 py-4"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-critical" aria-hidden="true" />
          <div>
            <p className="font-display text-[14px] font-semibold text-ink">Audit failed</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              {scan.error_message || 'The target host could not be audited or rejected connection.'}
            </p>
          </div>
        </div>
      ) : null}

      {scan.status === 'completed' ? (
        <div className="space-y-8 pt-8">
          <section className="grid items-stretch gap-4 xl:grid-cols-2" aria-label="Score and capture">
            <ScoreCard
              scan={scan}
              findings={findings}
              findingsBySeverity={visualizations?.findings_by_severity}
            />
            <RequestInspector scan={scan} />
          </section>

          <section aria-labelledby="vectors-heading" className="space-y-3">
            <div className="flex flex-col justify-between gap-2 border-b border-line pb-2.5 sm:flex-row sm:items-end">
              <div>
                <p className="aegis-eyebrow">Vectors / evaluation</p>
                <h2
                  id="vectors-heading"
                  className="mt-1.5 font-display text-[17px] font-semibold tracking-tight text-ink"
                >
                  Security vector evaluations
                </h2>
              </div>
              <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                Expand for checks &amp; evidence
              </p>
            </div>

            <div className="space-y-2.5">
              {TEST_ORDER.map((key) =>
                testResults[key] ? (
                  <TestResultCard key={key} testKey={key} result={testResults[key]} />
                ) : null,
              )}
            </div>
          </section>

          <section aria-labelledby="telemetry-heading" className="space-y-4">
            <div className="border-b border-line pb-2.5">
              <p className="aegis-eyebrow">Telemetry / visual</p>
              <h2
                id="telemetry-heading"
                className="mt-1.5 font-display text-[17px] font-semibold tracking-tight text-ink"
              >
                Headers, timing &amp; behaviour
              </h2>
            </div>

            {testResults.headers ? (
              <SecurityHeadersMatrix headersResult={testResults.headers} rawHeaders={rawHeaders} />
            ) : null}

            {visualizations ? (
              <>
                <div className="grid items-start gap-4 xl:grid-cols-2">
                  <LatencyChart latency={visualizations.latency} />
                  <FindingsChart
                    findingsBySeverity={visualizations.findings_by_severity}
                    findings={findings}
                  />
                </div>

                <FlowDiagram flow={visualizations.flow} />
              </>
            ) : null}
          </section>

          {findings.length > 0 ? (
            <section aria-labelledby="findings-heading" className="space-y-3">
              <div className="flex flex-col justify-between gap-3 border-b border-line pb-3 sm:flex-row sm:items-end">
                <div>
                  <p className="aegis-eyebrow">Findings / advisory</p>
                  <h2
                    id="findings-heading"
                    className="mt-1.5 font-display text-[17px] font-semibold tracking-tight text-ink"
                  >
                    Disclosed findings &amp; remediation
                  </h2>
                  <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                    {findings.length} total across all vectors
                  </p>
                </div>

                <div
                  role="group"
                  aria-label="Filter findings by severity"
                  className="flex flex-wrap items-center gap-1"
                >
                  {severityOptions.map((sev) => {
                    const count =
                      sev === 'all'
                        ? findings.length
                        : findings.filter((f) => f.severity === sev).length;
                    if (sev !== 'all' && count === 0) return null;
                    const active = severityFilter === sev;
                    return (
                      <button
                        key={sev}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSeverityFilter(sev)}
                        className={`flex min-h-9 items-center gap-1 border px-2 font-mono text-[9.5px] uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)] ${
                          active
                            ? 'border-ink bg-ink text-canvas'
                            : 'border-line bg-paper text-muted hover:text-ink'
                        }`}
                      >
                        {sev}
                        <span className={`tabular-nums ${active ? 'text-canvas/70' : 'text-muted'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="aegis-panel overflow-hidden">
                <div className="border-b border-line bg-canvas p-3 sm:px-4">
                  <div className="aegis-input-shell max-w-sm gap-2.5 px-3">
                    <Search className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                    <label htmlFor="finding-search" className="sr-only">
                      Search findings by title or keyword
                    </label>
                    <input
                      id="finding-search"
                      type="text"
                      placeholder="Search findings by title or keyword…"
                      value={findingSearch}
                      onChange={(e) => setFindingSearch(e.target.value)}
                      className="min-h-10 w-full bg-transparent font-mono text-[11.5px] text-ink outline-none placeholder:text-muted"
                    />
                  </div>
                </div>

                <div className="divide-y divide-line">
                  {filteredFindings.length === 0 ? (
                    <div className="px-6 py-10 text-center" role="status">
                      <Search className="mx-auto h-5 w-5 text-muted" aria-hidden="true" />
                      <p className="mt-2 font-display text-[14px] font-semibold text-ink">
                        No matching findings
                      </p>
                      <p className="mt-1 text-[11.5px] text-muted">
                        Try another keyword or clear the active filters.
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-3"
                        onClick={() => {
                          setFindingSearch('');
                          setSeverityFilter('all');
                        }}
                      >
                        Clear filters
                      </Button>
                    </div>
                  ) : (
                    filteredFindings.map((f) => {
                      const isExpanded = expandedFindingId === f.id;
                      return (
                        <div key={f.id} className="px-3.5 py-3.5 transition-colors hover:bg-canvas sm:px-4">
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            aria-controls={`finding-details-${f.id}`}
                            className="flex w-full items-start justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                            onClick={() => setExpandedFindingId(isExpanded ? null : f.id)}
                          >
                            <div className="flex min-w-0 items-start gap-2.5">
                              <SeverityBadge severity={f.severity} size="xs" className="mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold leading-snug text-ink">{f.title}</p>
                                {f.description ? (
                                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                                    {f.description}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <ChevronDown
                              className={`mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                              aria-hidden="true"
                            />
                          </button>

                          {isExpanded ? (
                            <div
                              id={`finding-details-${f.id}`}
                              role="region"
                              aria-label={`${f.title} details`}
                              className="aegis-reveal mt-3 space-y-2.5 border-t border-line pt-3"
                            >
                              {f.why_it_matters ? (
                                <div className="border-l-2 border-l-high bg-high/5 px-3.5 py-2.5">
                                  <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-high">
                                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                    Why it matters
                                  </span>
                                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                                    {f.why_it_matters}
                                  </p>
                                </div>
                              ) : null}

                              {f.remediation ? (
                                <div className="border-l-2 border-l-forest bg-safe/6 px-3.5 py-2.5">
                                  <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-forest">
                                    <Wrench className="h-3 w-3" aria-hidden="true" />
                                    Recommended remediation
                                  </span>
                                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                                    {f.remediation}
                                  </p>
                                </div>
                              ) : null}

                              {f.evidence ? (
                                <div className="border border-line bg-canvas">
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
                                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                                      Collected telemetry evidence
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyEvidence(f.id, f.evidence ?? '')}
                                      className="flex min-h-9 items-center gap-1.5 px-1.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                                      aria-label={copiedEvidenceId === f.id ? 'Evidence copied' : 'Copy evidence'}
                                    >
                                      {copiedEvidenceId === f.id ? (
                                        <Check className="h-3 w-3 text-safe" aria-hidden="true" />
                                      ) : (
                                        <Copy className="h-3 w-3" aria-hidden="true" />
                                      )}
                                      <span>{copiedEvidenceId === f.id ? 'Copied' : 'Copy'}</span>
                                    </button>
                                  </div>
                                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-[11px] leading-relaxed text-muted">
                                    {f.evidence}
                                  </pre>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
