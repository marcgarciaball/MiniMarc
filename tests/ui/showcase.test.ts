import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DesignShowcase } from '@/app/dev/design/Showcase';

describe('design showcase', () => {
  const html = renderToStaticMarkup(createElement(DesignShowcase, { today: new Date('2026-10-21T10:00:00Z') }));

  it('renders automatic, light and dark panels', () => {
    expect(html).toContain('data-theme="light"');
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('Automático');
  });

  it.each(['ui-glass', 'ui-navbar', 'ui-large-title', 'ui-tabbar', 'ui-inset-list', 'ui-row', 'ui-switch', 'ui-sheet', 'ui-segmented', 'ui-wallpaper'])(
    'includes %s in every panel',
    (cls) => {
      const count = html.split(`class="${cls}`).length - 1;
      expect(count).toBeGreaterThanOrEqual(3);
    },
  );

  it('prints the real weekday for the date', () => {
    expect(html).toContain('miércoles, 21 de octubre');
  });

  it('marks switches, the area selector and the open sheet accessibly', () => {
    expect(html).toContain('role="switch"');
    expect(html).toMatch(/role="radiogroup" aria-label="Área"/);
    expect(html).toMatch(/role="radio" aria-checked="true" class="ui-segmented__option">Personal</);
    expect(html).toMatch(/role="dialog" aria-modal="true" aria-label="Nueva compra"/);
  });
});
