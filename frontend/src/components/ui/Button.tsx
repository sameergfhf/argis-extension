import React from 'react';
import { LoaderCircle } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'danger' | 'cyan' | 'signal';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  icon?: React.ReactNode;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-ink text-canvas border border-ink hover:bg-forest hover:border-forest hover:text-[var(--aegis-primary-hover-fg)] active:translate-y-px',
  cyan: 'bg-forest text-[var(--aegis-primary-hover-fg)] border border-forest hover:bg-forest-hover hover:border-forest-hover active:translate-y-px',
  signal: 'bg-accent text-[var(--aegis-accent-ink)] border border-accent hover:bg-accent-hover hover:border-accent-hover active:translate-y-px',
  secondary: 'bg-paper text-ink border border-line-strong hover:border-ink hover:bg-elevated active:bg-elevated',
  outline: 'bg-transparent text-ink border border-line-strong hover:bg-paper hover:border-ink active:bg-elevated',
  ghost: 'bg-transparent text-muted border border-transparent hover:bg-elevated hover:text-ink active:bg-elevated',
  destructive: 'bg-critical/10 text-critical border border-critical/30 hover:bg-critical/15 active:bg-critical/20',
  danger: 'bg-critical/10 text-critical border border-critical/30 hover:bg-critical/15 active:bg-critical/20',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  xs: 'text-[12px] px-2.5 py-1.5 gap-1.5 min-h-9',
  sm: 'text-[12.5px] px-3 py-2 gap-1.5 min-h-10',
  md: 'text-[13px] px-3.5 py-2.5 gap-2 min-h-11',
  lg: 'text-[14px] px-5 py-3 gap-2 min-h-12',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      icon,
      className = '',
      disabled,
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const effectiveLeftIcon = leftIcon || icon;
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={isLoading || undefined}
        className={`inline-flex select-none items-center justify-center rounded-[10px] font-medium tracking-[0.005em] transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
          isDisabled
            ? 'cursor-not-allowed border border-line bg-elevated text-muted'
            : variantClasses[variant]
        } ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        ) : effectiveLeftIcon ? (
          <span className="inline-flex shrink-0 items-center" aria-hidden="true">{effectiveLeftIcon}</span>
        ) : null}
        {children !== undefined && children !== null ? <span>{children}</span> : null}
        {!isLoading && rightIcon ? <span className="inline-flex shrink-0 items-center" aria-hidden="true">{rightIcon}</span> : null}
      </button>
    );
  },
);

Button.displayName = 'Button';
