// Client-side IndexedDB binary blob cache service for offline eBook reading.

const DB_NAME = 'MyVibeReaderCache';
const DB_VERSION = 1;
const STORE_NAME = 'book_files';

interface CachedBookRecord {
  bookId: string;
  blob: Blob;
  cachedAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'bookId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const fileCacheService = {
  /**
   * Save a downloaded eBook binary blob into IndexedDB cache.
   */
  saveBookFile: async (bookId: string, blob: Blob): Promise<void> => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record: CachedBookRecord = {
          bookId,
          blob,
          cachedAt: new Date().toISOString(),
        };
        const request = store.put(record);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn(`Failed to cache book ${bookId} in IndexedDB:`, err);
    }
  },

  /**
   * Retrieve a cached eBook binary blob from IndexedDB.
   */
  getBookFile: async (bookId: string): Promise<Blob | null> => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(bookId);

        request.onsuccess = () => {
          const record = request.result as CachedBookRecord | undefined;
          resolve(record ? record.blob : null);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn(`Failed to read cached book ${bookId} from IndexedDB:`, err);
      return null;
    }
  },

  /**
   * Delete a cached eBook file from IndexedDB.
   */
  deleteBookFile: async (bookId: string): Promise<void> => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(bookId);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn(`Failed to delete cached book ${bookId} from IndexedDB:`, err);
    }
  },

  /**
   * Clear all cached files.
   */
  clearAllCache: async (): Promise<void> => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn('Failed to clear IndexedDB book cache:', err);
    }
  },
};
