import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(__dirname, '../../styles/tokens.css'), 'utf8');
const REQUIRED = ['--bg', '--surface-glass', '--hairline', '--accent', '--label'];

/** Returns the declaration block of the first rule whose selector matches. */
function block(selector: RegExp): string {
  const match = css.match(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`, selector.flags));
  if (!match) throw new Error(`No rule for ${selector}`);
  return match[1];
}

describe('design tokens', () => {
  it('defines the shared radius token', () => {
    expect(css).toMatch(/--radius-continuous:/);
  });

  it.each([
    ['light (default + data-theme)', /:root,\s*\[data-theme="light"\]/],
    ['forced dark', /^\[data-theme="dark"\]/m],
    ['system dark', /:root:not\(\[data-theme="light"\]\)/],
  ])('defines every colour token for %s', (_, selector) => {
    const decls = block(selector);
    for (const token of REQUIRED) expect(decls).toContain(`${token}:`);
  });

  it('keeps forced dark and system dark identical', () => {
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
    expect(norm(block(/:root:not\(\[data-theme="light"\]\)/))).toBe(norm(block(/^\[data-theme="dark"\]/m)));
  });
});
