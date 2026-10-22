import { describe, expect, it } from 'vitest';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPhotosRepo } from '@/lib/db/photos';
import { addPhoto, deletePhoto } from '@/lib/photos/actions';
import { isPhotoPathFor, photoPath, type PhotoStorage } from '@/lib/photos/storage';
import { buildPhotoMap } from '@/lib/photos/view';

function fakeStorage(fail = false) {
  const removed: string[] = [];
  const storage: PhotoStorage = {
    async upload() {},
    async remove(paths) {
      if (fail) throw new Error('down');
      removed.push(...paths);
    },
    async sign(paths) {
      return new Map(paths.filter((p) => !p.includes('roto')).map((p) => [p, `https://signed/${p}`]));
    },
  };
  return { storage, removed };
}

function setup(fail = false) {
  const photos = createPhotosRepo(createMemoryBackend());
  const s = fakeStorage(fail);
  return { deps: { userId: 'u1', photos, storage: s.storage }, photos, removed: s.removed };
}

describe('rutas de fotos', () => {
  it('photoPath pone la carpeta del usuario y del elemento', () => {
    expect(photoPath('u1', 'i1', 'webp', 'abc')).toBe('u1/i1/abc.webp');
  });

  it('isPhotoPathFor rechaza otras carpetas y rutas con trucos', () => {
    expect(isPhotoPathFor('u1/i1/abc.webp', 'u1', 'i1')).toBe(true);
    expect(isPhotoPathFor('u1/i1/abc.webp', 'u1')).toBe(true);
    expect(isPhotoPathFor('u2/i1/abc.webp', 'u1')).toBe(false);
    expect(isPhotoPathFor('u1/i2/abc.webp', 'u1', 'i1')).toBe(false);
    expect(isPhotoPathFor('u1/i1/../../u2/x.webp', 'u1', 'i1')).toBe(false);
    expect(isPhotoPathFor('u1/i1/', 'u1', 'i1')).toBe(false);
    expect(isPhotoPathFor('u1/x.webp', '')).toBe(false);
  });
});

describe('acciones de fotos', () => {
  it('addPhoto guarda la fila si la ruta es de ese usuario y elemento', async () => {
    const t = setup();
    const p = await addPhoto(t.deps, { itemId: 'i1', path: 'u1/i1/a.webp', width: 1600, height: 1200 });
    expect(p).toMatchObject({ itemId: 'i1', width: 1600, height: 1200 });
    const q = await addPhoto(t.deps, { itemId: 'i1', path: 'u1/i1/b.webp', width: 'x', height: -3 });
    expect(q).toMatchObject({ width: null, height: null });
  });

  it('addPhoto rechaza una ruta de otro usuario o de otro elemento', async () => {
    const t = setup();
    await expect(addPhoto(t.deps, { itemId: 'i1', path: 'u2/i1/a.webp' })).rejects.toThrow('La foto no es válida.');
    await expect(addPhoto(t.deps, { itemId: 'i1', path: 'u1/i2/a.webp' })).rejects.toThrow('La foto no es válida.');
    expect(await t.photos.listPhotos('i1')).toEqual([]);
  });

  it('deletePhoto borra el objeto y luego la fila; si el almacenamiento falla, la fila se queda', async () => {
    const ok = setup();
    const p = await ok.photos.addPhoto({ itemId: 'i1', path: 'u1/i1/a.webp', width: 1, height: 1 });
    await deletePhoto(ok.deps, p.id);
    expect(ok.removed).toEqual(['u1/i1/a.webp']);
    expect(await ok.photos.getPhoto(p.id)).toBeNull();

    const bad = setup(true);
    const q = await bad.photos.addPhoto({ itemId: 'i1', path: 'u1/i1/a.webp', width: 1, height: 1 });
    await expect(deletePhoto(bad.deps, q.id)).rejects.toThrow();
    expect(await bad.photos.getPhoto(q.id)).not.toBeNull();
  });
});

describe('buildPhotoMap', () => {
  it('agrupa por elemento con URL firmadas y omite las que no se pudieron firmar', async () => {
    const t = setup();
    await t.photos.addPhoto({ itemId: 'i1', path: 'u1/i1/a.webp', width: 4, height: 3 });
    await t.photos.addPhoto({ itemId: 'i1', path: 'u1/i1/roto.webp', width: 4, height: 3 });
    await t.photos.addPhoto({ itemId: 'i2', path: 'u1/i2/b.webp', width: null, height: null });
    const map = await buildPhotoMap(t.photos, fakeStorage().storage, ['i1', 'i2', 'i3']);
    expect(map.i1.map((p) => p.url)).toEqual(['https://signed/u1/i1/a.webp']);
    expect(map.i2[0]).toMatchObject({ url: 'https://signed/u1/i2/b.webp', width: null });
    expect(map.i3).toBeUndefined();
  });
});
