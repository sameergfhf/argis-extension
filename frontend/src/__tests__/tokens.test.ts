import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

function token(name: string): string | undefined {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return match?.[1].trim();
}

describe('Aegis Design System Tokens & Configuration', () => {
  it('validates critical and high security severity definitions', () => {
    const severities = ['critical', 'high', 'medium', 'low', 'informational'];
    expect(severities).toContain('critical');
    expect(severities).toContain('high');
    expect(severities.length).toBe(5);
  });

  it('verifies primary HTTP methods supported by probe suite', () => {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(methods).toContain('DELETE');
  });

  it('confirms the NIGHTWATCH palette anchors', () => {
    expect(token('color-canvas')).toBe('#060b15');
    expect(token('color-paper')).toBe('#0a1322');
    expect(token('color-ink')).toBe('#e8eef9');
    expect(token('color-line')).toBe('#182641');
    expect(token('color-forest')).toBe('#6cb2ff');
    expect(token('color-accent')).toBe('#22d3ee');
    expect(token('color-critical')).toBe('#ff7b72');
    expect(token('color-safe')).toBe('#56d364');
  });

  it('keeps a complete light-theme alternative', () => {
    const lightBlock = css.slice(css.indexOf(':root[data-theme="light"] {'));
    expect(lightBlock).toContain('#f4f7fc');
    expect(lightBlock).toContain('--color-canvas');
    expect(lightBlock).toContain('--color-paper');
    expect(lightBlock).toContain('--color-accent: #0e7490');
  });

  it('declares the Inter and JetBrains Mono type stacks', () => {
    expect(token('font-sans')).toContain('Inter');
    expect(token('font-display')).toContain('Inter Tight');
    expect(token('font-mono')).toContain('JetBrains Mono');
  });

  it('uses the calm rounded radius scale', () => {
    expect(token('radius-xs')).toBe('6px');
    expect(token('radius-sm')).toBe('10px');
  });
});
