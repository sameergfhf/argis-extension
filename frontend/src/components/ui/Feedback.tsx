import React, { useId } from 'react';
import { Activity, CheckCircle2, AlertTriangle, CircleAlert } from 'lucide-react';

export function TelemetryPill({
  status = 'operational',
  label = 'Engine Active',
  detail,
  className = '',
}: {
  status?: 'operational' | 'warning' | 'degraded' | 'scanning';
  label?: string;
  detail?: string;
  className?: string;
}) {
  const config = {
    operational: { dot: 'bg-safe', text: 'text-safe', border: 'border-safe/30', bg: 'bg-safe/8', icon: CheckCircle2 },
    scanning: { dot: 'bg-forest', text: 'text-forest', border: 'border-forest/30', bg: 'bg-forest/6', icon: Activity },
    warning: { dot: 'bg-medium', text: 'text-medium', border: 'border-medium/30', bg: 'bg-medium/10', icon: AlertTriangle },
    degraded: { dot: 'bg-critical', text: 'text-critical', border: 'border-critical/30', bg: 'bg-critical/10', icon: CircleAlert },
  }[status];
  const Icon = config.icon;

  return (
    <div
      className={`inline-flex min-h-7 items-center gap-2 rounded-[4px] border px-2 py-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] ${config.bg} ${config.border} ${className}`}
    >
      <Icon className={`h-3 w-3 ${config.text}`} aria-hidden={true} />
      <span className={config.text}>{label}</span>
      {detail ? <span className="text-muted">/ {detail}</span> : null}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-[6px] ${className}`} aria-hidden={true} />;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section
      className={`aegis-panel relative overflow-hidden p-6 sm:p-8 ${className}`}
      aria-labelledby={id}
    >
      <div className="aegis-grid-bg pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-line-strong bg-canvas text-forest">
          <Icon className="h-5 w-5" aria-hidden={true} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="aegis-label mb-2">No records</p>
          <h2 id={id} className="font-display text-lg font-semibold tracking-tight text-ink">
            {title}
          </h2>
          <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-muted">{description}</p>
          {action ? <div className="mt-5 flex flex-wrap gap-2">{action}</div> : null}
        </div>
      </div>
    </section>
  );
}

export function ErrorState({
  title = 'Request failed',
  description,
  action,
  className = '',
}: {
  title?: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section
      role="alert"
      className={`aegis-panel border-l-2 !border-l-critical p-5 sm:p-6 ${className}`}
      aria-labelledby={id}
    >
      <p className="aegis-label mb-1.5 !text-critical">Error</p>
      <h2 id={id} className="font-display text-base font-semibold tracking-tight text-ink">
        {title}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
      {action ? <div className="mt-4 flex flex-wrap gap-2">{action}</div> : null}
    </section>
  );
}

export function Spinner({
  label = 'Loading',
  size = 'md',
  className = '',
}: {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dotSize = size === 'lg' ? 'h-5 w-5' : size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  return (
    <span role="status" className={`inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted ${className}`}>
      <span
        className={`${dotSize} animate-spin rounded-full border border-line-strong border-t-forest`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
