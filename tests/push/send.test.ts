import { describe, expect, it } from 'vitest';
import { sendPush, type PushPayload, type PushSender, type PushSub } from '@/lib/push/send';

const sub: PushSub = { endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a' };
const payload: PushPayload = { title: 'Hoy', body: 'Buenos días', url: '/hoy' };
const vapid = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:marc@example.com' };

function setup(result: 'ok' | number | Error) {
  const removed: string[] = [];
  const calls: { sub: unknown; body: string; opts: unknown }[] = [];
  const send: PushSender = async (s, body, opts) => {
    calls.push({ sub: s, body, opts });
    if (result === 'ok') return;
    if (result instanceof Error) throw result;
    throw Object.assign(new Error('push failed'), { statusCode: result });
  };
  const opts = { send, vapid, removeSubscription: async (endpoint: string) => void removed.push(endpoint) };
  return { removed, calls, opts };
}

describe('sendPush', () => {
  it('envía el payload como JSON a la suscripción, con las claves VAPID', async () => {
    const { calls, removed, opts } = setup('ok');
    await sendPush(sub, payload, opts);
    expect(calls).toHaveLength(1);
    expect(calls[0].sub).toEqual({ endpoint: sub.endpoint, keys: { p256dh: 'p', auth: 'a' } });
    expect(JSON.parse(calls[0].body)).toEqual(payload);
    expect(calls[0].opts).toMatchObject({ vapidDetails: vapid });
    expect(removed).toEqual([]);
  });

  it.each([404, 410])('si el servicio responde %i, borra la suscripción y no lanza', async (status) => {
    const { removed, opts } = setup(status);
    await expect(sendPush(sub, payload, opts)).resolves.toBeUndefined();
    expect(removed).toEqual([sub.endpoint]);
  });

  it('otros errores (500, red) se propagan y no borran la suscripción', async () => {
    const a = setup(500);
    await expect(sendPush(sub, payload, a.opts)).rejects.toThrow();
    expect(a.removed).toEqual([]);
    const b = setup(new Error('ECONNRESET'));
    await expect(sendPush(sub, payload, b.opts)).rejects.toThrow('ECONNRESET');
    expect(b.removed).toEqual([]);
  });

  it('sin claves VAPID lanza sin intentar enviar', async () => {
    const { calls, opts } = setup('ok');
    await expect(sendPush(sub, payload, { ...opts, vapid: { ...vapid, privateKey: '' } })).rejects.toThrow(/VAPID/);
    expect(calls).toHaveLength(0);
  });
});
