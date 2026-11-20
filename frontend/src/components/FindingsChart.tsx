// src/components/FindingsChart.tsx — Findings by severity bar chart

import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { FindingsBySeverity, Finding, Severity } from '../types';
import { ShieldAlert, Filter, ShieldCheck, X } from 'lucide-react';
import { SeverityBadge } from './ui/Badge';

interface Props {
  findingsBySeverity: FindingsBySeverity;
  findings: Finding[];
}

const SEVERITY_CONFIG: Record<Severity, { color: string; label: string }> = {
  critical: { color: 'var(--aegis-critical-fg)', label: 'Critical' },
  high: { color: 'var(--aegis-high-fg)', label: 'High' },
  medium: { color: 'var(--aegis-medium-fg)', label: 'Medium' },
  low: { color: 'var(--aegis-safe-fg)', label: 'Low' },
  informational: { color: 'var(--color-muted)', label: 'Info' },
};

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) => {
  if (active && payload && payload.length) {
    const sevKey = label?.toLowerCase() as Severity;
    const color = SEVERITY_CONFIG[sevKey]?.color || 'var(--color-muted)';
    return (
      <div className="border border-line-strong bg-paper px-2.5 py-2 shadow-[0_8px_24px_rgba(20,24,15,0.14)]">
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">{label}</p>
        <p className="mt-1 font-mono text-[12px] font-semibold tabular-nums" style={{ color }}>
          {payload[0].value} finding{payload[0].value !== 1 ? 's' : ''}
        </p>
      </div>
    );
  }
  return null;
};

export default function FindingsChart({ findingsBySeverity, findings }: Props) {
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | null>(null);

  const chartData = (Object.keys(SEVERITY_CONFIG) as Severity[]).map((key) => ({
    severity: SEVERITY_CONFIG[key].label,
    key,
    count: findingsBySeverity[key] || 0,
  }));

  const filteredFindings = selectedSeverity
    ? findings.filter((f) => f.severity === selectedSeverity)
    : findings;

  const total = Object.values(findingsBySeverity).reduce((a, b) => a + b, 0);

  return (
    <section className="aegis-panel flex flex-col" aria-label="Findings distribution">
      <div className="aegis-panel-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-line bg-canvas text-high">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="aegis-eyebrow">Exposure / severity</p>
            <h3 className="mt-1 truncate font-display text-[15px] font-semibold tracking-tight text-ink">
              Vulnerability distribution
            </h3>
          </div>
        </div>

        <span
          className={`inline-flex shrink-0 items-center gap-1.5 border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em] tabular-nums ${
            total > 0
              ? 'border-high/30 bg-high/10 text-high'
              : 'border-safe/30 bg-safe/10 text-safe'
          }`}
        >
          {total > 0 ? `${total} issue${total !== 1 ? 's' : ''}` : 'clean'}
        </span>
      </div>

      {total === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <span className="flex h-10 w-10 items-center justify-center border border-safe/30 bg-safe/10 text-safe">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="font-display text-[14px] font-semibold text-ink">Perimeter hardened</p>
          <p className="max-w-xs text-[11.5px] leading-relaxed text-muted">
            No active vulnerability findings were identified across the inspected vectors.
          </p>
        </div>
      ) : (
        <>
          <div className="h-44 px-1 pt-3 sm:px-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 12, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--color-line)" vertical={false} />
                <XAxis
                  dataKey="severity"
                  tick={{ fill: 'var(--color-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                  axisLine={{ stroke: 'var(--color-line)' }}
                  tickLine={false}
                  tickMargin={6}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: 'var(--color-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-canvas)' }} />
                <Bar
                  dataKey="count"
                  radius={[1, 1, 0, 0]}
                  onClick={(entry) => {
                    const key = (entry as { key: Severity }).key;
                    setSelectedSeverity(selectedSeverity === key ? null : key);
                  }}
                  cursor="pointer"
                  isAnimationActive={false}
                >
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={SEVERITY_CONFIG[entry.key].color}
                      opacity={selectedSeverity && selectedSeverity !== entry.key ? 0.28 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
            <span className="flex items-center gap-1.5">
              <Filter className="h-3 w-3 text-forest" aria-hidden="true" />
              {selectedSeverity ? (
                <>
                  Isolated: <span className="text-ink">{selectedSeverity}</span> ({filteredFindings.length})
                </>
              ) : (
                'Select a bar to isolate findings'
              )}
            </span>
            {selectedSeverity ? (
              <button
                type="button"
                onClick={() => setSelectedSeverity(null)}
                className="flex min-h-8 items-center gap-1 px-1.5 text-[9.5px] uppercase tracking-[0.06em] text-forest transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                Clear
              </button>
            ) : null}
          </div>

          {filteredFindings.length > 0 ? (
            <div className="max-h-64 divide-y divide-line overflow-y-auto border-t border-line">
              {filteredFindings.map((finding) => (
                <article key={finding.id} className="px-4 py-3.5 transition-colors hover:bg-canvas">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="min-w-0 text-[12.5px] font-semibold leading-snug text-ink">
                      {finding.title}
                    </h4>
                    <SeverityBadge severity={finding.severity} size="xs" />
                  </div>
                  <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                    {finding.category}
                  </p>
                  {finding.description ? (
                    <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted">
                      {finding.description}
                    </p>
                  ) : null}
                  {finding.remediation ? (
                    <div className="mt-2 border-l-2 border-l-forest bg-safe/6 px-2.5 py-1.5">
                      <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-forest">
                        Remediation
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted">
                        {finding.remediation}
                      </p>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
