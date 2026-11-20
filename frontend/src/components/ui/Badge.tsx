import React from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';

export type SeverityType = 'critical' | 'high' | 'medium' | 'low' | 'informational';
export type MethodType = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type BadgeVariant =
  | 'default'
  | 'cyan'
  | 'blue'
  | 'emerald'
  | 'amber'
  | 'crimson'
  | 'neutral'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'outline'
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'info';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'xs' | 'sm' | 'md';
  pulse?: boolean;
}

const sizeClasses: Record<NonNullable<BadgeProps['size']>, string> = {
  xs: 'text-[11px] px-1.5 py-0.5 min-h-[20px]',
  sm: 'text-[11.5px] px-2 py-1 min-h-[24px]',
  md: 'text-[12.5px] px-2 py-1 min-h-[26px]',
};

const variantClasses: Record<string, string> = {
  default: 'bg-elevated text-muted border-line',
  outline: 'bg-transparent text-ink border-line-strong',
  neutral: 'bg-elevated text-muted border-line',
  cyan: 'bg-info/10 text-info border-info/30',
  blue: 'bg-info/10 text-info border-info/30',
  emerald: 'bg-safe/10 text-safe border-safe/30',
  success: 'bg-safe/10 text-safe border-safe/30',
  amber: 'bg-medium/10 text-medium border-medium/30',
  warning: 'bg-medium/10 text-medium border-medium/30',
  crimson: 'bg-critical/10 text-critical border-critical/30',
  destructive: 'bg-critical/10 text-critical border-critical/30',
  critical: 'bg-critical/10 text-critical border-critical/30',
  high: 'bg-high/10 text-high border-high/30',
  medium: 'bg-medium/10 text-medium border-medium/30',
  low: 'bg-info/10 text-info border-info/30',
  info: 'bg-info/10 text-info border-info/30',
};

export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  pulse = false,
  className = '',
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[6px] border font-mono font-medium uppercase leading-none tracking-[0.06em] ${sizeClasses[size]} ${variantClasses[variant] || variantClasses.default} ${className}`}
      {...props}
    >
      {pulse ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden={true} /> : null}
      {children}
    </span>
  );
}

const severityConfig: Record<SeverityType, { variant: BadgeVariant; label: string; icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }> }> = {
  critical: { variant: 'critical', label: 'CRITICAL', icon: AlertOctagon },
  high: { variant: 'high', label: 'HIGH', icon: ShieldAlert },
  medium: { variant: 'medium', label: 'MEDIUM', icon: AlertTriangle },
  low: { variant: 'low', label: 'LOW', icon: Info },
  informational: { variant: 'neutral', label: 'INFO', icon: Info },
};

export function SeverityBadge({
  severity,
  size = 'sm',
  className = '',
}: {
  severity: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  const normalized = severity.toLowerCase() as SeverityType;
  const current = severityConfig[normalized] || { variant: 'neutral' as const, label: severity.toUpperCase(), icon: CheckCircle2 };
  const Icon = current.icon;
  return (
    <Badge variant={current.variant} size={size} className={className} aria-label={`Severity: ${current.label}`}>
      <Icon className="h-3 w-3" aria-hidden={true} />
      {current.label}
    </Badge>
  );
}

export function MethodBadge({
  method,
  size = 'sm',
  className = '',
}: {
  method: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  const m = method.toUpperCase();
  const methodMap: Record<string, string> = {
    GET: 'text-safe bg-safe/10 border-safe/30',
    POST: 'text-forest bg-forest/8 border-forest/30',
    PUT: 'text-high bg-high/10 border-high/30',
    PATCH: 'text-copper bg-copper/10 border-copper/30',
    DELETE: 'text-critical bg-critical/10 border-critical/30',
    HEAD: 'text-muted bg-elevated border-line',
    OPTIONS: 'text-muted bg-elevated border-line',
  };
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[6px] border px-1.5 py-1 font-mono font-medium tracking-[0.04em] ${sizeClasses[size]} ${methodMap[m] || 'text-muted bg-elevated border-line'} ${className}`}
    >
      {m}
    </span>
  );
}
