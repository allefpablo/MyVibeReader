import { useState, useEffect, useCallback, useRef } from 'react';
import { api, ProgressDto } from '../services/api';
import { syncService } from '../services/syncService';

const getLocalStorageKey = (bookId: string) => `myvibereader_progress_${bookId}`;

function getInitialProgress(bookId: string): ProgressDto | null {
  if (!bookId) return null;
  try {
    const cached = localStorage.getItem(getLocalStorageKey(bookId));
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn('Failed to parse cached progress from localStorage:', e);
  }
  return null;
}

export function useProgress(bookId: string) {
  const [progress, setProgress] = useState<ProgressDto | null>(() => getInitialProgress(bookId));
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdateRef = useRef<ProgressDto | null>(null);

  const saveToLocalStorage = useCallback((p: ProgressDto) => {
    try {
      localStorage.setItem(getLocalStorageKey(p.bookId), JSON.stringify(p));
    } catch (e) {
      console.warn('Failed to save progress to localStorage:', e);
    }
  }, []);

  const flushPendingUpdate = useCallback(async (): Promise<void> => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const pending = pendingUpdateRef.current;
    if (pending) {
      pendingUpdateRef.current = null;
      saveToLocalStorage(pending);
      try {
        await api.updateProgress(
          pending.bookId,
          pending.positionJson,
          pending.deviceId,
          pending.updatedAt
        );
      } catch (err) {
        console.warn('Network sync failed on flush; queueing update.', err);
        syncService.enqueueProgressUpdate({
          bookId: pending.bookId,
          positionJson: pending.positionJson,
          deviceId: pending.deviceId || 'web-client',
          updatedAt: pending.updatedAt || new Date().toISOString(),
        });
      }
    }
  }, [saveToLocalStorage]);

  // Load progress from backend API initially and on window focus/polling
  useEffect(() => {
    let isMounted = true;
    if (!bookId) return;

    // Check if we already have local progress for instant initial paint
    const local = getInitialProgress(bookId);
    if (local && isMounted) {
      setProgress(local);
    }

    const fetchServerProgress = async (isInitial = false) => {
      if (!isMounted) return;
      if (isInitial) setLoading(true);

      try {
        const serverProgress = await api.getProgress(bookId);
        if (!isMounted) return;

        // Check if there is an un-synced offline update in the queue
        if (syncService.hasQueuedUpdate(bookId)) {
          const queued = syncService.getQueuedUpdate(bookId);
          if (queued) {
            const queuedProgress: ProgressDto = {
              bookId: queued.bookId,
              positionJson: queued.positionJson,
              deviceId: queued.deviceId,
              updatedAt: queued.updatedAt,
            };
            setProgress(queuedProgress);
            saveToLocalStorage(queuedProgress);
            api.updateProgress(bookId, queued.positionJson, queued.deviceId, queued.updatedAt).catch(() => {});
            return;
          }
        }

        const localCurrent = getInitialProgress(bookId);
        const localTime = localCurrent?.updatedAt ? new Date(localCurrent.updatedAt).getTime() : 0;
        const serverTime = serverProgress.updatedAt ? new Date(serverProgress.updatedAt).getTime() : 0;

        // Adopt server progress if initial load or server is newer
        if (isInitial || serverTime > localTime) {
          setProgress(serverProgress);
          saveToLocalStorage(serverProgress);
          setError(null);
        }
      } catch (err: any) {
        if (!isMounted) return;
        if (isInitial) {
          const fallback = getInitialProgress(bookId);
          setProgress(fallback);
          setError(err.message);
        }
      } finally {
        if (isMounted && isInitial) {
          setLoading(false);
        }
      }
    };

    fetchServerProgress(true);

    const handleFocusOrVisible = () => {
      if (!pendingUpdateRef.current && (typeof document === 'undefined' || document.visibilityState === 'visible')) {
        fetchServerProgress(false);
      }
    };

    const handleHideOrUnload = () => {
      flushPendingUpdate();
    };

    window.addEventListener('focus', handleFocusOrVisible);
    window.addEventListener('beforeunload', handleHideOrUnload);
    window.addEventListener('pagehide', handleHideOrUnload);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleHideOrUnload();
      } else if (document.visibilityState === 'visible') {
        handleFocusOrVisible();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleFocusOrVisible);
      window.removeEventListener('beforeunload', handleHideOrUnload);
      window.removeEventListener('pagehide', handleHideOrUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushPendingUpdate();
    };
  }, [bookId, flushPendingUpdate, saveToLocalStorage]);

  const updatePositionImmediate = useCallback(
    async (positionJson: string, deviceId = 'web-client') => {
      const now = new Date().toISOString();
      const newProgress: ProgressDto = {
        bookId,
        positionJson,
        deviceId,
        updatedAt: now,
      };

      setProgress(newProgress);
      saveToLocalStorage(newProgress);
      pendingUpdateRef.current = null;

      try {
        await api.updateProgress(bookId, positionJson, deviceId, now);
      } catch (err) {
        console.warn('Network sync failed; queueing update for reconnection flush.', err);
        syncService.enqueueProgressUpdate({
          bookId,
          positionJson,
          deviceId,
          updatedAt: now,
        });
      }
    },
    [bookId, saveToLocalStorage]
  );

  const updatePosition = useCallback(
    (positionJson: string, deviceId = 'web-client', debounceMs = 300) => {
      const now = new Date().toISOString();
      const newProgress: ProgressDto = {
        bookId,
        positionJson,
        deviceId,
        updatedAt: now,
      };

      // Update local React state and localStorage instantly for snappy UI & safety
      setProgress(newProgress);
      saveToLocalStorage(newProgress);
      pendingUpdateRef.current = newProgress;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        if (pendingUpdateRef.current === newProgress) {
          updatePositionImmediate(positionJson, deviceId);
        }
      }, debounceMs);
    },
    [bookId, saveToLocalStorage, updatePositionImmediate]
  );

  return { progress, loading, error, updatePosition, updatePositionImmediate, flushPendingUpdate };
}
