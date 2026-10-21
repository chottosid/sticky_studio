import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Constant-time check of the single account's email (case-insensitive) and password. */
export function credentialsMatch(
  email: string,
  password: string,
  expected: { email: string | undefined; password: string | undefined },
): boolean {
  if (!expected.email || !expected.password) return false;
  const emailOk = timingSafeEqual(digest(email.trim().toLowerCase()), digest(expected.email.trim().toLowerCase()));
  const passwordOk = timingSafeEqual(digest(password), digest(expected.password));
  return emailOk && passwordOk;
}
