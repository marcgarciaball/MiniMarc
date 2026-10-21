/** Real wiring for POST /api/capture: service-role repos scoped to the token's owner. Server only. */
import { createGeminiProvider } from '@/lib/ai/gemini';
import { verifyApiToken } from '@/lib/auth/tokens';
import { calendarGatewayFor } from '@/lib/calendar/server';
import { createSupabaseItemsRepo } from '@/lib/db/items';
import { createSupabasePeopleRepo } from '@/lib/db/people';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_TZ } from '@/lib/time';
import type { CaptureRouteDeps } from './handler';

export const captureRouteDeps: CaptureRouteDeps = {
  verify: (authHeader) => verifyApiToken(authHeader),
  async captureDeps(userId) {
    const admin = createAdminClient();
    return {
      ai: createGeminiProvider(),
      items: createSupabaseItemsRepo(admin, { userId }),
      people: createSupabasePeopleRepo(admin, { userId }),
      calendar: () => calendarGatewayFor(userId),
      now: new Date(),
      tz: process.env.APP_TZ || DEFAULT_TZ,
      userId,
    };
  },
};
