import { create } from 'zustand';
import { UserDto } from '../services/api';

interface AppState {
  token: string | null;
  user: UserDto | null;
  activeBookId: string | null;
  setAuth: (token: string, user: UserDto) => void;
  logout: () => void;
  setActiveBookId: (id: string | null) => void;
}

const STORAGE_KEY_TOKEN = 'myvibereader_token';
const STORAGE_KEY_USER = 'myvibereader_user';

const initialToken = localStorage.getItem(STORAGE_KEY_TOKEN);
let initialUser: UserDto | null = null;

try {
  const initialUserStr = localStorage.getItem(STORAGE_KEY_USER);
  if (initialUserStr && initialUserStr !== 'undefined') {
    initialUser = JSON.parse(initialUserStr);
  }
} catch (e) {
  console.warn('Failed to parse stored user from localStorage:', e);
  localStorage.removeItem(STORAGE_KEY_USER);
}

export const useAppStore = create<AppState>((set) => ({
  token: initialToken,
  user: initialUser,
  activeBookId: null,

  setAuth: (token: string, user: UserDto) => {
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
