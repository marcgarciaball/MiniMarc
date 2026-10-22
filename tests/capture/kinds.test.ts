import { describe, expect, it } from 'vitest';
import {
  captureExtras,
  capturePlaceholder,
  kindForShortcut,
  QUICK_KINDS,
  shortcutHint,
  usesArea,
} from '@/lib/capture/kinds';

const key = (code: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  code,
  ...mods,
});

describe('capturePlaceholder', () => {
  it('Auto invita a apuntar cualquier cosa; el resto nombra el tipo', () => {
    expect(capturePlaceholder('auto')).toBe('Apunta algo…');
    expect(capturePlaceholder('tarea')).toBe('Apunta una tarea…');
    expect(capturePlaceholder('idea')).toBe('Apunta una idea…');
    expect(capturePlaceholder('compra')).toBe('Apunta una compra…');
    expect(capturePlaceholder('regalo')).toBe('Apunta un regalo…');
    expect(capturePlaceholder('libro')).toBe('Apunta un libro…');
    expect(capturePlaceholder('cita')).toBe('Apunta una cita…');
  });
});

describe('captureExtras', () => {
  it('solo muestra los campos que el tipo usa', () => {
    expect(captureExtras('auto')).toEqual([]);
    expect(captureExtras('idea')).toEqual([]);
    expect(captureExtras('compra')).toEqual([]);
    expect(captureExtras('tarea')).toEqual(['fecha', 'hora']);
    expect(captureExtras('cita')).toEqual(['fecha', 'hora', 'fin']);
    expect(captureExtras('regalo')).toEqual(['persona']);
    expect(captureExtras('libro')).toEqual(['autor']);
  });
});

describe('usesArea', () => {
  it('el maletín de Trabajo solo aplica a Auto y Tarea', () => {
    expect(QUICK_KINDS.filter(usesArea)).toEqual(['auto', 'tarea']);
  });
});

describe('kindForShortcut', () => {
  it('Alt/Opción + 1…7 elige el tipo en el orden de la fila', () => {
    expect(QUICK_KINDS.map((_, i) => kindForShortcut(key(`Digit${i + 1}`)))).toEqual([...QUICK_KINDS]);
    expect(kindForShortcut(key('Numpad3'))).toBe('idea');
  });

  it('ignora otras teclas, 8 y 9, y otros modificadores', () => {
    expect(kindForShortcut(key('Digit8'))).toBeNull();
    expect(kindForShortcut(key('Digit0'))).toBeNull();
    expect(kindForShortcut(key('KeyA'))).toBeNull();
    expect(kindForShortcut(key('Digit1', { altKey: false }))).toBeNull();
    expect(kindForShortcut(key('Digit1', { metaKey: true }))).toBeNull();
    expect(kindForShortcut(key('Digit1', { ctrlKey: true }))).toBeNull();
    expect(kindForShortcut(key('Digit1', { shiftKey: true }))).toBeNull();
  });

  it('la pista del tooltip usa ⌥ en Apple y Alt+ en el resto', () => {
    expect(shortcutHint('auto', true)).toBe('⌥1');
    expect(shortcutHint('cita', true)).toBe('⌥7');
    expect(shortcutHint('compra', false)).toBe('Alt+4');
  });
});
