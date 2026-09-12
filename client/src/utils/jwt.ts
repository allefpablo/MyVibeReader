/**
 * Lightweight and secure JWT inspection and parsing utility.
 * Decodes claims and verifies token structure and expiration.
 */

export interface JwtPayload {
  sub?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

/**
 * Parses the payload segment of a JWT string without evaluating its cryptographic signature.
 * Returns null if the token structure is invalid or decoding fails.
 */
export function parseJwtPayload(token: string): JwtPayload | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = atob(padded);
    const parsed = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Checks whether a given JWT is non-empty, structurally well-formed,
 * and has not expired according to its `exp` claim.
 */
export function isJwtValid(token: string | null | undefined): boolean {
  if (!token) return false;

  const payload = parseJwtPayload(token);
  if (!payload) return false;

  if (typeof payload.exp === 'number') {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowSeconds) {
      return false;
    }
  }

  return true;
}
