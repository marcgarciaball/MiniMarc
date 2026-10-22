import { describe, expect, it } from 'vitest';
import type { PushSub, PushSubscriptionsRepo } from '@/lib/db/push';
import { handlePushSubscription, type SubscribeDeps } from '@/lib/push/subscribe';

const URL_ = 'https://mini-marc-personal.vercel.app/api/push/subscribe';
const valid = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BPk', auth: 'xyz' } };

function setup(userId: string | null = 'user-marc') {
  const store = new Map<string, PushSub>();
  const repoFor: string[] = [];
  const repo: PushSubscriptionsRepo = {
    async list() {
      return [...store.values()];
    },
    async upsert(s) {
      store.set(s.endpoint, s);
    },
    async remove(endpoint) {
      store.delete(endpoint);
    },
  };
  const deps: SubscribeDeps = {
    async userId() {
      return userId;
    },
    async repo(uid) {
      repoFor.push(uid);
      return repo;
    },
  };
  return { store, deps, repoFor };
}

const req = (method: string, body: unknown, type = 'application/json') =>
  new Request(URL_, { method, headers: { 'Content-Type': type }, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('handlePushSubscription', () => {
  it('sin sesión (o con otro usuario) → 401 y no guarda nada', async () => {
    const { store, deps, repoFor } = setup(null);
    const res = await handlePushSubscription(req('POST', valid), deps);
    expect(res.status).toBe(401);
    expect(store.size).toBe(0);
    expect(repoFor).toEqual([]);
  });

  it('POST válido → 200 y guarda la suscripción del usuario', async () => {
    const { store, deps, repoFor } = setup();
    const res = await handlePushSubscription(req('POST', valid), deps);
    expect(res.status).toBe(200);
    expect(repoFor).toEqual(['user-marc']);
    expect(store.get(valid.endpoint)).toEqual({ endpoint: valid.endpoint, p256dh: 'BPk', auth: 'xyz' });
  });

  it('POST repetido con el mismo endpoint actualiza (upsert), no duplica', async () => {
    const { store, deps } = setup();
    await handlePushSubscription(req('POST', valid), deps);
    await handlePushSubscription(req('POST', { ...valid, keys: { p256dh: 'new', auth: 'new' } }), deps);
    expect(store.size).toBe(1);
    expect(store.get(valid.endpoint)?.p256dh).toBe('new');
  });

  it.each([
    ['sin endpoint', { keys: valid.keys }],
    ['endpoint no https', { ...valid, endpoint: 'http://push.example/x' }],
    ['endpoint no es URL', { ...valid, endpoint: 'nada' }],
    ['sin p256dh', { endpoint: valid.endpoint, keys: { auth: 'x' } }],
    ['auth vacío', { endpoint: valid.endpoint, keys: { p256dh: 'x', auth: '' } }],
    ['sin keys', { endpoint: valid.endpoint }],
  ])('POST inválido (%s) → 400', async (_name, body) => {
    const { store, deps } = setup();
    const res = await handlePushSubscription(req('POST', body), deps);
    expect(res.status).toBe(400);
    expect(store.size).toBe(0);
  });

  it('cuerpo que no es JSON → 400', async () => {
    const { deps } = setup();
    expect((await handlePushSubscription(req('POST', '{no'), deps)).status).toBe(400);
  });

  it('Content-Type distinto de JSON → 415', async () => {
    const { deps, store } = setup();
    expect((await handlePushSubscription(req('POST', valid, 'text/plain'), deps)).status).toBe(415);
    expect(store.size).toBe(0);
  });

  it('DELETE borra por endpoint; sin sesión → 401', async () => {
    const { store, deps } = setup();
    await handlePushSubscription(req('POST', valid), deps);
    const anon = setup(null);
    expect((await handlePushSubscription(req('DELETE', { endpoint: valid.endpoint }), anon.deps)).status).toBe(401);
    const res = await handlePushSubscription(req('DELETE', { endpoint: valid.endpoint }), deps);
    expect(res.status).toBe(200);
    expect(store.size).toBe(0);
  });

  it('DELETE sin endpoint válido → 400', async () => {
    const { deps } = setup();
    expect((await handlePushSubscription(req('DELETE', {}), deps)).status).toBe(400);
  });
});
