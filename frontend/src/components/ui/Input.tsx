import React, { useId } from 'react';
import { X } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  icon?: React.ReactNode;
  onClear?: () => void;
  mono?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      icon,
      onClear,
      mono = false,
      className = '',
      value,
      defaultValue,
      disabled,
      id,
      required,
      'aria-describedby': ariaDescribedBy,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id || `aegis-input-${generatedId}`;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const describedBy = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;
    const effectiveLeftIcon = leftIcon || icon;
    const hasValue = value !== undefined ? String(value).length > 0 : String(defaultValue ?? '').length > 0;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="aegis-label block !text-ink">
            {label}{required ? <span aria-hidden="true" className="ml-1 text-critical">*</span> : null}
          </label>
        )}
        <div className="relative flex min-w-0 items-center">
          {effectiveLeftIcon && (
            <span className="pointer-events-none absolute left-3 flex items-center justify-center text-muted" aria-hidden="true">
              {effectiveLeftIcon}
            </span>
          )}
          <input
            {...props}
            ref={ref}
            id={inputId}
            value={value}
            defaultValue={defaultValue}
            disabled={disabled}
            required={required}
            aria-invalid={error ? true : props['aria-invalid']}
            aria-describedby={describedBy}
            className={`min-h-12 w-full rounded-[10px] border bg-paper px-3.5 py-2.5 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--aegis-focus)_14%,transparent)] disabled:cursor-not-allowed disabled:opacity-60 ${effectiveLeftIcon ? 'pl-10' : ''} ${onClear && hasValue ? 'pr-12' : ''} ${mono ? 'font-mono text-[13px]' : ''} ${error ? 'border-critical focus:border-critical' : 'border-line-strong focus:border-forest'} ${className}`}
          />
          {onClear && hasValue && !disabled && (
            <button
              type="button"
              onClick={onClear}
              aria-label={`Clear ${label || props.name || 'input value'}`}
              className="absolute right-1 flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-elevated hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {error ? (
          <p id={errorId} role="alert" className="font-mono text-[11.5px] text-critical">{error}</p>
        ) : hint ? (
          <p id={hintId} className="text-[12.5px] leading-relaxed text-muted">{hint}</p>
        ) : null}
      </div>
    );
  },
);

Input.displayName = 'Input';
