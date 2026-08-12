export const SESSION_COOKIE_NAME = 'session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const encoder = new TextEncoder();

function getSessionSecret(): string | null {
  return process.env.SESSION_SECRET || process.env.APP_USER_PASSWORD || null;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signatureFor(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bytesToHex(new Uint8Array(signature));
}

export async function createSessionToken(): Promise<string> {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('SESSION_SECRET is not configured.');
  }

  const expiresAt = Math.floor(Date.now() / 1_000) + SESSION_MAX_AGE_SECONDS;
  const payload = `v1:${expiresAt}`;
  return `${payload}.${await signatureFor(payload, secret)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;

  const secret = getSessionSecret();
  if (!secret) return false;

  const separator = token.lastIndexOf('.');
  if (separator < 0) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const [version, expiresAtValue] = payload.split(':');
  const expiresAt = Number(expiresAtValue);

  if (version !== 'v1' || !Number.isFinite(expiresAt) || expiresAt <= Date.now() / 1_000) {
    return false;
  }

  const expectedSignature = await signatureFor(payload, secret);
  if (signature.length !== expectedSignature.length) return false;

  let difference = 0;
  for (let index = 0; index < signature.length; index += 1) {
    difference |= signature.charCodeAt(index) ^ expectedSignature.charCodeAt(index);
  }
  return difference === 0;
}

