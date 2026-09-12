import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseJwtPayload, isJwtValid } from '../utils/jwt';
import { getValidStoredAuth, useAppStore } from '../store/appStore';
import { api } from '../services/api';

// Helper to construct a synthetic JWT with arbitrary payload
function createTestJwt(payload: Record<string, any>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const signature = 'fake-signature';
  return `${header}.${body}.${signature}`;
}

describe('JWT Security & Token Validation Utilities', () => {
  it('correctly parses valid JWT payload and claims', () => {
    const payload = { sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600, email: 'test@example.com' };
    const token = createTestJwt(payload);

    const parsed = parseJwtPayload(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.sub).toBe('user-123');
    expect(parsed?.email).toBe('test@example.com');
  });

  it('rejects malformed tokens with non-3-part structure or invalid JSON', () => {
    expect(parseJwtPayload('not-a-jwt')).toBeNull();
    expect(parseJwtPayload('header.payload')).toBeNull();
    expect(parseJwtPayload('header.payload.signature.extra')).toBeNull();
    expect(parseJwtPayload('header.invalid-base64.signature')).toBeNull();
    expect(parseJwtPayload('')).toBeNull();
    expect(parseJwtPayload(null as any)).toBeNull();
  });

  it('validates that future-expiring tokens are valid', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour in future
    const token = createTestJwt({ sub: 'user-123', exp: futureExp });

    expect(isJwtValid(token)).toBe(true);
  });

  it('detects and rejects expired tokens', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 60; // 1 minute in past
    const token = createTestJwt({ sub: 'user-123', exp: pastExp });

    expect(isJwtValid(token)).toBe(false);
  });

  it('rejects invalid or empty tokens in isJwtValid', () => {
    expect(isJwtValid(null)).toBe(false);
    expect(isJwtValid(undefined)).toBe(false);
    expect(isJwtValid('')).toBe(false);
    expect(isJwtValid('malformed.jwt.token')).toBe(false);
  });
});

describe('Auth Store Storage Security & Lifecycle', () => {
  const STORAGE_KEY_TOKEN = 'myvibereader_token';
  const STORAGE_KEY_USER = 'myvibereader_user';

  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().logout();
  });

  it('restores valid unexpired token and user from localStorage', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const token = createTestJwt({ sub: 'user-123', exp: futureExp });
    const user = { id: 'user-123', email: 'valid@example.com' };

    localStorage.setItem(STORAGE_KEY_TOKEN, token);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));

    const restored = getValidStoredAuth();
    expect(restored.token).toBe(token);
    expect(restored.user).toEqual(user);
  });

  it('purges expired token and user from localStorage on initialization', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 300;
    const expiredToken = createTestJwt({ sub: 'user-123', exp: pastExp });
    const user = { id: 'user-123', email: 'expired@example.com' };

    localStorage.setItem(STORAGE_KEY_TOKEN, expiredToken);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));

    const restored = getValidStoredAuth();
    expect(restored.token).toBeNull();
    expect(restored.user).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY_USER)).toBeNull();
  });

  it('purges corrupt/malformed token and user from localStorage on initialization', () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'not-a-valid-token');
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify({ id: '1', email: 'test@test.com' }));

    const restored = getValidStoredAuth();
    expect(restored.token).toBeNull();
    expect(restored.user).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY_USER)).toBeNull();
  });

  it('setAuth stores valid tokens and rejects expired tokens', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 10;
    const expiredToken = createTestJwt({ sub: 'user-123', exp: pastExp });
    const user = { id: 'user-123', email: 'test@example.com' };

    useAppStore.getState().setAuth(expiredToken, user);

    expect(useAppStore.getState().token).toBeNull();
    expect(useAppStore.getState().user).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBeNull();

    // Now test valid token
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const validToken = createTestJwt({ sub: 'user-123', exp: futureExp });

    useAppStore.getState().setAuth(validToken, user);

    expect(useAppStore.getState().token).toBe(validToken);
    expect(useAppStore.getState().user).toEqual(user);
    expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBe(validToken);
  });

  it('evicts session via logout when authenticated api request returns 401 or 403', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const validToken = createTestJwt({ sub: 'user-123', exp: futureExp });
    const user = { id: 'user-123', email: 'user@example.com' };

    useAppStore.getState().setAuth(validToken, user);
    expect(useAppStore.getState().token).toBe(validToken);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
      headers: new Headers(),
    }) as any;

    try {
      await expect(api.getBooks()).rejects.toThrow('Unauthorized');
      expect(useAppStore.getState().token).toBeNull();
      expect(useAppStore.getState().user).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
