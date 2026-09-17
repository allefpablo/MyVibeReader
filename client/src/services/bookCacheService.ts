// Service for caching eBook library metadata in localStorage for offline access.
import { BookDto } from './api';

const CACHE_KEY_PREFIX = 'myvibereader_cached_books_';

export const bookCacheService = {
  saveBooks: (userId: string, books: BookDto[]): void => {
    if (!userId) return;
    try {
      localStorage.setItem(`${CACHE_KEY_PREFIX}${userId}`, JSON.stringify(books));
    } catch (e) {
      console.warn('Failed to cache books in localStorage:', e);
    }
  },

  getBooks: (userId: string): BookDto[] => {
    if (!userId) return [];
    try {
      const data = localStorage.getItem(`${CACHE_KEY_PREFIX}${userId}`);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('Failed to read cached books from localStorage:', e);
      return [];
    }
  },

  clearBooks: (userId: string): void => {
    if (!userId) return;
    try {
      localStorage.removeItem(`${CACHE_KEY_PREFIX}${userId}`);
    } catch (e) {
      console.warn('Failed to clear cached books from localStorage:', e);
    }
  },
};
