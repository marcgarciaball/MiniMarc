import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from '@/lib/markdown';

describe('parseMarkdown (docs/iphone.md)', () => {
  it('títulos, párrafos y listas; los pasos numerados tienen ancla paso-N', () => {
    const md = [
      '# Avisos en el iPhone',
      '',
      'Objetivo: que lleguen',
      'una sola vez.',
      '',
      '## 2. Añadir la cuenta',
      '',
      '1. Ajustes → Apps.',
      '   No verificado: mira la ayuda.',
      '2. Inicia sesión.',
      '',
      '- uno',
      '- dos',
    ].join('\n');
    expect(parseMarkdown(md)).toEqual([
      { kind: 'heading', level: 1, text: 'Avisos en el iPhone', id: undefined },
      { kind: 'paragraph', text: 'Objetivo: que lleguen una sola vez.' },
      { kind: 'heading', level: 2, text: '2. Añadir la cuenta', id: 'paso-2' },
      { kind: 'list', ordered: true, items: [['Ajustes → Apps.', 'No verificado: mira la ayuda.'], ['Inicia sesión.']] },
      { kind: 'list', ordered: false, items: [['uno'], ['dos']] },
    ]);
  });
});

describe('parseInline', () => {
  it('enlaces, URLs sueltas (sin el punto final), negrita y código', () => {
    expect(parseInline('Abre https://calendar.google.com. Ver [ayuda](https://support.google.com/x), **Tareas** y `primary`')).toEqual([
      { kind: 'text', text: 'Abre ' },
      { kind: 'link', text: 'https://calendar.google.com', href: 'https://calendar.google.com' },
      { kind: 'text', text: '. Ver ' },
      { kind: 'link', text: 'ayuda', href: 'https://support.google.com/x' },
      { kind: 'text', text: ', ' },
      { kind: 'strong', text: 'Tareas' },
      { kind: 'text', text: ' y ' },
      { kind: 'code', text: 'primary' },
    ]);
  });

  it('no convierte en enlace nada que no sea http(s)', () => {
    expect(parseInline('[x](javascript:alert(1))')).toEqual([{ kind: 'text', text: '[x](javascript:alert(1))' }]);
  });
});
