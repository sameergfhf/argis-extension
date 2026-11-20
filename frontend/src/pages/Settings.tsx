// src/pages/Settings.tsx — Configuration, diagnostics, and security posture page

import { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  Database,
  Activity,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Lock,
  Radio,
  FileCode,
  AlertTriangle,
  Zap,
  Search,
  Terminal,
  ShieldCheck,
} from 'lucide-react';
import { getHealth } from '../services/api';
import type { HealthStatus } from '../types';
import { Button, Badge } from '../components/ui';

interface EnvVarDoc {
  key: string;
  label: string;
  defaultVal: string;
  category: 'Security' | 'Performance' | 'Threat Intel';
  description: string;
  link?: string;
}

const ENV_VARIABLES: EnvVarDoc[] = [
  {
    key: 'VIRUSTOTAL_API_KEY',
    label: 'VirusTotal Intelligence Key',
    defaultVal: '(Not set by default)',
    category: 'Threat Intel',
    description:
      'Enables real-time domain and URL reputation scans against 70+ antivirus engines. Free tier grants 4 req/min.',
    link: 'https://www.virustotal.com/gui/join-us',
  },
  {
    key: 'SCAN_LATENCY_SAMPLES',
    label: 'Latency Measurement Samples',
    defaultVal: '5',
    category: 'Performance',
    description:
      'Number of consecutive non-blocking requests dispatched to calculate min, mean, max, and jitter metrics.',
  },
  {
    key: 'MAX_RESPONSE_BYTES',
    label: 'Max Ingestion Payload Size',
    defaultVal: '524288 (512 KB)',
    category: 'Security',
    description:
      'Absolute upper boundary for payload inspection. Prevents memory exhaustion attacks and large binary downloads.',
  },
  {
    key: 'REQUEST_TIMEOUT_SECONDS',
    label: 'Per-Request HTTP Timeout',
    defaultVal: '15',
    category: 'Performance',
    description:
      'Hard threshold before hanging probes or slowloris-type endpoints are terminated.',
  },
  {
    key: 'SCAN_RATE_LIMIT_PER_MINUTE',
    label: 'Global Scan Rate Limiter',
    defaultVal: '20',
    category: 'Performance',
    description:
      'Enforces fairness per client IP to safeguard both scanner compute and target web services.',
  },
  {
    key: 'REPORT_RETENTION_DAYS',
    label: 'Historical Log Retention',
    defaultVal: '30',
    category: 'Security',
    description:
      'Days before historical audit traces and temporary artifacts are cycled from local storage.',
  },
];

const GUARDRAILS = [
  {
    icon: Shield,
    title: 'SSRF & private network isolation',
    desc: 'Strictly blocks RFC1918 loopback (127.0.0.1), private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), link-local, and cloud metadata addresses (169.254.169.254). Only public HTTP/HTTPS is allowed.',
    badge: 'RFC 1918 / 3927',
    tone: 'border-safe/30 bg-safe/10 text-safe',
  },
  {
    icon: Lock,
    title: 'Automated credential redaction',
    desc: 'All analyzed HTTP request and response payloads pass through regex secret scrubbers. JWTs, Bearer tokens, AWS access keys, and Stripe secrets are sanitised before DB persistence.',
    badge: 'Zero persistence',
    tone: 'border-forest/30 bg-forest/8 text-forest',
  },
  {
    icon: Zap,
    title: 'Memory bomb & resource throttling',
    desc: 'Maximum response body size is hard-capped at 512 KB with bounded decompression to neutralise gzip/brotli expansion bombs and prevent memory bloat.',
    badge: '512 KB guard',
    tone: 'border-high/30 bg-high/10 text-high',
  },
  {
    icon: FileCode,
    title: 'Hardened YAML & spec parser',
    desc: 'OpenAPI 3.0 and Swagger 2.0 definitions are ingested using strict schema sanitisation and SafeLoader, eliminating remote code execution via malicious serialised objects.',
    badge: 'SafeLoader',
    tone: 'border-info/30 bg-info/10 text-info',
  },
];

const CATEGORIES = ['ALL', 'Security', 'Performance', 'Threat Intel'] as const;

export default function Settings() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] =
    useState<'ALL' | 'Security' | 'Performance' | 'Threat Intel'>('ALL');

  const fetchHealth = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);
    const start = performance.now();
    try {
      const data = await getHealth();
      setLatencyMs(Math.round(performance.now() - start));
      setHealth(data);
    } catch {
      setHealth(null);
      setLatencyMs(null);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const filteredEnvVars = useMemo(() => {
    return ENV_VARIABLES.filter((item) => {
      const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
      const matchesQuery =
        !searchQuery ||
        item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [selectedCategory, searchQuery]);

  const coreOk = health?.status === 'ok';
  const vtConfigured = health?.virustotal === 'configured';

  const services: Array<{
    name: string;
    detail: string;
    icon: typeof Activity;
    healthy: boolean;
    neutral?: boolean;
    statusLabel: string;
    rows: Array<{ label: string; value: string; accent?: boolean; safe?: boolean }>;
  }> = [
    {
      name: 'AEGIS core engine',
      detail: 'FastAPI asynchronous gateway',
      icon: Activity,
      healthy: coreOk,
      statusLabel: coreOk ? 'Healthy' : 'Degraded',
      rows: [
        { label: 'Binding port', value: '127.0.0.1:8000' },
        { label: 'Version', value: `v${health?.version || '1.0.0'}`, accent: true },
        { label: 'Worker', value: 'Uvicorn asyncio' },
      ],
    },
    {
      name: 'Cloud telemetry store',
      detail: 'PostgreSQL + realtime RLS',
      icon: Database,
      healthy: true,
      statusLabel: 'Connected',
      rows: [
        { label: 'Tables', value: 'scans, findings, profiles' },
        { label: 'Bucket', value: 'aegis-storage', safe: true },
        { label: 'Isolation', value: 'Row level security', safe: true },
      ],
    },
    {
      name: 'Threat intelligence',
      detail: 'VirusTotal v3 feeds',
      icon: Radio,
      healthy: vtConfigured,
      neutral: !vtConfigured,
      statusLabel: vtConfigured ? 'Active' : 'Optional · no key',
      rows: [
        { label: 'Engine quota', value: '4 req / min free' },
        { label: 'Threat feed', value: '70+ antivirus engines' },
        { label: 'Fallback', value: 'DNS & domain heuristics' },
      ],
    },
  ];

  return (
    <div className="aegis-container aegis-reveal pb-16 pt-6">
      <header className="aegis-page-header">
        <div className="min-w-0">
          <p className="aegis-eyebrow">System / configuration</p>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="aegis-page-title">Settings &amp; infrastructure</h1>
            <Badge variant="neutral" size="xs">
              v{health?.version || '1.0.0'}
            </Badge>
          </div>
          <p className="aegis-lede mt-3">
            Audit runtime engines, review environment configuration, and verify the zero-trust
            controls applied to every probe.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="flex min-h-9 flex-1 items-center gap-2 border border-line bg-paper px-2.5 sm:flex-initial">
            <span
              className={`h-1.5 w-1.5 shrink-0 ${
                isLoading ? 'bg-medium' : coreOk ? 'aegis-live-dot' : 'bg-critical'
              }`}
              aria-hidden="true"
            />
            <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
              {isLoading
                ? 'Pinging core…'
                : coreOk
                  ? 'Core operational'
                  : 'Core unreachable'}
            </span>
            {latencyMs !== null ? (
              <span className="border-l border-line pl-2 font-mono text-[9.5px] tabular-nums text-forest">
                {latencyMs}ms
              </span>
            ) : null}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchHealth(true)}
            disabled={isRefreshing || isLoading}
            icon={<RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}
          >
            Re-ping
          </Button>
        </div>
      </header>

      <section aria-labelledby="runtime-heading" className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-line pb-2.5">
          <div>
            <p className="aegis-eyebrow">Runtime / services</p>
            <h2
              id="runtime-heading"
              className="mt-1.5 font-display text-[16px] font-semibold tracking-tight text-ink"
            >
              Core telemetry &amp; microservices
            </h2>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
            Autonomous probing engine
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <article key={service.name} className="aegis-panel flex flex-col">
                <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center border ${
                        service.neutral
                          ? 'border-high/30 bg-high/10 text-high'
                          : service.healthy
                            ? 'border-safe/30 bg-safe/10 text-safe'
                            : 'border-critical/30 bg-critical/10 text-critical'
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-[13px] font-semibold text-ink">
                        {service.name}
                      </h3>
                      <p className="truncate font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
                        {service.detail}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-between gap-3 p-4">
                  <span
                    className={`inline-flex w-fit items-center gap-1.5 border px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.06em] ${
                      service.neutral
                        ? 'border-high/30 bg-high/10 text-high'
                        : service.healthy
                          ? 'border-safe/30 bg-safe/10 text-safe'
                          : 'border-critical/30 bg-critical/10 text-critical'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 ${
                        service.neutral ? 'bg-high' : service.healthy ? 'bg-safe' : 'bg-critical'
                      }`}
                      aria-hidden="true"
                    />
                    {service.statusLabel}
                  </span>

                  <dl className="space-y-1.5">
                    {service.rows.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between gap-2 font-mono text-[10px]"
                      >
                        <dt className="shrink-0 text-muted">{row.label}</dt>
                        <dd
                          className={`truncate text-right ${
                            row.accent
                              ? 'text-forest'
                              : row.safe
                                ? 'text-safe'
                                : 'text-ink'
                          }`}
                          title={row.value}
                        >
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="guardrails-heading" className="aegis-panel mt-8">
        <div className="aegis-panel-head">
          <div className="flex min-w-0 items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-safe" aria-hidden="true" />
            <div>
              <p className="aegis-eyebrow">Security / guardrails</p>
              <h2
                id="guardrails-heading"
                className="mt-1 font-display text-[15px] font-semibold tracking-tight text-ink"
              >
                Zero-trust safeguards
              </h2>
            </div>
          </div>
          <Badge variant="outline" size="xs">
            Always enforced
          </Badge>
        </div>

        <div className="grid gap-px bg-line md:grid-cols-2">
          {GUARDRAILS.map(({ icon: Icon, title, desc, badge, tone }) => (
            <article key={title} className="bg-paper px-4 py-3.5">
              <div className="flex items-start gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center border ${tone}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <h3 className="text-[12.5px] font-semibold text-ink">{title}</h3>
                    <span className="border border-line bg-canvas px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.06em] text-muted">
                      {badge}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{desc}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="env-heading" className="aegis-panel mt-4">
        <div className="aegis-panel-head">
          <div className="flex min-w-0 items-center gap-2.5">
            <Lock className="h-4 w-4 text-forest" aria-hidden="true" />
            <div>
              <p className="aegis-eyebrow">Environment / reference</p>
              <h2
                id="env-heading"
                className="mt-1 font-display text-[15px] font-semibold tracking-tight text-ink"
              >
                Engine configuration
              </h2>
            </div>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
            backend/.env
          </span>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <p className="max-w-3xl text-[11.5px] leading-relaxed text-muted">
            All operational tuning and secret credentials reside exclusively on the server in{' '}
            <code className="border border-line bg-canvas px-1 py-0.5 font-mono text-[10.5px] text-forest">
              backend/.env
            </code>
            . Client browsers never receive access to raw keys.
          </p>

          <div className="flex flex-col justify-between gap-2.5 border-y border-line py-3 sm:flex-row sm:items-center">
            <div
              role="group"
              aria-label="Filter variables by category"
              className="flex flex-wrap items-center gap-1"
            >
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={selectedCategory === cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex min-h-9 items-center border px-2 font-mono text-[9.5px] uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)] ${
                    selectedCategory === cat
                      ? 'border-ink bg-ink text-canvas'
                      : 'border-line bg-paper text-muted hover:text-ink'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="aegis-input-shell w-full gap-2.5 px-3 sm:w-64">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
              <label htmlFor="env-search" className="sr-only">
                Search environment variables
              </label>
              <input
                id="env-search"
                type="text"
                placeholder="Search variables…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="min-h-10 w-full bg-transparent font-mono text-[11px] text-ink outline-none placeholder:text-muted"
              />
            </div>
          </div>

          <ul className="divide-y divide-line border border-line">
            {filteredEnvVars.map((v) => (
              <li key={v.key} className="group bg-paper px-3.5 py-3">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <code className="border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-forest">
                      {v.key}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(v.key)}
                      className="flex h-9 w-9 items-center justify-center rounded-[6px] text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                      title="Copy variable name"
                      aria-label={`Copy ${v.key}`}
                    >
                      {copiedKey === v.key ? (
                        <Check className="h-3.5 w-3.5 text-safe" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>
                    {v.link ? (
                      <a
                        href={v.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-9 w-9 items-center justify-center rounded-[6px] text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                        title="Get API key"
                        aria-label={`Open documentation for ${v.key}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Badge
                      variant={
                        v.category === 'Security'
                          ? 'success'
                          : v.category === 'Threat Intel'
                            ? 'high'
                            : 'neutral'
                      }
                      size="xs"
                    >
                      {v.category}
                    </Badge>
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
                      Default{' '}
                      <code className="normal-case tracking-normal text-ink">{v.defaultVal}</code>
                    </span>
                  </div>
                </div>

                <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{v.description}</p>
              </li>
            ))}

            {filteredEnvVars.length === 0 ? (
              <li className="bg-paper px-6 py-8 text-center">
                <Search className="mx-auto h-4 w-4 text-muted" aria-hidden="true" />
                <p className="mt-2 text-[12px] font-medium text-ink">No matching variables</p>
                <p className="mt-1 font-mono text-[10px] text-muted">
                  {searchQuery
                    ? `Nothing matches "${searchQuery}" in ${selectedCategory}.`
                    : `No variables in ${selectedCategory}.`}
                </p>
              </li>
            ) : null}
          </ul>

          <div className="flex flex-col justify-between gap-2.5 border border-line-strong bg-canvas px-3.5 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-forest" aria-hidden="true" />
                <h3 className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-forest">
                  Quick configuration
                </h3>
              </div>
              <p className="mt-1 text-[11px] text-muted">
                Initialise your local server environment from the production template.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 border border-line bg-paper px-2.5 py-1.5 font-mono text-[10.5px] text-ink">
              <code className="select-all">cp backend/.env.example backend/.env</code>
              <button
                type="button"
                onClick={() => copyToClipboard('cp backend/.env.example backend/.env')}
                className="flex h-8 w-8 items-center justify-center rounded-[6px] text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                title="Copy shell command"
                aria-label="Copy shell command"
              >
                {copiedKey === 'cp backend/.env.example backend/.env' ? (
                  <Check className="h-3.5 w-3.5 text-safe" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      <aside className="mt-4 flex items-start gap-3 border border-high/30 bg-high/5 px-4 py-3.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-high" aria-hidden="true" />
        <div className="space-y-1.5">
          <h2 className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-high">
            Non-intrusive observable signal scope
          </h2>
          <p className="text-[11px] leading-relaxed text-muted">
            AEGIS performs non-intrusive black-box observation of publicly accessible HTTP/S
            endpoints — TLS certificates, response headers, information leakage fingerprints, and
            public reputation indices. It does <strong className="text-ink">not</strong> perform
            automated SQL injection, credential brute forcing, or state-altering exploits.
          </p>
          <p className="text-[11px] leading-relaxed text-muted">
            A high Security Assessment Score indicates compliance with observable defensive
            standards but does not replace formal manual penetration testing or deep static code
            analysis.
          </p>
        </div>
      </aside>
    </div>
  );
}
