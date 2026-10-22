/**
 * Web Push (VAPID) to one subscription. Server only. Never logs the payload or the keys.
 * The browser's push service answers 404/410 when a subscription is gone (uninstalled app,
 * revoked permission): then the row is deleted so the next digest does not try it again.
 */
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PushSub } from '@/lib/db/push';

export type { PushSub } from '@/lib/db/push';

export interface PushPayload {
  title: string;
  body: string;
  /** Opened on click (same origin). */
  url: string;
  tag?: string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

type WebPushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
type SendOptions = { vapidDetails: VapidKeys; TTL: number; urgency: 'normal' };
/** One delivery; rejects with an error carrying `statusCode` on HTTP failures (web-push's WebPushError). */
export type PushSender = (sub: WebPushSubscription, body: string, opts: SendOptions) => Promise<void>;

export interface SendPushOptions {
  send?: PushSender;
  vapid?: VapidKeys;
  removeSubscription?: (endpoint: string) => Promise<void>;
}

/** A digest older than 4 h is not worth showing. */
const TTL_SECONDS = 4 * 60 * 60;

export function vapidFromEnv(): VapidKeys {
  return {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    subject: `mailto:${process.env.ALLOWED_EMAIL ?? ''}`,
  };
}

const webPushSender: PushSender = async (sub, body, opts) => {
  await webpush.sendNotification(sub, body, opts);
};

async function removeWithAdmin(endpoint: string): Promise<void> {
  const res = await createAdminClient().from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (res.error) throw new Error(`delete push_subscriptions: ${res.error.message}`);
}

function statusOf(err: unknown): number | undefined {
  const code = (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === 'number' ? code : undefined;
}

/** Sends `payload`. Resolves after delivery or after deleting a gone (404/410) subscription; other failures throw. */
export async function sendPush(sub: PushSub, payload: PushPayload, opts: SendPushOptions = {}): Promise<void> {
  const vapid = opts.vapid ?? vapidFromEnv();
  if (!vapid.publicKey || !vapid.privateKey) throw new Error('Faltan las claves VAPID');
  const send = opts.send ?? webPushSender;
  try {
    await send(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { vapidDetails: vapid, TTL: TTL_SECONDS, urgency: 'normal' },
    );
  } catch (err) {
    const status = statusOf(err);
    if (status === 404 || status === 410) {
      await (opts.removeSubscription ?? removeWithAdmin)(sub.endpoint);
      return;
    }
    throw err;
  }
}
