import { beforeEach, describe, expect, it } from 'vitest';
import { createItemsRepo, type ItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPhotosRepo, type PhotosRepo } from '@/lib/db/photos';

let now: Date;
let items: ItemsRepo;
let photos: PhotosRepo;
let backend: ReturnType<typeof createMemoryBackend>;

beforeEach(() => {
  now = new Date('2026-10-22T10:00:00Z');
  const clock = () => now;
  backend = createMemoryBackend({ now: clock });
  items = createItemsRepo(backend, { now: clock });
  photos = createPhotosRepo(backend);
});

describe('photos repo', () => {
  it('añade varias fotos a un elemento y las lista por orden de creación', async () => {
    const item = await items.createItem({ type: 'idea', title: 'Sofá' });
    const a = await photos.addPhoto({ itemId: item.id, path: `u/${item.id}/a.webp`, width: 1600, height: 1200 });
    now = new Date('2026-10-22T10:01:00Z');
    const b = await photos.addPhoto({ itemId: item.id, path: `u/${item.id}/b.webp`, width: null, height: null });
    expect(a).toMatchObject({ itemId: item.id, path: `u/${item.id}/a.webp`, width: 1600, height: 1200 });
    expect(a.id).toBeTruthy();
    expect(a.createdAt).toBe('2026-10-22T10:00:00.000Z');
    expect((await photos.listPhotos(item.id)).map((p) => p.id)).toEqual([a.id, b.id]);
  });

  it('listPhotos solo devuelve las fotos de ese elemento', async () => {
    const x = await items.createItem({ type: 'idea', title: 'x' });
    const y = await items.createItem({ type: 'idea', title: 'y' });
    await photos.addPhoto({ itemId: x.id, path: 'u/x/1.webp', width: 1, height: 1 });
    await photos.addPhoto({ itemId: y.id, path: 'u/y/1.webp', width: 1, height: 1 });
    expect((await photos.listPhotos(x.id)).map((p) => p.path)).toEqual(['u/x/1.webp']);
    expect(await photos.listPhotos('otro')).toEqual([]);
  });

  it('listPhotosFor agrupa las de varios elementos y con [] no consulta nada', async () => {
    const x = await items.createItem({ type: 'idea', title: 'x' });
    const y = await items.createItem({ type: 'idea', title: 'y' });
    const z = await items.createItem({ type: 'idea', title: 'z' });
    await photos.addPhoto({ itemId: x.id, path: 'u/x/1.webp', width: 1, height: 1 });
    await photos.addPhoto({ itemId: y.id, path: 'u/y/1.webp', width: 1, height: 1 });
    await photos.addPhoto({ itemId: z.id, path: 'u/z/1.webp', width: 1, height: 1 });
    const got = await photos.listPhotosFor([x.id, y.id]);
    expect(got.map((p) => p.path).sort()).toEqual(['u/x/1.webp', 'u/y/1.webp']);
    expect(await photos.listPhotosFor([])).toEqual([]);
  });

  it('getPhoto devuelve la foto o null; removePhoto la borra', async () => {
    const item = await items.createItem({ type: 'idea', title: 'x' });
    const p = await photos.addPhoto({ itemId: item.id, path: 'u/x/1.webp', width: 1, height: 1 });
    expect((await photos.getPhoto(p.id))?.path).toBe('u/x/1.webp');
    await photos.removePhoto(p.id);
    expect(await photos.getPhoto(p.id)).toBeNull();
    expect(await photos.listPhotos(item.id)).toEqual([]);
  });

  it('el borrado suave del elemento conserva sus fotos', async () => {
    const item = await items.createItem({ type: 'idea', title: 'x' });
    await photos.addPhoto({ itemId: item.id, path: 'u/x/1.webp', width: 1, height: 1 });
    await items.softDeleteItem(item.id);
    expect(await photos.listPhotos(item.id)).toHaveLength(1);
  });
});
