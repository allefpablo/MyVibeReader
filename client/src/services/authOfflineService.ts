// Client-side Offline Authentication Service
// Supports local credentials verification, salt/hash generation, and offline JWT sessions.

import { UserDto, AuthResponse, api } from './api';
import { isJwtValid } from '../utils/jwt';

export interface OfflineUserRecord {
  id: string;
  email: string;
  passwordHash: string; // hex-encoded SHA-256(salt + ":" + password)
  salt: string;         // random hex salt
  token: string;        // last server token
  lastLoginAt: string;  // ISO timestamp
}

export const STORAGE_KEY_OFFLINE_USERS = 'myvibereader_offline_users';
export const STORAGE_KEY_LAST_OFFLINE_EMAIL = 'myvibereader_last_offline_email';

/**
 * Computes SHA-256 hash using Web Crypto API.
 */
async function computeSha256(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for non-WebCrypto test environments
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * Generates a random salt string.
 */
function generateSalt(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function getOfflineUsersMap(): Record<string, OfflineUserRecord> {
  try {
    const data = localStorage.getItem(STORAGE_KEY_OFFLINE_USERS);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveOfflineUsersMap(map: Record<string, OfflineUserRecord>): void {
  try {
    localStorage.setItem(STORAGE_KEY_OFFLINE_USERS, JSON.stringify(map));
  } catch (e) {
    console.warn('Failed to save offline users map to localStorage:', e);
  }
}

export const authOfflineService = {
  /**
   * Generates a structurally valid offline JWT for offline-first reading sessions.
   */
  createOfflineToken: (user: UserDto): string => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    // 30 days validity for uninterrupted offline reading
    const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    const payload = btoa(JSON.stringify({
      sub: user.id,
      email: user.email,
      offline: true,
      exp,
    }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const signature = 'offline-session-sig';
    return `${header}.${payload}.${signature}`;
  },

  /**
   * Saves credentials and user metadata locally for offline verification.
   */
  saveOfflineCredentials: async (
    email: string,
    password: string,
    token: string,
    user: UserDto
  ): Promise<void> => {
    const normalizedEmail = email.trim().toLowerCase();
    const salt = generateSalt();
    const passwordHash = await computeSha256(`${salt}:${password}`);

    const map = getOfflineUsersMap();
    map[normalizedEmail] = {
      id: user.id,
      email: normalizedEmail,
      passwordHash,
      salt,
      token,
      lastLoginAt: new Date().toISOString(),
    };

    saveOfflineUsersMap(map);
    try {
      localStorage.setItem(STORAGE_KEY_LAST_OFFLINE_EMAIL, normalizedEmail);
    } catch {
      // ignore storage errors
    }
  },

  /**
   * Verifies credentials against cached offline accounts.
   */
  verifyOfflineLogin: async (
    email: string,
    password: string
  ): Promise<AuthResponse> => {
    const normalizedEmail = email.trim().toLowerCase();
    const map = getOfflineUsersMap();
    const record = map[normalizedEmail];

    if (!record) {
      throw new Error('No offline account found for this email. Please connect to the internet to sign in for the first time.');
    }

    const computedHash = await computeSha256(`${record.salt}:${password}`);
    if (computedHash !== record.passwordHash) {
      throw new Error('Invalid credentials');
    }

    const user: UserDto = {
      id: record.id,
      email: record.email,
    };

    // Use stored token if still unexpired, otherwise create an offline token
    let token = record.token;
    if (!isJwtValid(token)) {
      token = authOfflineService.createOfflineToken(user);
    }

    return {
      token,
      user,
    };
  },

  /**
   * Unified login that attempts online authentication first,
   * falling back to offline verification upon network failures.
   */
  loginWithOfflineFallback: async (
    email: string,
    password: string
  ): Promise<AuthResponse> => {
    // Check if network is explicitly offline
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return authOfflineService.verifyOfflineLogin(email, password);
    }

    try {
      // Attempt online authentication
      const response = await api.login(email, password);
      // Cache credentials for future offline access
      await authOfflineService.saveOfflineCredentials(email, password, response.token, response.user);
      return response;
    } catch (err: unknown) {
      // Check if error is network-related (fetch failed, server unreachable)
      const isNetworkError =
        err instanceof TypeError ||
        (err instanceof Error &&
          (err.message.includes('Failed to fetch') ||
           err.message.includes('NetworkError') ||
           err.message.includes('fetch failed') ||
           err.message.includes('Load failed')));

      if (isNetworkError) {
        console.warn('Online authentication failed due to network error; falling back to offline credentials.');
        return authOfflineService.verifyOfflineLogin(email, password);
      }

      // If server explicitly rejected credentials (e.g. 401 Unauthorized), rethrow
      throw err;
    }
  },
};
