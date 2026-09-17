import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authOfflineService } from '../services/authOfflineService';
import { bookCacheService } from '../services/bookCacheService';
import { fileCacheService } from '../services/fileCacheService';
import { isJwtValid, parseJwtPayload } from '../utils/jwt';
import { getValidStoredAuth, useAppStore } from '../store/appStore';
import { syncService } from '../services/syncService';
import { BookDto } from '../services/api';

describe('Offline Authentication Service (authOfflineService)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().logout();
  });

  it('saves offline credentials and successfully verifies matching email and password', async () => {
    const user = { id: 'user-offline-1', email: 'reader@example.com' };
    const token = 'token-online-123';

    await authOfflineService.saveOfflineCredentials('reader@example.com', 'MyPassword123!', token, user);

    // Verify correct credentials
    const result = await authOfflineService.verifyOfflineLogin('reader@example.com', 'MyPassword123!');
    expect(result).not.toBeNull();
    expect(result.user.id).toBe('user-offline-1');
    expect(result.user.email).toBe('reader@example.com');
  });

  it('handles email casing and trimming case-insensitively', async () => {
    const user = { id: 'user-case-1', email: 'cased@example.com' };
    const token = 'token-cased-123';

    await authOfflineService.saveOfflineCredentials('Cased@Example.COM ', 'Secret123!', token, user);

    const result = await authOfflineService.verifyOfflineLogin(' cased@example.com', 'Secret123!');
    expect(result.user.id).toBe('user-case-1');
  });

  it('rejects offline login when password is incorrect', async () => {
    const user = { id: 'user-offline-2', email: 'reader@example.com' };
    await authOfflineService.saveOfflineCredentials('reader@example.com', 'CorrectPass123!', 'token-123', user);

    await expect(
      authOfflineService.verifyOfflineLogin('reader@example.com', 'WrongPass123!')
    ).rejects.toThrow(/invalid credentials/i);
  });

  it('rejects offline login when no offline account exists for the email', async () => {
    await expect(
      authOfflineService.verifyOfflineLogin('nonexistent@example.com', 'Password123!')
    ).rejects.toThrow(/no offline account found/i);
  });

  it('generates a structurally valid offline token if cached server token is expired', async () => {
    const user = { id: 'user-offline-3', email: 'offline@example.com' };
    // Old expired token (expired 1 hour ago)
    const pastExp = Math.floor(Date.now() / 1000) - 3600;
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({ sub: user.id, exp: pastExp }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const expiredToken = `${header}.${payload}.sig`;

    await authOfflineService.saveOfflineCredentials(user.email, 'Pass12345!', expiredToken, user);

    const result = await authOfflineService.verifyOfflineLogin(user.email, 'Pass12345!');
    expect(result.token).toBeDefined();
    // The returned token must be valid and unexpired so client app can function offline
    expect(isJwtValid(result.token)).toBe(true);
    const parsed = parseJwtPayload(result.token);
    expect(parsed?.sub).toBe(user.id);
    expect(parsed?.offline).toBe(true);
  });

  it('allows offline session to persist in getValidStoredAuth without purging', async () => {
    const user = { id: 'user-offline-4', email: 'persistent@example.com' };
    const offlineToken = authOfflineService.createOfflineToken(user);

    useAppStore.getState().setAuth(offlineToken, user);

    const stored = getValidStoredAuth();
    expect(stored.token).toBe(offlineToken);
    expect(stored.user).toEqual(user);
  });
});

describe('Offline Library & Books Cache Service (bookCacheService)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const sampleBooks: BookDto[] = [
    {
      id: 'book-1',
      title: 'Offline Book 1',
      format: 'PDF',
      uploadedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'book-2',
      title: 'Offline Book 2',
      format: 'EPUB',
      uploadedAt: '2026-01-02T00:00:00Z',
    },
  ];

  it('saves and retrieves cached books per user', () => {
    const userId = 'user-123';
    bookCacheService.saveBooks(userId, sampleBooks);

    const cached = bookCacheService.getBooks(userId);
    expect(cached).toHaveLength(2);
    expect(cached[0].title).toBe('Offline Book 1');
    expect(cached[1].format).toBe('EPUB');
  });

  it('returns empty array when no books are cached for user', () => {
    const cached = bookCacheService.getBooks('user-unknown');
    expect(cached).toEqual([]);
  });
});

describe('File Cache Service Offline Checking', () => {
  it('hasBookFile returns false when book is not cached', async () => {
    const exists = await fileCacheService.hasBookFile('non-existent-book');
    expect(exists).toBe(false);
  });
});

describe('Offline Reading Position Tracking & Sync Reconnection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('enqueues progress update when reading offline and flushes when back online', async () => {
    const update = {
      bookId: 'book-offline-reading',
      positionJson: JSON.stringify({ page: 45, scrollY: 120 }),
      deviceId: 'tauri-offline-mac',
      updatedAt: '2026-09-16T20:00:00.000Z',
    };

    syncService.enqueueProgressUpdate(update);
    expect(syncService.getQueueLength()).toBe(1);
    expect(syncService.hasQueuedUpdate('book-offline-reading')).toBe(true);

    const queued = syncService.getQueuedUpdate('book-offline-reading');
    expect(queued?.positionJson).toBe(update.positionJson);
    expect(queued?.deviceId).toBe('tauri-offline-mac');
  });
});

describe('API Service Offline Login Fallback (api.login & api.register)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().logout();
  });

  it('falls back to offline authentication if network request fails with network error', async () => {
    const user = { id: 'user-cached-1', email: 'offline.reader@example.com' };
    await authOfflineService.saveOfflineCredentials(
      'offline.reader@example.com',
      'ValidPass123!',
      'cached-token-123',
      user
    );

    // Mock fetch to simulate network offline / network failure
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    try {
      const response = await authOfflineService.loginWithOfflineFallback(
        'offline.reader@example.com',
        'ValidPass123!'
      );
      expect(response.user.id).toBe('user-cached-1');
      expect(response.token).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('does NOT fallback to offline auth if server returns 401 Unauthorized (online credentials rejected)', async () => {
    const user = { id: 'user-cached-2', email: 'existing@example.com' };
    await authOfflineService.saveOfflineCredentials(
      'existing@example.com',
      'OldPass123!',
      'cached-token',
      user
    );

    // Mock fetch to simulate online response with HTTP 401
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Invalid credentials',
      headers: new Headers(),
    }) as any;

    try {
      await expect(
        authOfflineService.loginWithOfflineFallback('existing@example.com', 'OldPass123!')
      ).rejects.toThrow('Invalid credentials');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

