import { describe, expect, it } from 'vitest';
import { fitWithin, MAX_PHOTO_SIDE } from '@/lib/photos/resize';

describe('fitWithin', () => {
  it('el lado largo por defecto es 1600 px', () => {
    expect(MAX_PHOTO_SIDE).toBe(1600);
  });

  it('reduce una foto horizontal a 1600 px de ancho, manteniendo la proporción', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
  });

  it('reduce una foto vertical a 1600 px de alto', () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it('redondea al píxel más cercano', () => {
    expect(fitWithin(4000, 3001)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 2001)).toEqual({ width: 1600, height: 1067 });
  });

  it('nunca amplía una imagen pequeña', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it('una imagen muy alargada no baja de 1 px en el lado corto', () => {
    expect(fitWithin(20000, 2)).toEqual({ width: 1600, height: 1 });
  });

  it('acepta otro máximo', () => {
    expect(fitWithin(1000, 500, 200)).toEqual({ width: 200, height: 100 });
  });

  it('rechaza dimensiones no válidas', () => {
    expect(() => fitWithin(0, 100)).toThrow();
    expect(() => fitWithin(Number.NaN, 100)).toThrow();
  });
});
