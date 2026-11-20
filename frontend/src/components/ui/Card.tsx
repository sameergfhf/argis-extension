import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  glow?: 'cyan' | 'blue' | 'critical' | 'none';
}

export function Card({
  children,
  interactive = false,
  glow: _glow = 'none',
  className = '',
  onClick,
  onKeyDown,
  ...props
}: CardProps) {
  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || !interactive || !onClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick(event as unknown as React.MouseEvent<HTMLDivElement>);
    }
  };

  return (
    <div
      {...props}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={interactive && onClick ? 'button' : props.role}
      tabIndex={interactive && onClick ? (props.tabIndex ?? 0) : props.tabIndex}
      className={`rounded-[12px] border border-line bg-paper ${interactive ? 'cursor-pointer transition-[border-color,background-color] duration-150 hover:border-line-strong hover:bg-elevated/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 ${className}`} {...props}>{children}</div>;
}

export function CardTitle({ children, className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={`text-[15px] font-semibold tracking-tight text-ink ${className}`} {...props}>{children}</h3>;
}

export function CardDescription({ children, className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`mt-1 text-sm leading-relaxed text-muted ${className}`} {...props}>{children}</p>;
}

export function CardContent({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`p-5 ${className}`} {...props}>{children}</div>;
}

export function CardFooter({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`flex items-center justify-between gap-3 border-t border-line px-5 py-3.5 text-sm text-muted ${className}`} {...props}>{children}</div>;
}
