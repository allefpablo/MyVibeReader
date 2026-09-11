import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncService } from '../services/syncService';
import { api } from '../services/api';

describe('Sync Engine Timestamp Integrity', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('preserves updatedAt timestamp when enqueuing and flushing offline updates', async () => {
    const updateSpy = vi.spyOn(api, 'updateProgress').mockResolvedValue({
      bookId: 'book-1',
      positionJson: '{"page": 15}',
      deviceId: 'dev-1',
      updatedAt: '2026-09-11T12:00:00.000Z',
    });

    const fixedTime = '2026-09-11T12:00:00.000Z';
    syncService.enqueueProgressUpdate({
      bookId: 'book-1',
      positionJson: '{"page": 15}',
      deviceId: 'dev-1',
      updatedAt: fixedTime,
    });

    expect(syncService.hasQueuedUpdate('book-1')).toBe(true);
    const queued = syncService.getQueuedUpdate('book-1');
    expect(queued?.updatedAt).toBe(fixedTime);

    await syncService.flushQueue();

    expect(updateSpy).toHaveBeenCalledWith(
      'book-1',
      '{"page": 15}',
      'dev-1',
      fixedTime
    );
    expect(syncService.getQueueLength()).toBe(0);
  });
});
