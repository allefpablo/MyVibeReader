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

  const flushPendingUpdate = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const pending = pendingUpdateRef.current;
    if (pending) {
      pendingUpdateRef.current = null;
      saveToLocalStorage(pending);
      api.updateProgress(pending.bookId, pending.positionJson, pending.deviceId).catch((err) => {
        console.warn('Network sync failed on flush; queueing update.', err);
        syncService.enqueueProgressUpdate({
          bookId: pending.bookId,
          positionJson: pending.positionJson,
          deviceId: pending.deviceId || 'web-client',
          updatedAt: pending.updatedAt || new Date().toISOString(),
        });
      });
    }
  }, [saveToLocalStorage]);

  // Load progress from backend API initially
  useEffect(() => {
    let isMounted = true;
    if (!bookId) return;

    // Check if we already have local progress
    const local = getInitialProgress(bookId);
    if (local && isMounted) {
      setProgress(local);
    }

    setLoading(true);

    api
      .getProgress(bookId)
      .then((serverProgress) => {
        if (!isMounted) return;

        // Compare timestamps if local exists
        const localProg = getInitialProgress(bookId);
        if (localProg?.updatedAt && serverProgress?.updatedAt) {
          const localTime = new Date(localProg.updatedAt).getTime();
          const serverTime = new Date(serverProgress.updatedAt).getTime();
          if (localTime > serverTime) {
            // Local is newer (e.g. created offline), keep local and sync to server
            setProgress(localProg);
            api.updateProgress(bookId, localProg.positionJson, localProg.deviceId).catch(() => {});
            setLoading(false);
            return;
          }
        }

        setProgress(serverProgress);
        saveToLocalStorage(serverProgress);
        setError(null);
      })
      .catch((err) => {
        if (!isMounted) return;
        // If not found on server, fallback to local or default start position
        const fallback = getInitialProgress(bookId) || {
          bookId,
          positionJson: '{"page": 1, "scrollY": 0}',
        };
        setProgress(fallback);
        setError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    const handleBeforeUnload = () => {
      flushPendingUpdate();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isMounted = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);
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
        await api.updateProgress(bookId, positionJson, deviceId);
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
