import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../../next.config';

const root = path.join(__dirname, '../..');

describe('/regalos/[personId] → /personas/[id]', () => {
  it('redirects (temporary) instead of rendering a second person page', async () => {
    expect(await config.redirects!()).toContainEqual({
      source: '/regalos/:personId',
      destination: '/personas/:personId',
      permanent: false,
    });
    expect(existsSync(path.join(root, 'app/(app)/regalos/[personId]/page.tsx'))).toBe(false);
    expect(existsSync(path.join(root, 'app/(app)/personas/[id]/page.tsx'))).toBe(true);
    expect(existsSync(path.join(root, 'app/(app)/personas/page.tsx'))).toBe(true);
  });
});
