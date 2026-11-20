import React, { cloneElement, isValidElement, useId } from 'react';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const tooltipId = useId();
  const child = isValidElement(children)
    ? cloneElement(children as React.ReactElement<{ 'aria-describedby'?: string }>, {
        'aria-describedby': tooltipId,
      })
    : children;
  const sideClasses = {
    top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
    right: 'left-full top-1/2 ml-2 -translate-y-1/2',
    bottom: 'left-1/2 top-full mt-2 -translate-x-1/2',
    left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  }[side];

  return (
    <span className="group relative inline-flex max-w-full">
      {child}
      <span
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none absolute z-50 w-max max-w-[min(18rem,80vw)] rounded-[8px] border border-line-strong bg-ink px-2.5 py-2 font-mono text-[11px] leading-relaxed text-canvas opacity-0 shadow-[var(--shadow-overlay)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${sideClasses}`}
      >
        {content}
      </span>
    </span>
  );
}
