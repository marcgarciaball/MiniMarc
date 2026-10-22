import { connection } from 'next/server';
import { isAllowedEmail } from '@/lib/auth/allowlist';
import { createPushSubscriptionsRepo } from '@/lib/db/push';
import { handlePushSubscription, type SubscribeDeps } from '@/lib/push/subscribe';
import { createClient } from '@/lib/supabase/server';

/** Session client: RLS (owner + allowed email) scopes every write to Marc. */
async function deps(): Promise<SubscribeDeps> {
  const supabase = await createClient();
  return {
    async userId() {
      const { data, error } = await supabase.auth.getUser();
      return !error && data.user && isAllowedEmail(data.user.email) ? data.user.id : null;
    },
    async repo() {
      return createPushSubscriptionsRepo(supabase);
    },
  };
}

export async function POST(request: Request) {
  await connection();
  return handlePushSubscription(request, await deps());
}

export async function DELETE(request: Request) {
  await connection();
  return handlePushSubscription(request, await deps());
}
