import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem('aegis-theme', theme);
  } catch {
    // The visual toggle still works when storage is blocked by browser policy.
  }
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === 'dark' ? '#060B15' : '#F4F7FC';
  window.dispatchEvent(new CustomEvent<'light' | 'dark'>('aegis-theme-change', { detail: theme }));
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [isDark, setIsDark] = useState(() => document.documentElement.dataset.theme === 'dark');

  useEffect(() => {
    const syncTheme = (event: Event) => {
      const theme = (event as CustomEvent<'light' | 'dark'>).detail;
      setIsDark(theme === 'dark');
    };
    window.addEventListener('aegis-theme-change', syncTheme);
    return () => window.removeEventListener('aegis-theme-change', syncTheme);
  }, []);
  const nextTheme = isDark ? 'light' : 'dark';

  const toggleTheme = () => {
    const nextIsDark = !isDark;
    setIsDark(nextIsDark);
    applyTheme(nextIsDark ? 'dark' : 'light');
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextTheme} theme`}
      aria-pressed={isDark}
      title={`Switch to ${nextTheme} theme`}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-[6px] border border-line-strong bg-paper text-ink transition-colors duration-150 hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aegis-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${className}`}
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
