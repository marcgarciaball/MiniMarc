import { describe, expect, it } from 'vitest';
import { isWorkToken } from '@/lib/capture/handler';
import { isWorkTokenName, WORK_TOKEN_WORD, workTokenName } from '@/lib/auth/workToken';

describe('isWorkTokenName (I-2)', () => {
  it('cualquier nombre con «trabajo», sin importar mayúsculas', () => {
    expect(isWorkTokenName('Siri trabajo')).toBe(true);
    expect(isWorkTokenName('TRABAJO')).toBe(true);
    expect(isWorkTokenName('Siri')).toBe(false);
    expect(isWorkTokenName('Oficina')).toBe(false);
  });

  it('es la misma regla que aplica el servidor', () => {
    for (const name of ['Siri trabajo', 'Extensión', 'Atajo Trabajo iPhone']) {
      expect(isWorkToken({ userId: 'u', tokenId: 't', name })).toBe(isWorkTokenName(name));
    }
  });
});

describe('workTokenName (interruptor «Solo Trabajo»)', () => {
  it('apagado: el nombre queda igual (sin espacios sobrantes)', () => {
    expect(workTokenName('  Siri ', false)).toBe('Siri');
  });

  it('encendido: añade « trabajo» si el nombre no lo lleva ya', () => {
    expect(workTokenName('Oficina', true)).toBe(`Oficina ${WORK_TOKEN_WORD}`);
    expect(workTokenName('Siri Trabajo', true)).toBe('Siri Trabajo');
    expect(isWorkTokenName(workTokenName('Extensión', true))).toBe(true);
  });

  it('encendido sin nombre: queda vacío (el formulario pide un nombre)', () => {
    expect(workTokenName('  ', true)).toBe('');
  });
});
