import { Link } from 'react-router-dom';

type BrandLogoProps = {
  to?: string;
  size?: 'sm' | 'md' | 'lg';
  subtitle?: string;
  badge?: string;
  onClick?: () => void;
  inverted?: boolean;
};

const sizes = {
  sm: { mark: 'h-8 w-8', title: 'text-[13px]', gap: 'gap-2.5' },
  md: { mark: 'h-9 w-9', title: 'text-[15px]', gap: 'gap-2.5' },
  lg: { mark: 'h-11 w-11', title: 'text-lg', gap: 'gap-3' },
};

export function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg'; inverted?: boolean }) {
  return (
    <span
      className={`${sizes[size].mark} inline-flex shrink-0 items-center justify-center rounded-[9px]`}
      style={{
        background: 'linear-gradient(150deg, var(--color-accent) 0%, color-mix(in srgb, var(--color-forest) 72%, var(--color-accent)) 100%)',
        boxShadow: '0 6px 18px -10px color-mix(in srgb, var(--color-accent) 70%, transparent)',
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" className="h-full w-full">
        <path
          d="M7.6 25.2 15.9 6.4h.2l8.3 18.8h-4.2l-1.6-3.8h-5.2l-1.6 3.8H7.6Zm6.9-7.1h2.8L15.9 14l-1.4 4.1Z"
          fill="var(--color-canvas)"
        />
        <rect x="8.6" y="21.6" width="14.8" height="1.6" fill="var(--color-canvas)" opacity="0.65" />
      </svg>
    </span>
  );
}

export default function BrandLogo({
  to = '/',
  size = 'md',
  subtitle,
  badge,
  onClick,
  inverted = false,
}: BrandLogoProps) {
  const s = sizes[size];
  const inner = (
    <>
      <BrandMark size={size} inverted={inverted} />
      <span className="min-w-0 text-left">
        <span className="flex items-center gap-2">
          <span
            className={`${s.title} font-display font-semibold uppercase leading-none`}
            style={{ letterSpacing: '0.14em', color: 'var(--color-ink)' }}
          >
            Aegis
          </span>
          {badge ? (
            <span
              className="rounded-[5px] border px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.14em]"
              style={{
                borderColor: 'color-mix(in srgb, var(--color-accent) 42%, transparent)',
                color: 'var(--color-accent)',
                background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
              }}
            >
              {badge}
            </span>
          ) : null}
        </span>
        {subtitle ? (
          <span
            className="mt-1 hidden truncate font-mono text-[9px] uppercase leading-none xl:block"
            style={{ letterSpacing: '0.2em', color: 'var(--color-muted)' }}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  );

  const className = `aegis-focus-ring inline-flex shrink-0 items-center ${s.gap} rounded-[8px]`;

  if (to) {
    return (
      <Link to={to} onClick={onClick} className={className} aria-label={`AEGIS${subtitle ? ` — ${subtitle}` : ''}`}>
        {inner}
      </Link>
    );
  }

  return (
    <span className={className} onClick={onClick}>
      {inner}
    </span>
  );
}
