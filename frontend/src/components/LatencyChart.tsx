// src/components/LatencyChart.tsx — HTTP Latency Recharts line chart

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { LatencyStats } from '../types';
import { Activity, AlertCircle } from 'lucide-react';

interface Props {
  latency: LatencyStats;
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: number;
}) => {
  if (active && payload && payload.length) {
    const val = payload[0].value;
    return (
      <div className="border border-line-strong bg-paper px-2.5 py-2 shadow-[0_8px_24px_rgba(20,24,15,0.14)]">
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
          Probe #{label}
        </p>
        {val !== null && val !== undefined ? (
          <p className="mt-1 font-mono text-[12px] font-semibold tabular-nums text-ink">
            {val.toFixed(1)} ms
          </p>
        ) : (
          <p className="mt-1 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-critical">
            Failed / timeout
          </p>
        )}
      </div>
    );
  }
  return null;
};

export default function LatencyChart({ latency }: Props) {
  const data = latency.samples.map((s) => ({
    request: s.request_number,
    ms: s.response_time_ms ?? null,
    status: s.status_code,
    failed: s.timed_out || s.error ? 'failed' : null,
  }));

  const stats = [
    { label: 'Average', value: latency.avg_ms, tone: 'text-ink' },
    { label: 'Floor', value: latency.min_ms, tone: 'text-safe' },
    { label: 'Ceiling', value: latency.max_ms, tone: 'text-high' },
  ];

  return (
    <section className="aegis-panel" aria-label="HTTP latency profile">
      <div className="aegis-panel-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-line bg-canvas text-forest">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="aegis-eyebrow">Timing / round trip</p>
            <h3 className="mt-1 truncate font-display text-[15px] font-semibold tracking-tight text-ink">
              HTTP latency profile
            </h3>
          </div>
        </div>

        {latency.failed_requests > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 border border-critical/30 bg-critical/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-critical">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            {latency.failed_requests} failed
          </span>
        ) : null}
      </div>

      <dl className="grid grid-cols-3 divide-x divide-line border-b border-line bg-canvas">
        {stats.map((stat) => (
          <div key={stat.label} className="px-3.5 py-3">
            <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
              {stat.label}
            </dt>
            <dd className={`mt-1 font-mono text-[15px] font-semibold tabular-nums ${stat.tone}`}>
              {stat.value !== null && stat.value !== undefined ? (
                <>
                  {stat.value.toFixed(0)}
                  <span className="ml-0.5 text-[10px] font-normal text-muted">ms</span>
                </>
              ) : (
                <span className="text-muted">n/a</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <div className="h-52 px-1 py-3 sm:px-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 14, left: -16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--color-line)" vertical={false} />
            <XAxis
              dataKey="request"
              tick={{ fill: 'var(--color-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              axisLine={{ stroke: 'var(--color-line)' }}
              tickLine={false}
              tickMargin={6}
            />
            <YAxis
              tick={{ fill: 'var(--color-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              axisLine={false}
              tickLine={false}
              width={54}
              tickFormatter={(v: number) => `${v}`}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--color-line-strong)' }} />
            {latency.avg_ms !== null && latency.avg_ms !== undefined ? (
              <ReferenceLine
                y={latency.avg_ms}
                stroke="var(--color-line-strong)"
                strokeDasharray="3 3"
                label={{
                  value: `avg ${latency.avg_ms.toFixed(0)}ms`,
                  fill: 'var(--color-muted)',
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  position: 'insideTopRight',
                }}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey="ms"
              stroke="var(--color-forest)"
              strokeWidth={1.75}
              dot={(props) => {
                const { cx, cy, payload } = props as {
                  cx: number;
                  cy: number;
                  payload: { failed: string | null; ms: number };
                };
                if (payload.failed) {
                  return (
                    <circle
                      key={`dot-${cx}-${cy}`}
                      cx={cx}
                      cy={cy}
                      r={3.5}
                      fill="var(--aegis-critical-fg)"
                      stroke="var(--color-paper)"
                      strokeWidth={1.5}
                    />
                  );
                }
                return (
                  <circle
                    key={`dot-${cx}-${cy}`}
                    cx={cx}
                    cy={cy}
                    r={2.5}
                    fill="var(--color-paper)"
                    stroke="var(--color-forest)"
                    strokeWidth={1.5}
                  />
                );
              }}
              connectNulls={false}
              name="Response time"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
        <span>
          {latency.samples.length} sequential GET probes · non-destructive
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 bg-forest" aria-hidden="true" />
          round-trip ms
        </span>
      </div>
    </section>
  );
}
