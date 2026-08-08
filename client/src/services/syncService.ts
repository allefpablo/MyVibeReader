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
        await api.updateProgress(item.bookId, item.positionJson, item.deviceId);
      } catch (err) {
        console.warn(`Failed to flush progress for book ${item.bookId}:`, err);
        remainingQueue.push(item);
      }
    }

    saveQueue(remainingQueue);
  },
};
