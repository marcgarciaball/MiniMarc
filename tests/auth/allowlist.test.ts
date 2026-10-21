import { describe, it, expect } from 'vitest';
import { isAllowedEmail } from '@/lib/auth/allowlist';

describe('isAllowedEmail', () => {
  it('accepts the allowed email', () => {
    expect(isAllowedEmail('marc@x.com', 'marc@x.com')).toBe(true);
  });

  it('ignores case and surrounding spaces on both sides', () => {
    expect(isAllowedEmail('  Marc@X.com ', 'marc@x.com')).toBe(true);
    expect(isAllowedEmail('marc@x.com', ' MARC@x.COM  ')).toBe(true);
  });

  it('rejects a different email', () => {
    expect(isAllowedEmail('otro@x.com', 'marc@x.com')).toBe(false);
  });

  it('rejects undefined or empty email', () => {
    expect(isAllowedEmail(undefined, 'marc@x.com')).toBe(false);
    expect(isAllowedEmail('', 'marc@x.com')).toBe(false);
    expect(isAllowedEmail('   ', 'marc@x.com')).toBe(false);
  });

  it('rejects everyone when the allowlist is not configured', () => {
    expect(isAllowedEmail('marc@x.com', undefined)).toBe(false);
    expect(isAllowedEmail('marc@x.com', '')).toBe(false);
    expect(isAllowedEmail('', '')).toBe(false);
  });
});
