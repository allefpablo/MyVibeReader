import { create } from 'zustand';
import { UserDto } from '../services/api';
import { isJwtValid, parseJwtPayload } from '../utils/jwt';

interface AppState {
  token: string | null;
  user: UserDto | null;
  activeBookId: string | null;
  setAuth: (token: string, user: UserDto) => void;
  logout: () => void;
  setActiveBookId: (id: string | null) => void;
}

export const STORAGE_KEY_TOKEN = 'myvibereader_token';
export const STORAGE_KEY_USER = 'myvibereader_user';

export function getValidStoredAuth(): { token: string | null; user: UserDto | null } {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN);
  if (!token || !isJwtValid(token)) {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
    return { token: null, user: null };
  }

  let user: UserDto | null = null;
  try {
    const userStr = localStorage.getItem(STORAGE_KEY_USER);
    if (userStr && userStr !== 'undefined') {
      const parsed = JSON.parse(userStr);
      if (parsed && typeof parsed.id === 'string' && typeof parsed.email === 'string') {
        user = parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse stored user from localStorage:', e);
  }

  if (!user) {
    const payload = parseJwtPayload(token);
    if (payload?.sub) {
      user = { id: payload.sub, email: '' };
      try {
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      } catch {
        // ignore localStorage errors
      }
    } else {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_USER);
      return { token: null, user: null };
    }
  }

  return { token, user };
}

const initialAuth = getValidStoredAuth();

export const useAppStore = create<AppState>((set) => ({
  token: initialAuth.token,
  user: initialAuth.user,
  activeBookId: null,

  setAuth: (token: string, user: UserDto) => {
    if (!isJwtValid(token)) {
      console.warn('Attempted to set an invalid or expired JWT token; purging auth state.');
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_USER);
      set({ token: null, user: null });
      return;
    }

    localStorage.setItem(STORAGE_KEY_TOKEN, token);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    set({ token, user });
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
    set({ token: null, user: null, activeBookId: null });
  },

  setActiveBookId: (id: string | null) => {
    set({ activeBookId: id });
  },
}));
