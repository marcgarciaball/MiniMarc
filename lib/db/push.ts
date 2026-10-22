import type { SupabaseClient } from '@supabase/supabase-js';

/** A stored Web Push subscription (push_subscriptions row). */
export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionsRepo {
  list(): Promise<PushSub[]>;
  /** Insert or update by `endpoint` (unique). */
  upsert(sub: PushSub): Promise<void>;
  remove(endpoint: string): Promise<void>;
}

/**
 * With `userId` (service-role client) every query is scoped to that user and inserts set it;
 * without it (session client) RLS scopes to auth.uid() and user_id takes its default.
 */
export function createPushSubscriptionsRepo(
  client: SupabaseClient,
  opts: { userId?: string } = {},
): PushSubscriptionsRepo {
  return {
    async list() {
      const q = client.from('push_subscriptions').select('endpoint, p256dh, auth');
      const res = await (opts.userId ? q.eq('user_id', opts.userId) : q);
      if (res.error) throw new Error(`select push_subscriptions: ${res.error.message}`);
      return (res.data ?? []) as PushSub[];
    },
    async upsert(sub) {
      const row = { ...sub, ...(opts.userId ? { user_id: opts.userId } : {}) };
      const res = await client.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
      if (res.error) throw new Error(`upsert push_subscriptions: ${res.error.message}`);
    },
    async remove(endpoint) {
      const q = client.from('push_subscriptions').delete().eq('endpoint', endpoint);
      const res = await (opts.userId ? q.eq('user_id', opts.userId) : q);
      if (res.error) throw new Error(`delete push_subscriptions: ${res.error.message}`);
    },
  };
}
