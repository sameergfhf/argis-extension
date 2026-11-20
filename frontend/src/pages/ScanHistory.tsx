// src/pages/ScanHistory.tsx — Security audit log & delta comparison
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History,
  GitCompare,
  Search,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  X,
  User,
  Users,
  Shield,
  Lock,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { getScanHistory, compareScans } from '../services/api';
import type { ScanSummary, ComparisonResult } from '../types';
import { Button, SeverityBadge, EmptyState, Spinner } from '../components/ui';
import toast from 'react-hot-toast';

function ScoreChange({ change }: { change?: number }) {
  if (change === undefined || change === null) return null;
  if (change > 0) {
    return (
      <span className="flex items-center justify-center gap-1 font-mono text-safe">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />+{change.toFixed(1)}
      </span>
    );
  }
  if (change < 0) {
    return (
      <span className="flex items-center justify-center gap-1 font-mono text-critical">
        <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
        {change.toFixed(1)}
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center gap-1 font-mono text-muted">
      <Minus className="h-3 w-3" aria-hidden="true" />0.0
    </span>
  );
}

function scoreTone(score?: number | null) {
  if (score === undefined || score === null) return 'text-muted border-line bg-elevated';
  if (score >= 90) return 'text-safe border-safe/30 bg-safe/10';
  if (score >= 70) return 'text-info border-info/30 bg-info/10';
  if (score >= 50) return 'text-medium border-medium/30 bg-medium/10';
  return 'text-critical border-critical/30 bg-critical/10';
}

function ScoreBadge({ score }: { score?: number | null }) {
  if (score === undefined || score === null) {
    return <span className="font-mono text-[11px] tabular-nums text-muted">—</span>;
  }
  return (
    <span
      className={`inline-flex items-center border px-1.5 py-1 font-mono text-[10.5px] font-medium tabular-nums ${scoreTone(
        score,
      )}`}
    >
      {score.toFixed(0)}/100
    </span>
  );
}

export default function ScanHistory() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [scope, setScope] = useState<'workspace' | 'my'>('workspace');
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [myTotal, setMyTotal] = useState(0);
  const [workspaceTotal, setWorkspaceTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'failed'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isComparing, setIsComparing] = useState(false);

  const fetchScans = useCallback(
    (currentScope: 'workspace' | 'my' = scope) => {
      if (!user) {
        setScans([]);
        setTotal(0);
        setMyTotal(0);
        setWorkspaceTotal(0);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      getScanHistory(
        50,
        0,
        currentScope,
        currentScope === 'workspace' ? currentWorkspace?.id : undefined,
      )
        .then((r) => {
          setScans(r.scans);
          setTotal(r.total);
          if (r.my_total !== undefined) setMyTotal(r.my_total);
          if (r.workspace_total !== undefined) setWorkspaceTotal(r.workspace_total);
        })
        .catch(() => toast.error('Failed to load scan history'))
        .finally(() => setIsLoading(false));
    },
    [user, currentWorkspace?.id, scope],
  );

  useEffect(() => {
    fetchScans(scope);
  }, [fetchScans, scope]);

  const filtered = scans.filter((s) => {
    const matchesSearch =
      s.hostname.toLowerCase().includes(search.toLowerCase()) ||
      s.url.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const handleCompare = async () => {
    if (selectedIds.length !== 2) {
      toast.error('Select exactly 2 scans to compare');
      return;
    }
    setIsComparing(true);
    try {
      const result = await compareScans(selectedIds[0], selectedIds[1]);
      setComparison(result);
      toast.success('Delta analysis generated!');
    } catch {
      toast.error('Comparison calculation failed');
    } finally {
      setIsComparing(false);
    }
  };

  const coverageLabel = (value?: number | null) => {
    if (value === undefined || value === null) return '—';
    return value <= 1 ? `${Math.round(value * 100)}%` : `${Math.round(value)}%`;
  };

  const newFindings = comparison?.finding_changes?.filter((f) => f.status === 'new') ?? [];
  const resolvedFindings =
    comparison?.finding_changes?.filter((f) => f.status === 'not_detected') ?? [];

  return (
    <div className="aegis-container pb-24 pt-6 lg:pb-16">
      <header className="aegis-page-header">
        <div className="min-w-0">
          <p className="aegis-eyebrow">Ledger / history</p>
          <h1 className="aegis-page-title">Audit log &amp; posture tracking</h1>
          <p className="aegis-lede mt-3">
            Every observable probe on record. Select any two entries to compute a posture delta
            against the same baseline.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line pt-3 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
            <span>
              Entries <span className="tabular-nums text-ink">{total}</span>
            </span>
            <span>
              Team <span className="tabular-nums text-ink">{workspaceTotal || 0}</span>
            </span>
            <span>
              Personal <span className="tabular-nums text-ink">{myTotal}</span>
            </span>
          </div>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => navigate('/dashboard')}
          leftIcon={<Sparkles className="h-3.5 w-3.5" />}
          className="w-full sm:w-auto"
        >
          New security probe
        </Button>
      </header>

      <section className="border-b border-line py-4" aria-label="Scope and retention">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="aegis-label mr-0.5">Retain in</span>
            <div className="flex border border-line-strong" role="group" aria-label="History scope">
              <button
                type="button"
                aria-pressed={scope === 'workspace'}
                onClick={() => setScope('workspace')}
                className={`flex min-h-9 items-center gap-1.5 px-3 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--aegis-focus)] ${
                  scope === 'workspace' ? 'bg-ink text-canvas' : 'bg-paper text-muted hover:text-ink'
                }`}
              >
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                Team
                <span className={`tabular-nums ${scope === 'workspace' ? 'text-canvas/70' : 'text-muted'}`}>
                  {workspaceTotal || (scope === 'workspace' ? total : 0)}
                </span>
              </button>
              <button
                type="button"
                aria-pressed={scope === 'my'}
                onClick={() => {
                  if (!user) {
                    toast('Sign in to view your private personal scans');
                    return;
                  }
                  setScope('my');
                }}
                className={`flex min-h-9 items-center gap-1.5 border-l border-line-strong px-3 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--aegis-focus)] ${
                  scope === 'my' ? 'bg-ink text-canvas' : 'bg-paper text-muted hover:text-ink'
                }`}
              >
                <User className="h-3.5 w-3.5" aria-hidden="true" />
                Personal
                {user ? (
                  <span className={`tabular-nums ${scope === 'my' ? 'text-canvas/70' : 'text-muted'}`}>
                    {myTotal}
                  </span>
                ) : null}
              </button>
            </div>
          </div>

          <p className="flex items-center gap-1.5 px-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
            <Shield className="h-3.5 w-3.5 text-forest" aria-hidden="true" />
            {scope === 'my'
              ? 'Personal scans only'
              : `Team scope · ${currentWorkspace?.name ?? 'Workspace'}`}
          </p>
        </div>
      </section>

      <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="aegis-input-shell max-w-md flex-1 gap-2.5 px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
          <label htmlFor="history-search" className="sr-only">
            Search scans by hostname or URL
          </label>
          <input
            id="history-search"
            type="text"
            placeholder="Search by hostname, path, or URL"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 w-full bg-transparent font-mono text-[12px] text-ink outline-none placeholder:text-muted"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div
          role="group"
          aria-label="Filter by status"
          className="flex items-center gap-1 self-start sm:self-auto"
        >
          {[
            { id: 'all', label: 'All' },
            { id: 'completed', label: 'Completed' },
            { id: 'failed', label: 'Failed' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={statusFilter === tab.id}
              onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
              className={`flex min-h-9 items-center border px-2.5 font-mono text-[9.5px] uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)] ${
                statusFilter === tab.id
                  ? 'border-ink bg-ink text-canvas'
                  : 'border-line bg-paper text-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {!user ? (
        <EmptyState
          icon={Lock}
          title="Guest mode active"
          description="Scan history is not stored or retrieved in guest mode. Sign in to persist security telemetry, view team scans, and track posture trends."
          action={
            <Button variant="primary" size="md" onClick={() => navigate('/auth')}>
              Sign in / register
            </Button>
          }
        />
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center gap-2.5 border border-line bg-paper py-20">
          <Spinner size="md" label="" />
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            Loading audit logs…
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={History}
          title={search ? 'No matching scans' : 'No scans recorded yet'}
          description={
            search
              ? `No audit logs match "${search}". Try resetting your search filter.`
              : 'Launch a new scan to start recording security posture history.'
          }
          action={
            search ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                }}
              >
                Reset filters
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => navigate('/dashboard')}>
                Launch live scan
              </Button>
            )
          }
        />
      ) : (
        <>
          <ul className="space-y-2.5 md:hidden" aria-label="Scan history cards">
            {filtered.map((s) => {
              const isSelected = selectedIds.includes(s.id);
              return (
                <li
                  key={s.id}
                  className={`border bg-paper p-3.5 transition-colors ${
                    isSelected ? 'border-forest/50' : 'border-line'
                  }`}
                >
                  <div className="mb-2.5 flex items-center justify-between gap-3">
                    <label className="flex min-h-9 cursor-pointer items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(s.id)}
                        aria-label={`Select ${s.hostname} for comparison`}
                        className="h-4 w-4 accent-[var(--color-forest)]"
                      />
                      Compare
                    </label>
                    <ScoreBadge score={s.assessment_score} />
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(`/scan/${s.id}`)}
                    className="block w-full rounded-[6px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                  >
                    <p className="break-words font-mono text-[12.5px] font-semibold text-ink">
                      {s.hostname}
                    </p>
                    <p className="mt-1 break-all font-mono text-[10.5px] text-muted">{s.url}</p>
                  </button>

                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-line pt-3">
                    <div>
                      <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                        Status
                      </dt>
                      <dd
                        className={`mt-0.5 text-[11.5px] font-medium capitalize ${
                          s.status === 'completed'
                            ? 'text-safe'
                            : s.status === 'failed'
                              ? 'text-critical'
                              : 'text-medium'
                        }`}
                      >
                        {s.status}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                        Coverage
                      </dt>
                      <dd className="mt-0.5 font-mono text-[11.5px] tabular-nums text-ink">
                        {coverageLabel(s.assessment_coverage)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                        Started
                      </dt>
                      <dd className="mt-0.5 font-mono text-[10.5px] text-ink">
                        {new Date(s.started_at).toLocaleString([], {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                        Peak severity
                      </dt>
                      <dd className="mt-1">
                        {s.highest_severity ? (
                          <SeverityBadge severity={s.highest_severity} size="xs" />
                        ) : (
                          <span className="text-[10.5px] text-muted">None</span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-2.5">
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
                      {s.workspace_id ? 'Team scan' : 'Personal scan'}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/scan/${s.id}`)}
                      rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                    >
                      Open report
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="aegis-panel hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="aegis-table w-full text-left">
                <caption className="sr-only">
                  Scan history. Select rows to compare two scans.
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-12 px-3 text-center">
                      <span className="sr-only">Compare</span>
                    </th>
                    <th scope="col">Target</th>
                    <th scope="col">Timestamp</th>
                    <th scope="col">Status</th>
                    <th scope="col">Score</th>
                    <th scope="col">Coverage</th>
                    <th scope="col">Peak</th>
                    <th scope="col">Scope</th>
                    <th scope="col" className="text-right">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const isSelected = selectedIds.includes(s.id);
                    return (
                      <tr
                        key={s.id}
                        tabIndex={0}
                        aria-selected={isSelected}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleSelect(s.id);
                          }
                        }}
                        className={`cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--aegis-focus)] ${
                          isSelected ? 'bg-forest/6' : 'hover:bg-canvas'
                        }`}
                        onClick={() => toggleSelect(s.id)}
                      >
                        <td className="px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(s.id)}
                            aria-label={`Select ${s.hostname} for comparison`}
                            className="h-4 w-4 accent-[var(--color-forest)]"
                          />
                        </td>

                        <td>
                          <p className="max-w-[220px] truncate font-mono text-[11.5px] font-medium text-ink">
                            {s.hostname}
                          </p>
                          <p className="max-w-[260px] truncate font-mono text-[10px] text-muted">
                            {s.url}
                          </p>
                        </td>

                        <td className="whitespace-nowrap">
                          <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-muted">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            <span>{new Date(s.started_at).toLocaleDateString()}</span>
                            <span className="tabular-nums text-muted">
                              {new Date(s.started_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </span>
                        </td>

                        <td>
                          <span
                            className={`inline-flex items-center gap-1.5 border px-1.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.06em] ${
                              s.status === 'completed'
                                ? 'border-safe/30 bg-safe/10 text-safe'
                                : s.status === 'failed'
                                  ? 'border-critical/30 bg-critical/10 text-critical'
                                  : 'border-medium/30 bg-medium/10 text-medium'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 ${
                                s.status === 'completed'
                                  ? 'bg-safe'
                                  : s.status === 'failed'
                                    ? 'bg-critical'
                                    : 'bg-medium'
                              }`}
                              aria-hidden="true"
                            />
                            {s.status}
                          </span>
                        </td>

                        <td>
                          <ScoreBadge score={s.assessment_score} />
                        </td>

                        <td className="font-mono text-[10.5px] tabular-nums text-muted">
                          {coverageLabel(s.assessment_coverage)}
                        </td>

                        <td>
                          {s.highest_severity ? (
                            <SeverityBadge severity={s.highest_severity} size="xs" />
                          ) : (
                            <span className="font-mono text-[10.5px] text-muted">—</span>
                          )}
                        </td>

                        <td>
                          {s.workspace_id ? (
                            <span className="inline-flex items-center gap-1 border border-line bg-elevated px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                              <Users className="h-2.5 w-2.5" aria-hidden="true" />
                              Team
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 border border-forest/30 bg-forest/8 px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.06em] text-forest">
                              <User className="h-2.5 w-2.5" aria-hidden="true" />
                              Personal
                            </span>
                          )}
                        </td>

                        <td className="text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => navigate(`/scan/${s.id}`)}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-[6px] text-muted transition-colors hover:bg-elevated hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                            aria-label={`Open assessment for ${s.hostname}`}
                            title="Open full assessment"
                          >
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selectedIds.length > 0 ? (
        <div className="fixed bottom-20 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 px-1 lg:bottom-6">
          <div className="aegis-reveal flex flex-col items-stretch justify-between gap-3 border border-line-strong bg-paper p-3 shadow-[var(--shadow-overlay)] sm:flex-row sm:items-center">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-forest/30 bg-forest/10 text-forest">
                <GitCompare className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink">
                  {selectedIds.length}/2 scans selected
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {selectedIds.length === 1
                    ? 'Select one more to compare'
                    : 'Ready to calculate posture delta'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
                Clear
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCompare}
                disabled={selectedIds.length !== 2 || isComparing}
                isLoading={isComparing}
                leftIcon={<GitCompare className="h-3.5 w-3.5" />}
              >
                Compare
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {comparison ? (
        <section
          className="aegis-reveal aegis-panel mt-4"
          aria-label="Posture delta analysis"
        >
          <div className="aegis-panel-head">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-line bg-canvas text-forest">
                <GitCompare className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="aegis-eyebrow">Comparison / delta</p>
                <h2 className="mt-1 font-display text-[15px] font-semibold tracking-tight text-ink">
                  Posture delta analysis
                </h2>
                <p className="mt-0.5 truncate font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                  Baseline {comparison.scan_a?.id.slice(0, 8) ?? 'A'} → target{' '}
                  {comparison.scan_b?.id.slice(0, 8) ?? 'B'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setComparison(null)}
              aria-label="Dismiss comparison"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] text-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <dl className="grid gap-px border-b border-line bg-line sm:grid-cols-3">
            <div className="bg-canvas px-4 py-3.5">
              <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                Score differential
              </dt>
              <dd className="mt-1.5 font-mono text-[18px] font-semibold tabular-nums">
                <ScoreChange change={comparison.score_change} />
              </dd>
            </div>

            <div className="bg-canvas px-4 py-3.5">
              <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                Coverage differential
              </dt>
              <dd className="mt-1.5 font-mono text-[18px] font-semibold tabular-nums">
                <ScoreChange change={comparison.coverage_change} />
              </dd>
            </div>

            <div className="bg-canvas px-4 py-3.5">
              <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                Latency variance
              </dt>
              <dd className="mt-1.5 font-mono text-[18px] font-semibold tabular-nums text-forest">
                {comparison.latency_change_ms !== undefined && comparison.latency_change_ms !== null
                  ? `${comparison.latency_change_ms > 0 ? '+' : ''}${comparison.latency_change_ms.toFixed(0)}ms`
                  : '—'}
              </dd>
            </div>
          </dl>

          <div className="grid gap-px bg-line md:grid-cols-2">
            <div className="border-l-2 border-l-critical bg-paper px-4 py-3.5">
              <div className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-critical">
                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                New vulnerabilities
                <span className="tabular-nums text-muted">({newFindings.length})</span>
              </div>
              {newFindings.length === 0 ? (
                <p className="mt-1.5 text-[11.5px] text-muted">Zero new regressions introduced.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {newFindings.map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5 font-mono text-[10.5px] text-muted">
                      <span className="mt-[6px] h-1 w-1 shrink-0 bg-critical" aria-hidden="true" />
                      <span>{f.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-l-2 border-l-safe bg-paper px-4 py-3.5">
              <div className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-safe">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Remediated
                <span className="tabular-nums text-muted">({resolvedFindings.length})</span>
              </div>
              {resolvedFindings.length === 0 ? (
                <p className="mt-1.5 text-[11.5px] text-muted">No previous findings resolved.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {resolvedFindings.map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5 font-mono text-[10.5px] text-muted">
                      <span className="mt-[6px] h-1 w-1 shrink-0 bg-safe" aria-hidden="true" />
                      <span>{f.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
