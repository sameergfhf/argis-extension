// src/components/SecurityHeadersMatrix.tsx — HTTP Security Headers compliance breakdown
import { useState } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, AlertTriangle, MinusCircle, Copy, Check } from 'lucide-react';
import type { TestResult } from '../types';
import toast from 'react-hot-toast';

interface Props {
  headersResult?: TestResult;
  rawHeaders?: Record<string, string>;
}

export default function SecurityHeadersMatrix({ headersResult, rawHeaders = {} }: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!headersResult) return null;

  const findings = headersResult.findings || [];

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Header value copied');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const passCount = findings.filter((f) => f.status === 'pass').length;
  const failCount = findings.filter((f) => f.status === 'fail').length;
  const warnCount = findings.filter((f) => f.status === 'warning').length;
  const naCount = findings.filter((f) => f.status === 'not_applicable').length;

  return (
    <section className="aegis-panel" aria-label="HTTP security headers matrix">
      <div className="aegis-panel-head">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-line bg-canvas text-forest">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="aegis-eyebrow">Policy / response headers</p>
            <h2 className="mt-1 font-display text-[15px] font-semibold tracking-tight text-ink">
              Security headers matrix
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
          <span className="flex items-center gap-1.5 border border-safe/30 bg-safe/10 px-1.5 py-1 text-safe">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            {passCount} enforced
          </span>
          {failCount > 0 ? (
            <span className="flex items-center gap-1.5 border border-critical/30 bg-critical/10 px-1.5 py-1 text-critical">
              <XCircle className="h-3 w-3" aria-hidden="true" />
              {failCount} missing
            </span>
          ) : null}
          {warnCount > 0 ? (
            <span className="flex items-center gap-1.5 border border-high/30 bg-high/10 px-1.5 py-1 text-high">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {warnCount} warning
            </span>
          ) : null}
          {naCount > 0 ? (
            <span className="flex items-center gap-1.5 border border-line bg-elevated px-1.5 py-1 text-muted">
              <MinusCircle className="h-3 w-3" aria-hidden="true" />
              {naCount} n/a
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
        {findings.map((finding, idx) => {
          const headerName = (finding.check as string) || (finding.name as string) || 'Header';
          const status = String(finding.status || '').toLowerCase();
          const detail = (finding.detail as string) || '';
          const value = (finding.value as string) || rawHeaders[headerName.toLowerCase()];
          const rule = (finding.rule as string) || '';

          const isPass = status === 'pass';
          const isFail = status === 'fail';
          const isWarn = status === 'warning';

          return (
            <article
              key={idx}
              className={`flex min-w-0 flex-col justify-between bg-paper p-3.5 ${
                isFail ? 'border-l-2 border-l-critical' : isWarn ? 'border-l-2 border-l-high' : isPass ? 'border-l-2 border-l-safe' : ''
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate font-mono text-[11.5px] font-medium text-ink" title={headerName}>
                    {headerName}
                  </span>
                  <span
                    className={`shrink-0 border px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.06em] ${
                      isPass
                        ? 'border-safe/30 bg-safe/10 text-safe'
                        : isFail
                          ? 'border-critical/30 bg-critical/10 text-critical'
                          : isWarn
                            ? 'border-high/30 bg-high/10 text-high'
                            : 'border-line bg-elevated text-muted'
                    }`}
                  >
                    {isPass ? 'Pass' : isFail ? 'Fail' : isWarn ? 'Warn' : 'N/A'}
                  </span>
                </div>

                {detail ? (
                  <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted" title={detail}>
                    {detail}
                  </p>
                ) : null}
              </div>

              {value ? (
                <div className="mt-2.5 flex items-start justify-between gap-1.5 border-t border-line pt-2">
                  <span className="min-w-0 select-all truncate font-mono text-[9.5px] text-forest" title={value}>
                    {value}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(value, `hdr-${idx}`)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
                    title="Copy header value"
                    aria-label={`Copy ${headerName} value`}
                  >
                    {copiedKey === `hdr-${idx}` ? (
                      <Check className="h-3 w-3 text-safe" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3 w-3" aria-hidden="true" />
                    )}
                  </button>
                </div>
              ) : rule ? (
                <div className="mt-2.5 border-t border-line pt-2 font-mono text-[9.5px] text-muted">
                  Ref: <span className="text-ink">{rule}</span>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
