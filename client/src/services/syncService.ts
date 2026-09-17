import { api } from './api';

export interface QueuedProgressUpdate {
  bookId: string;
  positionJson: string;
  deviceId: string;
  updatedAt: string;
}

const QUEUE_STORAGE_KEY = 'myvibereader_sync_queue';

function getQueue(): QueuedProgressUpdate[] {
  const data = localStorage.getItem(QUEUE_STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

function saveQueue(queue: QueuedProgressUpdate[]): void {
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
}

export const syncService = {
  getQueueLength: (): number => getQueue().length,

  hasQueuedUpdate: (bookId: string): boolean => {
    const queue = getQueue();
    return queue.some((item) => item.bookId === bookId);
  },

  getQueuedUpdate: (bookId: string): QueuedProgressUpdate | undefined => {
    const queue = getQueue();
    return queue.find((item) => item.bookId === bookId);
  },

  enqueueProgressUpdate: (update: QueuedProgressUpdate): void => {
    const queue = getQueue();
    // Replace any existing update for the same bookId to keep queue minimal
    const filtered = queue.filter((item) => item.bookId !== update.bookId);
    filtered.push(update);
    saveQueue(filtered);
  },

  flushQueue: async (): Promise<void> => {
    const queue = getQueue();
    if (queue.length === 0) return;

    const remainingQueue: QueuedProgressUpdate[] = [];

    for (const item of queue) {
      try {
        await api.updateProgress(item.bookId, item.positionJson, item.deviceId, item.updatedAt);
      } catch (err: any) {
        const msg = String(err?.message || err);
        // Discard poison pills: 400 (bad format/future clock), 404 (deleted book)
        if (msg.includes('404') || msg.includes('400') || msg.toLowerCase().includes('not found')) {
          console.warn(`Dropping unrecoverable progress update for book ${item.bookId}:`, msg);
          continue;
        }
        console.warn(`Failed to flush progress for book ${item.bookId}; retaining in queue:`, msg);
        remainingQueue.push(item);
      }
    }

    saveQueue(remainingQueue);
  },
};

// Automatically set up event listeners and periodic interval to flush queue
if (typeof window !== 'undefined') {
  const tryFlush = () => {
    if (syncService.getQueueLength() > 0) {
      syncService.flushQueue().catch(() => {});
    }
  };

  window.addEventListener('online', tryFlush);
  window.addEventListener('focus', tryFlush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tryFlush();
    }
  });
}
