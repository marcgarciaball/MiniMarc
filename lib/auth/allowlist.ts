const normalize = (value: string | undefined) => (value ?? '').trim().toLowerCase();

/** True only if `email` matches the single allowed address (case/space-insensitive). */
export function isAllowedEmail(
  email: string | undefined,
  allowed = process.env.ALLOWED_EMAIL,
): boolean {
  const e = normalize(email);
  const a = normalize(allowed);
  return e !== '' && a !== '' && e === a;
}
