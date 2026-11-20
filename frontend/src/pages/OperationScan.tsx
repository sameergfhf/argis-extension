// src/pages/OperationScan.tsx — Target endpoint security probe with deterministic telemetry
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Download,
  FileCode,
  Key,
  Loader2,
  Play,
  ShieldCheck,
  Tag,
  ExternalLink,
} from 'lucide-react';

import type { EndpointInfo, OperationContext, OperationScanRequest, Scan, SpecAnalysis } from '../types';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { getScan, getErrorMessage, scanOperation, getReportUrl } from '../services/api';
import ScoreCard from '../components/ScoreCard';
import TestResultCard from '../components/TestResultCard';
import { Button, MethodBadge, Badge } from '../components/ui';

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 80;

const DESTRUCTIVE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface OperationScanLocationState {
  specId: string;
  baseUrl: string;
  specUrl: string;
  endpoint: EndpointInfo;
  specTitle?: string;
  specVersion?: string;
  specAnalysis: SpecAnalysis;
}

function extractPathParams(path: string): string[] {
  const matches = path.match(/\{([^}]+)\}/g) ?? [];
  return matches.map((m) => m.slice(1, -1));
}

function SectionHeader({ icon, title, note }: { icon: React.ReactNode; title: string; note?: string }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
        <span className="text-forest" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h3>
      {note ? (
        <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted">{note}</span>
      ) : null}
    </div>
  );
}

function OperationContextBanner({ context }: { context: OperationContext; scan?: Scan }) {
  return (
    <div className="border border-line-strong bg-forest/5 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <FileCode size={18} className="mt-0.5 shrink-0 text-forest" aria-hidden="true" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <MethodBadge method={context.method} size="xs" />
            <code className="truncate font-mono text-[12px] font-semibold text-ink">
              {context.resolved_path}
            </code>
          </div>
          {context.summary ? (
            <p className="mt-1 text-[11.5px] text-muted">{context.summary}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {context.spec_title ? (
              <span className="flex items-center gap-1 border border-line bg-paper px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                <Tag size={10} aria-hidden="true" />
                {context.spec_title}
                {context.spec_version ? ` v${context.spec_version}` : ''}
              </span>
            ) : null}
            <span className="flex items-center gap-1 border border-safe/30 bg-safe/10 px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.06em] text-safe">
              <ShieldCheck size={10} aria-hidden="true" />
              Isolated endpoint audit
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OperationScan() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as OperationScanLocationState | null;

  useEffect(() => {
    if (!state?.specId || !state?.endpoint) {
      navigate('/spec', { replace: true });
    }
  }, [state, navigate]);

  if (!state?.specId || !state?.endpoint) {
    return null;
  }

  return <OperationScanInner state={state} />;
}

function OperationScanInner({ state }: { state: OperationScanLocationState }) {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { specId, baseUrl, specUrl, endpoint, specTitle, specAnalysis } = state;

  const [baseUrlInput, setBaseUrlInput] = useState<string>(() => {
    if (baseUrl?.startsWith('http://') || baseUrl?.startsWith('https://')) {
      return baseUrl;
    }
    if (specUrl) {
      try {
        const u = new URL(specUrl);
        const host = `${u.protocol}//${u.host}`;
        const relativePart = baseUrl?.startsWith('/') ? baseUrl : '';
        return `${host}${relativePart}`;
      } catch {
        /* ignore */
      }
    }
    return '';
  });

  const baseUrlError =
    baseUrlInput.trim() === ''
      ? 'Required — enter the full base URL (e.g. https://api.example.com)'
      : !baseUrlInput.startsWith('http://') && !baseUrlInput.startsWith('https://')
        ? "Must start with 'http://' or 'https://'"
        : '';

  const pathParams = useMemo(() => extractPathParams(endpoint.path), [endpoint.path]);
  const [paramValues, setParamValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(pathParams.map((p) => [p, ''])),
  );

  const [authHeader, setAuthHeader] = useState('');
  const [showAuth, setShowAuth] = useState(false);

  const [bodyText, setBodyText] = useState('');

  const isDestructive = DESTRUCTIVE_METHODS.has(endpoint.method.toUpperCase());
  const [confirmed, setConfirmed] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [scan, setScan] = useState<Scan | null>(null);
  const [operationContext, setOperationContext] = useState<OperationContext | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback(
    (scanId: string) => {
      pollCount.current = 0;
      pollRef.current = setInterval(async () => {
        pollCount.current += 1;
        if (pollCount.current > MAX_POLL_ATTEMPTS) {
          stopPolling();
          setError('Scan timed out. The server may be under load. Please retry.');
          setScanning(false);
          return;
        }
        try {
          const updated = await getScan(scanId);
          setScan(updated);
          if (updated.status === 'completed' || updated.status === 'failed') {
            stopPolling();
            setScanning(false);
            if (updated.result_json) {
              try {
                const parsed = JSON.parse(updated.result_json);
                if (parsed.operation_context?.from_spec) {
                  setOperationContext(parsed.operation_context as OperationContext);
                }
              } catch {
                /* ignore */
              }
            }
          }
        } catch {
          /* transient */
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling],
  );

  const { parsedBody, bodyError } = useMemo(() => {
    if (!bodyText.trim()) return { parsedBody: null, bodyError: '' };
    try {
      const obj = JSON.parse(bodyText);
      return { parsedBody: obj as Record<string, unknown>, bodyError: '' };
    } catch {
      return {
        parsedBody: null,
        bodyError: 'Invalid JSON format — please check syntax before running.',
      };
    }
  }, [bodyText]);

  const missingParams = pathParams.filter((p) => !paramValues[p]?.trim());
  const canRun =
    !scanning &&
    !baseUrlError &&
    missingParams.length === 0 &&
    (!isDestructive || confirmed) &&
    (!bodyText.trim() || !bodyError);

  const handleRun = async () => {
    setError('');
    setScan(null);
    setOperationContext(null);
    setScanning(true);

    const req: OperationScanRequest = {
      spec_id: specId,
      path: endpoint.path,
      method: endpoint.method,
      base_url: baseUrlInput.trim().replace(/\/+$/, ''),
      path_params: paramValues,
      confirm_destructive: confirmed,
      workspace_id: currentWorkspace?.id || null,
    };
    if (authHeader.trim()) req.auth_header = authHeader.trim();
    if (parsedBody) req.request_body = parsedBody;

    try {
      const stub = await scanOperation(req);
      setScan(stub);
      startPolling(stub.id);
    } catch (err) {
      setError(getErrorMessage(err));
      setScanning(false);
    }
  };

  const resultJson = scan?.result_json;
  const testResults = useMemo(() => {
    if (!resultJson) return null;
    try {
      const parsed = JSON.parse(resultJson);
      return parsed.test_results ?? null;
    } catch {
      return null;
    }
  }, [resultJson]);

  return (
    <div className="aegis-container aegis-reveal max-w-5xl pb-16 pt-6">
      <button
        onClick={() => navigate('/spec', { state: { restoredAnalysis: specAnalysis } })}
        className="aegis-ghost-action -ml-2 min-h-9 px-2"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        <span>Back to {specTitle ?? 'spec analyzer'}</span>
      </button>

      <header className="aegis-page-header">
        <div className="min-w-0">
          <p className="aegis-eyebrow">Operation / isolated probe</p>
          <h1 className="aegis-page-title">Target endpoint probe</h1>
          <p className="aegis-lede mt-3">
            Run the four observable security pillars against a single operation declared in your
            schema. Nothing is written unless you explicitly confirm.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 border border-line-strong bg-forest/8 px-2.5 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-forest">
          <ShieldCheck size={13} aria-hidden="true" />
          Isolated probe mode
        </div>
      </header>

      <section className="aegis-panel mt-6" aria-labelledby="target-operation">
        <div className="aegis-panel-head">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="aegis-index">01</span>
            <h2
              id="target-operation"
              className="font-display text-[14px] font-semibold tracking-tight text-ink"
            >
              Target operation
            </h2>
          </div>
          {endpoint.deprecated ? (
            <Badge variant="amber" size="xs">
              Deprecated
            </Badge>
          ) : null}
        </div>

        <div className="space-y-5 p-4 sm:p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2.5 border border-line bg-canvas px-3 py-2.5">
              <MethodBadge method={endpoint.method} size="sm" />
              <code className="break-all font-mono text-[12.5px] font-semibold text-ink">
                {endpoint.path}
              </code>
            </div>
            {endpoint.summary ? (
              <p className="mt-2 text-[12px] font-medium text-ink">{endpoint.summary}</p>
            ) : null}
            {endpoint.description && endpoint.description !== endpoint.summary ? (
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{endpoint.description}</p>
            ) : null}
          </div>

          <div>
            <SectionHeader
              icon={<ExternalLink size={13} />}
              title="Target host & base URL"
              note="Validated before connect"
            />
            <div className="space-y-1.5">
              <label htmlFor="base-url-input" className="sr-only">
                Target base URL
              </label>
              <input
                id="base-url-input"
                type="url"
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
                placeholder="https://api.example.com"
                className={`min-h-12 w-full border bg-canvas px-3 font-mono text-[12.5px] text-ink outline-none transition-colors placeholder:text-muted ${
                  baseUrlError
                    ? 'border-high/60 focus:border-high'
                    : 'border-line-strong focus:border-forest'
                }`}
                aria-invalid={Boolean(baseUrlError)}
              />
              {baseUrlError ? (
                <p className="flex items-center gap-1.5 pt-0.5 font-mono text-[10px] text-high">
                  <AlertTriangle size={12} aria-hidden="true" /> {baseUrlError}
                </p>
              ) : (
                <p className="flex flex-wrap items-center gap-1 pt-0.5 font-mono text-[10px] text-muted">
                  <span className="uppercase tracking-[0.08em]">Resolved</span>
                  <code className="break-all text-forest">
                    {baseUrlInput}
                    {endpoint.path}
                  </code>
                </p>
              )}
            </div>
          </div>

          {endpoint.auth_schemes.length > 0 ? (
            <div>
              <SectionHeader icon={<Key size={13} />} title="Declared security schemes" />
              <div className="flex flex-wrap gap-1.5">
                {endpoint.auth_schemes.map((s) => (
                  <span
                    key={s}
                    className="border border-high/30 bg-high/10 px-1.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.06em] text-high"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {Object.keys(endpoint.responses).length > 0 ? (
            <div>
              <SectionHeader icon={<CheckCircle size={13} />} title="Documented response statuses" />
              <ul className="flex flex-wrap gap-1.5">
                {Object.entries(endpoint.responses).map(([code, resp]) => (
                  <li
                    key={code}
                    className="flex items-baseline gap-1.5 border border-line bg-canvas px-2 py-1 font-mono text-[10px]"
                  >
                    <span
                      className={`font-semibold tabular-nums ${
                        code.startsWith('2')
                          ? 'text-safe'
                          : code.startsWith('4')
                            ? 'text-high'
                            : code.startsWith('5')
                              ? 'text-critical'
                              : 'text-muted'
                      }`}
                    >
                      {code}
                    </span>
                    {(resp as { description?: string }).description ? (
                      <span className="text-muted">
                        {(resp as { description: string }).description}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <section className="aegis-panel mt-4" aria-labelledby="probe-configuration">
        <div className="aegis-panel-head">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="aegis-index">02</span>
            <h2
              id="probe-configuration"
              className="font-display text-[14px] font-semibold tracking-tight text-ink"
            >
              Probe configuration
            </h2>
          </div>
          <Badge variant={isDestructive ? 'medium' : 'success'} size="xs">
            {isDestructive ? 'State-modifying method' : 'Read-only method'}
          </Badge>
        </div>

        <div className="space-y-5 p-4 sm:p-5">
          {pathParams.length > 0 ? (
            <div>
              <SectionHeader
                icon={<ChevronRight size={13} />}
                title="Dynamic path parameters"
                note={`${missingParams.length} missing`}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {pathParams.map((param) => (
                  <div key={param} className="space-y-1">
                    <label
                      htmlFor={`param-${param}`}
                      className="flex items-baseline gap-1.5 font-mono text-[10.5px]"
                    >
                      <code className="font-semibold text-forest">{`{${param}}`}</code>
                      <span className="text-[9px] uppercase tracking-[0.06em] text-critical">
                        required
                      </span>
                    </label>
                    <input
                      id={`param-${param}`}
                      type="text"
                      value={paramValues[param] ?? ''}
                      onChange={(e) =>
                        setParamValues((prev) => ({ ...prev, [param]: e.target.value }))
                      }
                      placeholder={`Value for ${param}`}
                      className="min-h-11 w-full border border-line-strong bg-canvas px-3 font-mono text-[12px] text-ink outline-none transition-colors placeholder:text-muted focus:border-forest"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {['POST', 'PUT', 'PATCH'].includes(endpoint.method.toUpperCase()) ? (
            <div>
              <SectionHeader icon={<FileCode size={13} />} title="Request body payload (JSON)" />
              {endpoint.request_body ? (
                <details className="mb-2 border border-line bg-canvas">
                  <summary className="cursor-pointer select-none px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-forest transition-colors hover:text-ink">
                    Inspect declared schema definition
                  </summary>
                  <pre className="max-h-56 overflow-auto border-t border-line px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-muted">
                    {JSON.stringify(endpoint.request_body, null, 2)}
                  </pre>
                </details>
              ) : null}
              <label htmlFor="request-body" className="sr-only">
                Request body JSON
              </label>
              <textarea
                id="request-body"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder={'{\n  "key": "value"\n}'}
                rows={4}
                className="w-full resize-y border border-line-strong bg-canvas px-3 py-2 font-mono text-[11.5px] text-ink outline-none transition-colors placeholder:text-muted focus:border-forest"
                aria-invalid={Boolean(bodyError)}
              />
              {bodyError ? (
                <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-critical">
                  <AlertTriangle size={12} aria-hidden="true" /> {bodyError}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="border-t border-line pt-4">
            <button
              type="button"
              aria-expanded={showAuth}
              aria-controls="auth-header-panel"
              onClick={() => setShowAuth((v) => !v)}
              className="flex min-h-9 items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
            >
              <Key size={13} className="text-forest" aria-hidden="true" />
              <span>{showAuth ? 'Hide' : 'Add'} optional authorization header</span>
              <ChevronDown
                size={13}
                className={`transition-transform duration-200 ${showAuth ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            {showAuth ? (
              <div
                id="auth-header-panel"
                className="mt-2.5 space-y-2 border border-line bg-canvas p-3"
              >
                <label htmlFor="auth-header" className="aegis-label block">
                  Authorization header{' '}
                  <span className="normal-case tracking-normal text-muted">
                    (scrubbed from DB &amp; reports)
                  </span>
                </label>
                <input
                  id="auth-header"
                  type="password"
                  value={authHeader}
                  onChange={(e) => setAuthHeader(e.target.value)}
                  placeholder="Bearer eyJhbGci…"
                  className="min-h-11 w-full border border-line-strong bg-paper px-3 font-mono text-[11.5px] text-ink outline-none transition-colors placeholder:text-muted focus:border-forest"
                />
                <p className="font-mono text-[9.5px] leading-relaxed text-muted">
                  Dispatched only during ephemeral probes and never permanently stored.
                </p>
              </div>
            ) : null}
          </div>

          {isDestructive ? (
            <div className="border border-critical/30 bg-critical/5 p-3.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-critical" aria-hidden="true" />
                <div className="space-y-2">
                  <div>
                    <p className="font-display text-[12.5px] font-semibold text-critical">
                      {endpoint.method.toUpperCase()} — potentially state-modifying operation
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                      Executing this method may create, overwrite, or delete resources on the target
                      API.
                    </p>
                  </div>
                  <label className="flex cursor-pointer select-none items-start gap-2">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--aegis-critical-fg)]"
                    />
                    <span className="text-[11px] font-medium text-critical">
                      I acknowledge state-mutation risks and confirm authorization to test this
                      endpoint.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          {missingParams.length > 0 ? (
            <div className="flex items-start gap-2 border border-high/30 bg-high/10 px-3 py-2 font-mono text-[10.5px] text-high">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Missing required path parameters:{' '}
                {missingParams.map((p) => (
                  <code key={p} className="mx-1 font-semibold">
                    {`{${p}}`}
                  </code>
                ))}
              </span>
            </div>
          ) : null}

          <div className="border-t border-line pt-4">
            <Button
              variant="primary"
              size="lg"
              disabled={!canRun}
              isLoading={scanning}
              onClick={handleRun}
              leftIcon={<Play size={14} />}
              className="w-full justify-center sm:w-auto"
            >
              {scanning ? 'Dispatching operation probes…' : 'Execute endpoint probe'}
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="aegis-reveal mt-4 flex items-start gap-3 border border-critical/30 bg-critical/8 px-4 py-3.5"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-critical" aria-hidden="true" />
          <div>
            <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-critical">
              Execution halted
            </p>
            <p className="mt-1 text-[11.5px] text-muted">{error}</p>
          </div>
        </div>
      ) : null}

      {scanning && scan ? (
        <div
          className="aegis-reveal mt-4 flex items-center gap-3.5 border border-line-strong bg-canvas px-4 py-4"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-6 w-6 shrink-0 animate-spin text-forest" aria-hidden="true" />
          <div>
            <p className="font-display text-[13px] font-semibold text-ink">
              Analyzing operation observable signals
            </p>
            <p className="mt-0.5 text-[11.5px] text-muted">
              Probing TLS parameters, security headers, server banners, and threat intelligence.
            </p>
          </div>
        </div>
      ) : null}

      {scan?.status === 'completed' ? (
        <div className="aegis-reveal mt-6 space-y-4">
          {operationContext ? <OperationContextBanner context={operationContext} scan={scan} /> : null}

          <ScoreCard scan={scan} />

          {testResults ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">
                  Observable security findings
                </h2>
                <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
                  {Object.keys(testResults).length} vectors
                </span>
              </div>
              {Object.entries(testResults).map(([key, result]) => (
                <TestResultCard
                  key={key}
                  testKey={key}
                  result={result as Parameters<typeof TestResultCard>[0]['result']}
                />
              ))}
            </div>
          ) : null}

          <div className="flex flex-col items-start justify-between gap-3 border border-line bg-paper px-4 py-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
              <span>
                Scan ID <code className="text-ink">{scan.id.slice(0, 8)}</code>
              </span>
              {scan.duration_ms ? (
                <span>
                  Duration <strong className="font-medium text-ink">{(scan.duration_ms / 1000).toFixed(2)}s</strong>
                </span>
              ) : null}
            </div>
            <a
              href={getReportUrl(scan.id)}
              download
              className="aegis-secondary-action"
            >
              <Download size={13} aria-hidden="true" />
              <span>Download PDF report</span>
            </a>
          </div>
        </div>
      ) : null}

      {scan?.status === 'failed' ? (
        <div className="mt-4 border border-critical/30 bg-critical/8 px-4 py-4">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-critical">Probe failed</p>
          <p className="mt-1 text-[11.5px] text-muted">
            {scan.error_message ?? 'Probe request timed out or was rejected.'}
          </p>
        </div>
      ) : null}
    </div>
  );
}
