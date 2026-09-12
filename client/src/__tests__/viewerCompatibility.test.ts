import { describe, it, expect, beforeEach } from 'vitest';
import '../utils/polyfills';
import { applyEpubPatches } from '../utils/epubPatch';
import ePub from 'epubjs';

describe('Viewer Compatibility & Polyfills', () => {
  describe('Uint8Array Hex Polyfills', () => {
    it('should correctly format Uint8Array to hex string', () => {
      const bytes = new Uint8Array([0, 15, 16, 255, 170]);
      const hex = (bytes as any).toHex();
      expect(hex).toBe('000f10ffaa');
    });

    it('should handle empty Uint8Array', () => {
      const bytes = new Uint8Array([]);
      const hex = (bytes as any).toHex();
      expect(hex).toBe('');
    });

    it('should correctly populate Uint8Array from hex string', () => {
      const target = new Uint8Array(4);
      const res = (target as any).setFromHex('01020304');
      expect(res.read).toBe(8);
      expect(res.written).toBe(4);
      expect(Array.from(target)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('Map Proposal Polyfills', () => {
    it('should compute and insert value if key does not exist', () => {
      const map = new Map<string, number>();
      const val = (map as any).getOrInsertComputed('count', () => 42);
      expect(val).toBe(42);
      expect(map.get('count')).toBe(42);

      // Subsequent call does not recompute
      const val2 = (map as any).getOrInsertComputed('count', () => 99);
      expect(val2).toBe(42);
    });

    it('should insert default value if key does not exist', () => {
      const map = new Map<string, string>();
      const val = (map as any).getOrInsert('status', 'ready');
      expect(val).toBe('ready');
      expect(map.get('status')).toBe('ready');

      const val2 = (map as any).getOrInsert('status', 'ignored');
      expect(val2).toBe('ready');
    });
  });

  describe('EPUB Patch & Resilient Archive Loading', () => {
    beforeEach(() => {
      applyEpubPatches();
    });

    it('should patch ePub.Book prototype unarchive and loadNavigation', () => {
      expect((ePub as any).Book.prototype.unarchive).toBeDefined();
      expect((ePub as any).Book.prototype.loadNavigation).toBeDefined();
    });

    it('should gracefully handle navigation load failure without throwing unhandled rejection', async () => {
      const BookClass = (ePub as any).Book;
      const fakeBook = Object.create(BookClass.prototype);
      fakeBook.load = () => Promise.reject(new Error('File not found in the epub: /OEBPS/toc01.xhtml'));

      const packaging = {
        navPath: 'toc01.xhtml',
        ncxPath: undefined,
      };

      const nav = await fakeBook.loadNavigation(packaging);
      expect(nav).toBeDefined();
      expect(nav.toc).toEqual([]);
      expect(nav.landmarks).toEqual([]);
    });

    it('should fallback to ncxPath if navPath fails', async () => {
      const BookClass = (ePub as any).Book;
      const fakeBook = Object.create(BookClass.prototype);
      fakeBook.load = (path: string) => {
        if (path === 'toc01.xhtml') {
          return Promise.reject(new Error('Not found'));
        }
        if (path === 'toc.ncx') {
          return Promise.resolve('<ncx></ncx>');
        }
        return Promise.reject(new Error('Unknown'));
      };

      const packaging = {
        navPath: 'toc01.xhtml',
        ncxPath: 'toc.ncx',
      };

      const nav = await fakeBook.loadNavigation(packaging);
      expect(nav).toBeDefined();
      expect(nav.toc).toEqual([]);
    });
  });
});
