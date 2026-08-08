import { useState, useEffect, useCallback, useRef } from 'react';
import { api, ProgressDto } from '../services/api';
import { syncService } from '../services/syncService';

export function useProgress(bookId: string) {
  const [progress, setProgress] = useState<ProgressDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load progress initially
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    api
      .getProgress(bookId)
      .then((data) => {
        if (isMounted) {
          setProgress(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          // If not found yet, default to start position
          setProgress({ bookId, positionJson: '{"page": 1, "scrollY": 0}' });
          setError(err.message);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [bookId]);

  const updatePositionImmediate = useCallback(
    async (positionJson: string, deviceId = 'web-client') => {
      const now = new Date().toISOString();
      const newProgress: ProgressDto = {
        bookId,
        positionJson,
        deviceId,
        updatedAt: now,
      };

      // Optimistic local update
      setProgress(newProgress);

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
    [bookId]
  );

  const updatePosition = useCallback(
    (positionJson: string, deviceId = 'web-client', debounceMs = 500) => {
      const now = new Date().toISOString();
      // Update local React state immediately for snappy UI
      setProgress({
        bookId,
        positionJson,
        deviceId,
        updatedAt: now,
      });

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        updatePositionImmediate(positionJson, deviceId);
      }, debounceMs);
    },
    [bookId, updatePositionImmediate]
  );

  return { progress, loading, error, updatePosition, updatePositionImmediate };
}
