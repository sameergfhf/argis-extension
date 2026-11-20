import React from 'react';
import { AlertCircle, CheckCircle2, Info, LoaderCircle, X } from 'lucide-react';

export type ToastTone = 'success' | 'error' | 'info' | 'loading';

export interface ToastProps {
  message: React.ReactNode;
  tone?: ToastTone;
  onDismiss?: () => void;
  className?: string;
}

const toneStyles: Record<ToastTone, { icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>; iconClass: string }> = {
  success: { icon: CheckCircle2, iconClass: 'text-safe' },
  error: { icon: AlertCircle, iconClass: 'text-critical' },
  info: { icon: Info, iconClass: 'text-forest' },
  loading: { icon: LoaderCircle, iconClass: 'text-forest' },
};

export function Toast({ message, tone = 'info', onDismiss, className = '' }: ToastProps) {
  const Icon = toneStyles[tone].icon;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'} className={`flex min-h-14 items-start gap-3 rounded-[12px] border border-line-strong bg-paper px-4 py-3 text-[13px] text-ink shadow-[var(--shadow-overlay)] ${className}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${toneStyles[tone].iconClass} ${tone === 'loading' ? 'animate-spin' : ''}`} aria-hidden={true} />
      <div className="min-w-0 flex-1 leading-relaxed">{message}</div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} aria-label="Dismiss notification" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] text-muted transition-colors hover:bg-elevated hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]">
          <X className="h-4 w-4" aria-hidden={true} />
        </button>
      ) : null}
    </div>
  );
}
