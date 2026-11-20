// src/components/RequestInspector.tsx — Sanitized HTTP request/response inspector
import { useState, useMemo } from 'react';
import {
  Globe,
  Clock,
  Copy,
  Check,
  ShieldCheck,
  ArrowRight,
  Code2,
  FileText,
  Terminal,
  Lock,
} from 'lucide-react';
import type { Scan } from '../types';
import { MethodBadge } from './ui';
import toast from 'react-hot-toast';

interface Props {
  scan: Scan;
}

interface ParsedResult {
  method?: string;
  url?: string;
  resolved_ip?: string;
  response?: {
    status_code?: number;
    headers?: Record<string, string>;
    content_type?: string;
    redirect_destinations?: string[];
    body?: string;
  };
  test_results?: {
    tls?: {
      evidence?: {
        tls_info?: {
          tls_version?: string;
          cipher_name?: string;
          common_name?: string;
          days_until_expiry?: number;
        };
      };
    };
    leakage?: {
      evidence?: {
        analyzed_bytes?: number;
      };
    };
  };
}

const HTTP_STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

type TabKey = 'overview' | 'headers' | 'body' | 'redirects';

export default function RequestInspector({ scan }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [headerFilter, setHeaderFilter] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const parsed = useMemo<ParsedResult | null>(() => {
    if (!scan.result_json) return null;
    try {
      return JSON.parse(scan.result_json);
    } catch {
      return null;
    }
  }, [scan.result_json]);

  const response = parsed?.response;
  const headers = useMemo(() => response?.headers ?? {}, [response?.headers]);
  const redirects = response?.redirect_destinations ?? [];
  const statusCode = response?.status_code;
  const statusText = statusCode ? HTTP_STATUS_TEXT[statusCode] || '' : '';
  const contentType = response?.content_type ?? headers['content-type'] ?? '';
  const resolvedIp = parsed?.resolved_ip;
  const method = (parsed?.method || 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  const responseBody = response?.body;
  const tlsInfo = parsed?.test_results?.tls?.evidence?.tls_info;
  const analyzedBytes = parsed?.test_results?.leakage?.evidence?.analyzed_bytes;

  const statusTone =
    statusCode && statusCode >= 200 && statusCode < 300
      ? 'text-safe border-safe/30 bg-safe/10'
      : statusCode && statusCode >= 400
        ? 'text-critical border-critical/30 bg-critical/10'
        : 'text-high border-high/30 bg-high/10';

  const filteredHeaders = useMemo(() => {
    return Object.entries(headers).filter(
      ([k, v]) =>
        k.toLowerCase().includes(headerFilter.toLowerCase()) ||
        v.toLowerCase().includes(headerFilter.toLowerCase()),
    );
  }, [headers, headerFilter]);

  const handleCopy = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const formattedBody = useMemo(() => {
    if (!responseBody) return null;
    try {
      const json = JSON.parse(responseBody);
      return JSON.stringify(json, null, 2);
    } catch {
      return responseBody;
    }
  }, [responseBody]);

  const curlCommand = `curl -i -X ${method} "${scan.url}"`;

  const tabs: Array<{ key: TabKey; label: string; icon: typeof FileText; meta?: string }> = [
    { key: 'overview', label: 'Overview', icon: FileText },
    { key: 'headers', label: 'Headers', icon: Terminal, meta: String(Object.keys(headers).length) },
    { key: 'body', label: 'Body', icon: Code2 },
    { key: 'redirects', label: 'Redirects', icon: ArrowRight, meta: redirects.length > 0 ? String(redirects.length) : undefined },
  ];

  const overviewRows = [
    { label: 'Target hostname', value: scan.hostname, tone: 'text-ink' },
    { label: 'Resolved IP', value: resolvedIp || 'Verified non-RFC 1918', tone: resolvedIp ? 'text-safe' : 'text-muted' },
    { label: 'Method / protocol', value: `${method} · ${scan.url.startsWith('https://') ? 'HTTPS' : 'HTTP'}`, tone: 'text-ink' },
    {
      label: 'TLS version',
      value: tlsInfo?.tls_version || (scan.url.startsWith('https://') ? 'TLS 1.3 / 1.2' : 'Plaintext HTTP'),
      tone: 'text-ink',
    },
    { label: 'Response status', value: statusCode ? `${statusCode} ${statusText}` : 'No response', tone: statusCode ? statusTone.split(' ')[0] : 'text-muted' },
    { label: 'Content type', value: contentType || 'application/json', tone: 'text-ink' },
    { label: 'Probe duration', value: scan.duration_ms ? `${scan.duration_ms.toFixed(1)} ms` : 'N/A', tone: 'text-muted' },
    {
      label: 'Payload / size',
      value: analyzedBytes
        ? `${analyzedBytes} bytes analyzed`
        : headers['content-length']
          ? `${headers['content-length']} bytes`
          : 'Header-only telemetry',
      tone: 'text-muted',
    },
  ];

  return (
    <section className="aegis-panel flex flex-col" aria-label="Request and response inspector">
      <div className="aegis-panel-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-line bg-canvas text-forest">
            <Globe className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="aegis-eyebrow">Exchange / capture</p>
            <h2 className="mt-1 truncate font-display text-[16px] font-semibold tracking-tight text-ink">
              Request &amp; response inspector
            </h2>
          </div>
        </div>
        {scan.duration_ms ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {scan.duration_ms.toFixed(0)}ms
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas px-4 py-2.5 font-mono text-[11px]">
        <MethodBadge method={method} size="xs" />
        <span className="min-w-0 flex-1 truncate text-ink select-all" title={scan.url}>
          {scan.url}
        </span>
        {statusCode ? (
          <span className={`shrink-0 border px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${statusTone}`}>
            {statusCode} {statusText}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => handleCopy(scan.url, 'target-url', 'URL')}
          title="Copy URL"
          aria-label="Copy target URL"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] text-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
        >
          {copiedKey === 'target-url' ? (
            <Check className="h-3.5 w-3.5 text-safe" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-2">
        <div role="tablist" aria-label="Inspector views" className="flex flex-wrap items-center">
          {tabs.map((tab) => {
            const selected = activeTab === tab.key;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex min-h-11 items-center gap-1.5 border-b-2 px-2.5 font-mono text-[10.5px] uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--aegis-focus)] sm:px-3 ${
                  selected
                    ? 'border-ink text-ink'
                    : 'border-transparent text-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                <TabIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {tab.label}
                {tab.meta ? <span className="text-[9.5px] text-muted">({tab.meta})</span> : null}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1">
          {activeTab === 'headers' && Object.keys(headers).length > 0 ? (
            <button
              type="button"
              onClick={() => {
                const text = Object.entries(headers)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join('\n');
                handleCopy(text, 'all-headers', 'All headers');
              }}
              className="flex min-h-10 items-center gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.06em] text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
            >
              {copiedKey === 'all-headers' ? <Check className="h-3 w-3 text-safe" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
              {copiedKey === 'all-headers' ? 'Copied' : 'Copy all'}
            </button>
          ) : null}

          {activeTab === 'overview' ? (
            <button
              type="button"
              onClick={() => handleCopy(curlCommand, 'curl-cmd', 'cURL command')}
              className="flex min-h-10 items-center gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.06em] text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
            >
              {copiedKey === 'curl-cmd' ? <Check className="h-3 w-3 text-safe" aria-hidden="true" /> : <Terminal className="h-3 w-3" aria-hidden="true" />}
              {copiedKey === 'curl-cmd' ? 'Copied' : 'Copy cURL'}
            </button>
          ) : null}

          {activeTab === 'body' && formattedBody ? (
            <button
              type="button"
              onClick={() => handleCopy(formattedBody, 'body-content', 'Response body')}
              className="flex min-h-10 items-center gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.06em] text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
            >
              {copiedKey === 'body-content' ? <Check className="h-3 w-3 text-safe" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
              {copiedKey === 'body-content' ? 'Copied' : 'Copy body'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-[220px] flex-1 p-4 font-mono text-[11.5px] sm:p-5">
        {activeTab === 'overview' ? (
          <dl className="grid gap-x-8 gap-y-0 md:grid-cols-2">
            {overviewRows.map((row) => (
              <div key={row.label} className="flex min-w-0 items-center justify-between gap-3 border-b border-line py-2">
                <dt className="shrink-0 text-[11px] text-muted">{row.label}</dt>
                <dd className={`min-w-0 truncate text-right font-medium ${row.tone}`} title={row.value}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {activeTab === 'headers' ? (
          <div className="space-y-2.5">
            <label htmlFor="header-filter" className="sr-only">
              Filter headers
            </label>
            <input
              id="header-filter"
              type="text"
              placeholder="Filter headers by key or value…"
              value={headerFilter}
              onChange={(e) => setHeaderFilter(e.target.value)}
              className="w-full border border-line-strong bg-paper px-2.5 py-2 text-[11.5px] text-ink outline-none placeholder:text-muted focus:border-forest"
            />

            {filteredHeaders.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-muted">No matching HTTP headers found.</p>
            ) : (
              <div className="max-h-[210px] divide-y divide-line overflow-auto border border-line bg-paper">
                {filteredHeaders.map(([k, v]) => {
                  const isSensitive =
                    k.toLowerCase().includes('auth') ||
                    k.toLowerCase().includes('cookie') ||
                    k.toLowerCase().includes('key') ||
                    k.toLowerCase().includes('secret') ||
                    v === '[REDACTED]';

                  return (
                    <div key={k} className="group flex items-start justify-between gap-2 px-2.5 py-2 transition-colors hover:bg-elevated/50">
                      <div className="flex min-w-0 items-start gap-1.5">
                        <span className="shrink-0 text-forest">{k}:</span>
                        <span className="select-all break-all text-muted">{v}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {isSensitive ? (
                          <span className="flex items-center gap-0.5 border border-high/30 bg-high/10 px-1 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.06em] text-high">
                            <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                            Redacted
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleCopy(`${k}: ${v}`, k, k)}
                          className="flex h-9 w-9 items-center justify-center rounded-[6px] text-muted transition-opacity hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                          title="Copy header"
                          aria-label={`Copy ${k} header`}
                        >
                          {copiedKey === k ? <Check className="h-3 w-3 text-safe" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {activeTab === 'body' ? (
          formattedBody ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.08em] text-muted">
                <span>Observed payload</span>
                <span className="normal-case tracking-normal">{contentType}</span>
              </div>
              <pre className="max-h-[210px] select-all overflow-auto whitespace-pre-wrap break-words border border-line bg-paper p-3 text-[11px] leading-relaxed text-ink">
                {formattedBody}
              </pre>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <Code2 className="h-6 w-6 text-muted" aria-hidden="true" />
              <p className="text-[12px] font-medium text-ink">Response body not stored</p>
              <p className="max-w-sm font-sans text-[11.5px] leading-relaxed text-muted">
                The scan inspected headers and TLS deterministically.
                {analyzedBytes
                  ? ` ${analyzedBytes} bytes were analyzed in memory for information leakage without persisting the raw body.`
                  : ''}
              </p>
            </div>
          )
        ) : null}

        {activeTab === 'redirects' ? (
          redirects.length === 0 ? (
            <div className="flex items-center justify-center gap-2.5 py-8 text-safe">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              <span className="font-sans text-[12px]">Direct response · no intermediate redirects observed.</span>
            </div>
          ) : (
            <div className="max-h-[210px] space-y-2 overflow-auto">
              {redirects.map((dest, i) => (
                <div key={i} className="flex items-center gap-2 border border-line bg-paper px-2.5 py-2">
                  <span className="shrink-0 border border-high/30 bg-high/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.06em] text-high">
                    Hop {i + 1}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                  <span className="select-all truncate text-ink">{dest}</span>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-forest" aria-hidden="true" />
          Tokens, cookies &amp; keys redacted
        </span>
        <span>RFC 9110</span>
      </div>
    </section>
  );
}
