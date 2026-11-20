// src/pages/SpecAnalyzer.tsx — OpenAPI & Swagger specification analyzer
import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  FileCode2,
  FlaskConical,
  Globe,
  Lock,
  Search,
  Upload,
  Zap,
  ChevronRight,
  Layers,
  X,
} from 'lucide-react';
import { analyzeSpecUrl, analyzeSpecFile } from '../services/api';
import { fetchSpecUploadsFromSupabase } from '../services/supabaseService';
import type { SpecAnalysis, EndpointInfo } from '../types';
import type { OperationScanLocationState } from './OperationScan';
import { Button, MethodBadge, Badge } from '../components/ui';
import toast from 'react-hot-toast';

const SAMPLE_SPECS = [
  {
    label: 'OpenAPI Petstore v3',
    url: 'https://raw.githubusercontent.com/OAI/OpenAPI-Specification/main/examples/v3.0/petstore.json',
  },
  { label: 'Swagger Petstore v2', url: 'https://petstore.swagger.io/v2/swagger.json' },
];

function EndpointRow({
  endpoint,
  onTestInDashboard,
}: {
  endpoint: EndpointInfo;
  onTestInDashboard: (ep: EndpointInfo) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const slug = `${endpoint.method}-${endpoint.path.replace(/\W/g, '-')}`;

  return (
    <li className="border-b border-line last:border-b-0">
      <div className="flex flex-col justify-between gap-2.5 px-3.5 py-3 transition-colors hover:bg-canvas sm:flex-row sm:items-center sm:px-4">
        <button
          type="button"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)] sm:gap-3"
          aria-expanded={expanded}
          aria-controls={`endpoint-details-${slug}`}
          onClick={() => setExpanded(!expanded)}
        >
          <MethodBadge method={endpoint.method} size="sm" className="w-16 shrink-0" />
          <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] font-medium text-ink sm:text-[12.5px]">
            {endpoint.path}
          </code>

          {endpoint.deprecated ? (
            <Badge variant="amber" size="xs" className="shrink-0">
              Deprecated
            </Badge>
          ) : null}

          {endpoint.auth_schemes.length > 0 ? (
            <span className="hidden shrink-0 items-center gap-1 border border-line bg-elevated px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.06em] text-muted sm:flex">
              <Lock className="h-3 w-3" aria-hidden="true" />
              {endpoint.auth_schemes.join(', ')}
            </span>
          ) : null}

          {endpoint.summary ? (
            <span className="hidden max-w-xs truncate text-[11px] text-muted lg:block xl:max-w-sm">
              {endpoint.summary}
            </span>
          ) : null}

          <ChevronRight
            className={`ml-auto h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${
              expanded ? 'rotate-90' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        <Button
          id={`test-btn-${slug}`}
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onTestInDashboard(endpoint);
          }}
          leftIcon={<FlaskConical className="h-3.5 w-3.5" />}
          className="w-full shrink-0 sm:w-auto"
        >
          Test endpoint
        </Button>
      </div>

      {expanded ? (
        <div
          id={`endpoint-details-${slug}`}
          role="region"
          aria-label={`${endpoint.method} ${endpoint.path} specification details`}
          className="aegis-reveal space-y-4 border-t border-line bg-canvas px-3.5 py-4 sm:px-4"
        >
          {endpoint.description ? (
            <div>
              <p className="aegis-label mb-1">Description</p>
              <p className="text-[11.5px] leading-relaxed text-muted">{endpoint.description}</p>
            </div>
          ) : null}

          {endpoint.auth_schemes.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 sm:hidden">
              <span className="aegis-label">Auth</span>
              <span className="inline-flex items-center gap-1 border border-line bg-paper px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                <Lock className="h-3 w-3" aria-hidden="true" />
                {endpoint.auth_schemes.join(', ')}
              </span>
            </div>
          ) : null}

          {endpoint.parameters.length > 0 ? (
            <div>
              <p className="aegis-label mb-2">
                Declared parameters
                <span className="ml-1.5 normal-case tracking-normal text-muted">
                  ({endpoint.parameters.length})
                </span>
              </p>
              <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
                {endpoint.parameters.map((p, idx) => (
                  <div key={idx} className="bg-paper px-2.5 py-2 font-mono text-[10.5px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-forest">
                        {String(p.name ?? 'param')}
                      </span>
                      <span className="shrink-0 text-[9px] uppercase tracking-[0.06em] text-muted">
                        {String(p.in ?? '')}
                      </span>
                    </div>
                    {p.required ? (
                      <span className="mt-1 block text-[9px] uppercase tracking-[0.06em] text-high">
                        Required
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
              No parameters required for this operation.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <span className="text-[11px] text-muted">
              Ready to run observational checks against this operation?
            </span>
            <button
              type="button"
              onClick={() => onTestInDashboard(endpoint)}
              className="flex min-h-9 items-center gap-1.5 px-1 font-mono text-[9.5px] uppercase tracking-[0.06em] text-forest transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
            >
              Configure &amp; dispatch audit &rarr;
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export default function SpecAnalyzer() {
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState<'url' | 'file'>('url');
  const [url, setUrl] = useState('');
  const [analysis, setAnalysis] = useState<SpecAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [savedSpecs, setSavedSpecs] = useState<any[]>([]);

  useEffect(() => {
    fetchSpecUploadsFromSupabase()
      .then((specs) => {
        if (specs && specs.length > 0) setSavedSpecs(specs);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const state = location.state as { restoredAnalysis?: SpecAnalysis } | null;
    if (state?.restoredAnalysis && !analysis) {
      setAnalysis(state.restoredAnalysis);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, analysis, navigate, location.pathname]);

  const handleUrlAnalyze = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) {
      toast.error('Please enter a schema URL');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await analyzeSpecUrl(url.trim());
      setAnalysis(result);
      toast.success(`Parsed ${result.total_endpoints} endpoints from schema!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch specification';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_097_152) {
      toast.error('File exceeds max size of 2 MB');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await analyzeSpecFile(file);
      setAnalysis(result);
      toast.success(`Parsed ${result.total_endpoints} endpoints from ${file.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse specification';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleTestInDashboard = (endpoint: EndpointInfo) => {
    if (!analysis) return;
    const rawBaseUrl = analysis.base_url ?? '';
    const state: OperationScanLocationState = {
      specId: analysis.spec_id,
      baseUrl: rawBaseUrl,
      specUrl: url,
      endpoint,
      specTitle: analysis.title,
      specVersion: analysis.version,
      specAnalysis: analysis,
    };
    navigate('/operation-scan', { state });
  };

  const methods = [...new Set(analysis?.endpoints.map((e) => e.method) ?? [])].sort();
  const filtered = (analysis?.endpoints ?? []).filter((ep) => {
    const matchSearch =
      !search ||
      ep.path.toLowerCase().includes(search.toLowerCase()) ||
      (ep.summary ?? '').toLowerCase().includes(search.toLowerCase());
    const matchMethod = !methodFilter || ep.method === methodFilter;
    return matchSearch && matchMethod;
  });

  return (
    <div className="aegis-container pb-16 pt-6">
      <header className="aegis-page-header">
        <div className="min-w-0">
          <p className="aegis-eyebrow">Schema / inspection · OpenAPI 3.x · Swagger 2.0</p>
          <h1 className="aegis-page-title">Specification analyzer</h1>
          <p className="aegis-lede mt-3">
            Ingest a schema to enumerate routes, audit parameter declarations, and dispatch a
            single-operation probe without leaving the ledger.
          </p>
        </div>

        {analysis ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnalysis(null)}
            leftIcon={<X className="h-3.5 w-3.5" />}
            className="w-full sm:w-auto"
          >
            Clear analysis
          </Button>
        ) : null}
      </header>

      <section aria-labelledby="ingest-heading" className="aegis-panel mt-6">
        <div className="aegis-panel-head">
          <div className="flex min-w-0 items-center gap-2.5">
            <Layers className="h-4 w-4 text-forest" aria-hidden="true" />
            <h2
              id="ingest-heading"
              className="font-display text-[14px] font-semibold tracking-tight text-ink"
            >
              Load specification
            </h2>
          </div>

          <div role="group" aria-label="Specification source" className="flex border border-line-strong">
            <button
              type="button"
              aria-pressed={activeTab === 'url'}
              onClick={() => setActiveTab('url')}
              className={`flex min-h-9 items-center px-2.5 font-mono text-[9.5px] uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--aegis-focus)] ${
                activeTab === 'url' ? 'bg-ink text-canvas' : 'bg-paper text-muted hover:text-ink'
              }`}
            >
              Remote URL
            </button>
            <button
              type="button"
              aria-pressed={activeTab === 'file'}
              onClick={() => setActiveTab('file')}
              className={`flex min-h-9 items-center border-l border-line-strong px-2.5 font-mono text-[9.5px] uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--aegis-focus)] ${
                activeTab === 'file' ? 'bg-ink text-canvas' : 'bg-paper text-muted hover:text-ink'
              }`}
            >
              Upload file
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {activeTab === 'url' ? (
            <form onSubmit={handleUrlAnalyze} className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="aegis-input-shell min-w-0 flex-1 gap-3 px-3.5">
                  <Globe className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  <label htmlFor="spec-url-input" className="sr-only">
                    Specification URL
                  </label>
                  <input
                    id="spec-url-input"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://api.example.com/openapi.json"
                    className="min-h-12 w-full bg-transparent font-mono text-[12.5px] text-ink outline-none placeholder:text-muted"
                    disabled={isLoading}
                  />
                </div>
                <Button
                  type="submit"
                  id="analyze-spec-btn"
                  variant="primary"
                  size="md"
                  disabled={!url.trim() || isLoading}
                  isLoading={isLoading}
                  leftIcon={<Search className="h-4 w-4" />}
                  className="w-full shrink-0 justify-center sm:w-auto"
                >
                  Analyze schema
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
                <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
                  <Zap className="h-3 w-3 text-forest" aria-hidden="true" />
                  Samples
                </span>
                {SAMPLE_SPECS.map((sample) => (
                  <button
                    key={sample.url}
                    type="button"
                    onClick={() => setUrl(sample.url)}
                    className="flex min-h-9 items-center border border-line bg-canvas px-2 font-mono text-[10px] text-muted transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                  >
                    {sample.label}
                  </button>
                ))}

                {savedSpecs.length > 0 ? (
                  <>
                    <span className="hidden h-4 w-px bg-line sm:block" aria-hidden="true" />
                    <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-forest">
                      <FileCode2 className="h-3 w-3" aria-hidden="true" />
                      Vault <span className="tabular-nums">({savedSpecs.length})</span>
                    </span>
                    {savedSpecs.slice(0, 3).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          if (s.spec_url) setUrl(s.spec_url);
                          else if (s.metadata)
                            setAnalysis({
                              spec_id: s.id,
                              title: s.metadata.title || s.filename,
                              version: s.version || '3.0.0',
                              endpoints: s.metadata.endpoints || [],
                              total_endpoints: s.endpoints || 0,
                              deprecated_count: 0,
                              auth_schemes: [],
                              base_url: s.spec_url || '',
                            });
                        }}
                        className="flex min-h-9 items-center gap-1 border border-forest/25 bg-forest/8 px-2 font-mono text-[10px] text-forest transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                      >
                        <span className="max-w-[160px] truncate">{s.filename}</span>
                        <span className="tabular-nums text-[9px]">
                          {s.endpoints} ep
                        </span>
                      </button>
                    ))}
                  </>
                ) : null}
              </div>
            </form>
          ) : (
            <div className="flex flex-col items-center justify-center border border-dashed border-line-strong bg-canvas px-6 py-10 text-center">
              <Upload className="h-6 w-6 text-forest" aria-hidden="true" />
              <h3 className="mt-2.5 font-display text-[14px] font-semibold text-ink">
                Upload OpenAPI JSON or YAML
              </h3>
              <p className="mt-1 max-w-sm text-[11.5px] leading-relaxed text-muted">
                Supports Swagger 2.0, OpenAPI 3.0.x, and 3.1.x schemas up to 2 MB.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="mt-4"
              >
                Choose schema file
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.yaml,.yml"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          )}

          {error ? (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 border border-critical/30 bg-critical/8 px-3 py-2.5 text-[11.5px] text-critical"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      </section>

      {analysis ? (
        <div className="aegis-reveal mt-6 space-y-4">
          <dl className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
            <div className="bg-paper px-4 py-3">
              <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                API title
              </dt>
              <dd className="mt-1 truncate text-[12.5px] font-semibold text-ink" title={analysis.title}>
                {analysis.title ?? 'Untitled API'}
              </dd>
            </div>
            <div className="bg-paper px-4 py-3">
              <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                Spec version
              </dt>
              <dd className="mt-1 font-mono text-[12.5px] font-semibold text-forest">
                {analysis.version ?? '1.0.0'}
              </dd>
            </div>
            <div className="bg-paper px-4 py-3">
              <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                Base server
              </dt>
              <dd
                className="mt-1 truncate font-mono text-[11px] text-muted"
                title={analysis.base_url || '/'}
              >
                {analysis.base_url || '/'}
              </dd>
            </div>
            <div className="bg-paper px-4 py-3">
              <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                Operations
              </dt>
              <dd className="mt-1 font-mono text-[12.5px] font-semibold tabular-nums text-ink">
                {analysis.total_endpoints}
              </dd>
            </div>
          </dl>

          <div className="flex flex-col justify-between gap-2.5 md:flex-row md:items-center">
            <div className="aegis-input-shell max-w-md flex-1 gap-2.5 px-3">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
              <label htmlFor="endpoint-search" className="sr-only">
                Search endpoints by path or summary
              </label>
              <input
                id="endpoint-search"
                type="text"
                placeholder="Search endpoints by path or summary…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-10 w-full bg-transparent font-mono text-[11.5px] text-ink outline-none placeholder:text-muted"
              />
            </div>

            <div
              role="group"
              aria-label="Filter endpoints by method"
              className="flex flex-wrap items-center gap-1"
            >
              <button
                type="button"
                aria-pressed={methodFilter === ''}
                onClick={() => setMethodFilter('')}
                className={`flex min-h-9 items-center border px-2 font-mono text-[9.5px] uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)] ${
                  methodFilter === ''
                    ? 'border-ink bg-ink text-canvas'
                    : 'border-line bg-paper text-muted hover:text-ink'
                }`}
              >
                All
                <span className="ml-1 tabular-nums opacity-70">{analysis.endpoints.length}</span>
              </button>
              {methods.map((m) => {
                const count = analysis.endpoints.filter((e) => e.method === m).length;
                const active = methodFilter === m;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setMethodFilter(active ? '' : m)}
                    className={`flex min-h-9 items-center border px-2 font-mono text-[9.5px] uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)] ${
                      active
                        ? 'border-ink bg-ink text-canvas'
                        : 'border-line bg-paper text-muted hover:text-ink'
                    }`}
                  >
                    {m}
                    <span className="ml-1 tabular-nums opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <section className="aegis-panel overflow-hidden" aria-label="Discovered endpoints">
            <div className="aegis-panel-head">
              <h2 className="font-display text-[14px] font-semibold text-ink">
                Discovered endpoints
                <span className="ml-1.5 font-mono text-[10px] font-normal tabular-nums text-muted">
                  {filtered.length}
                </span>
              </h2>
              <p className="hidden font-mono text-[9px] uppercase tracking-[0.08em] text-muted sm:block">
                Expand to inspect · test to dispatch
              </p>
            </div>

            {filtered.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <Search className="mx-auto h-5 w-5 text-muted" aria-hidden="true" />
                <p className="mt-2 font-display text-[13.5px] font-semibold text-ink">
                  No endpoints match
                </p>
                <p className="mt-1 text-[11.5px] text-muted">
                  Clear the search or method filter to see all operations.
                </p>
              </div>
            ) : (
              <ul>
                {filtered.map((ep, i) => (
                  <EndpointRow
                    key={`${ep.method}-${ep.path}-${i}`}
                    endpoint={ep}
                    onTestInDashboard={handleTestInDashboard}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
