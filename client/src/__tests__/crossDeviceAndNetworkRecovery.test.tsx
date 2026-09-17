import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useProgress } from '../hooks/useProgress';
import { api, ProgressDto } from '../services/api';
import { syncService } from '../services/syncService';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReaderPage from '../pages/ReaderPage';
import { fileCacheService } from '../services/fileCacheService';

vi.mock('../components/PdfViewer', () => ({
  PdfViewer: vi.fn((props: any) => (
    <div data-testid="mock-pdf-viewer" data-initial-page={props.initialPage}>
      Mock PDF Viewer
    </div>
  )),
}));

vi.mock('../components/EpubViewer', () => ({
  EpubViewer: vi.fn((props: any) => (
    <div data-testid="mock-epub-viewer" data-initial-cfi={props.initialCfi}>
      Mock EPUB Viewer
    </div>
  )),
}));

describe('Cross-Device Progress Sync & Network Recovery (Regression Prevention)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    localStorage.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Sync Queue Poison Pill Removal', () => {
    it('discards 404 (Not Found) or 400 (Bad Request) errors from queue instead of retrying endlessly', async () => {
      const bookId = 'deleted-book';
      syncService.enqueueProgressUpdate({
        bookId,
        positionJson: JSON.stringify({ page: 5, scrollY: 0 }),
        deviceId: 'mobile-client',
        updatedAt: '2026-09-17T00:00:00.000Z',
      });

      expect(syncService.getQueueLength()).toBe(1);

      // Simulate server returning 404 Not Found (e.g. book was deleted)
      vi.spyOn(api, 'updateProgress').mockRejectedValue(new Error('HTTP 404 Book not found'));

      await syncService.flushQueue();

      // Poison pill 404 should be dropped
      expect(syncService.getQueueLength()).toBe(0);
    });

    it('retains queued items on network failure (Failed to fetch) for future retry', async () => {
      const bookId = 'active-book';
      syncService.enqueueProgressUpdate({
        bookId,
        positionJson: JSON.stringify({ page: 5, scrollY: 0 }),
        deviceId: 'mobile-client',
        updatedAt: '2026-09-17T00:00:00.000Z',
      });

      // Simulate network error
      vi.spyOn(api, 'updateProgress').mockRejectedValue(new TypeError('Failed to fetch'));

      await syncService.flushQueue();

      // Network error must remain in queue
      expect(syncService.getQueueLength()).toBe(1);
    });
  });

  describe('useProgress Focus & Visibility Cross-Device Synchronization', () => {
    it('refetches server progress on window focus and adopts newer progress from another device', async () => {
      const bookId = 'book-cross-device';
      const initialLocal: ProgressDto = {
        bookId,
        positionJson: JSON.stringify({ page: 5, scrollY: 0 }),
        deviceId: 'desktop-client',
        updatedAt: '2026-09-17T01:00:00.000Z',
      };
      localStorage.setItem(`myvibereader_progress_${bookId}`, JSON.stringify(initialLocal));

      const getProgressSpy = vi.spyOn(api, 'getProgress').mockResolvedValue(initialLocal);

      const { result } = renderHook(() => useProgress(bookId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(JSON.parse(result.current.progress!.positionJson).page).toBe(5);

      // User reads further on Android device -> server now has page 18 with newer timestamp
      const newerAndroidProgress: ProgressDto = {
        bookId,
        positionJson: JSON.stringify({ page: 18, scrollY: 200 }),
        deviceId: 'android-device',
        updatedAt: '2026-09-17T01:15:00.000Z',
      };
      getProgressSpy.mockResolvedValue(newerAndroidProgress);

      // User switches back to Mac -> window receives focus
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });

      await waitFor(() => {
        expect(JSON.parse(result.current.progress!.positionJson).page).toBe(18);
      });
    });

    it('flushes pending updates immediately when document becomes hidden (switching apps on Android)', async () => {
      const bookId = 'book-visibility-flush';
      vi.spyOn(api, 'getProgress').mockResolvedValue({
        bookId,
        positionJson: JSON.stringify({ page: 1, scrollY: 0 }),
      });
      const updateSpy = vi.spyOn(api, 'updateProgress').mockResolvedValue({
        bookId,
        positionJson: JSON.stringify({ page: 12, scrollY: 50 }),
      });

      const { result } = renderHook(() => useProgress(bookId));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // User advances position
      act(() => {
        result.current.updatePosition(JSON.stringify({ page: 12, scrollY: 50 }));
      });

      // User switches apps on Android -> document visibilitychange to hidden
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });

      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      // Update should have been flushed immediately without waiting for 300ms debounce
      expect(updateSpy).toHaveBeenCalledWith(
        bookId,
        JSON.stringify({ page: 12, scrollY: 50 }),
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe('Dynamic API Base URL Configuration', () => {
    it('allows reading and overriding the API base URL dynamically via localStorage', () => {
      expect(api.getBaseUrl()).toContain('8080');

      api.setBaseUrl('http://192.168.1.214:8080/api');
      expect(api.getBaseUrl()).toBe('http://192.168.1.214:8080/api');
      expect(localStorage.getItem('myvibereader_api_url')).toBe('http://192.168.1.214:8080/api');

      // Reset to default
      api.setBaseUrl('');
      expect(localStorage.getItem('myvibereader_api_url')).toBeNull();
    });
  });

  describe('ReaderPage Download Error Recovery', () => {
    it('renders a Retry button when book download fails and retries on click', async () => {
      const bookId = 'pdf-fail-retry';
      vi.spyOn(api, 'getBooks').mockResolvedValue([
        { id: bookId, title: 'Retry Test Book', format: 'PDF', uploadedAt: '2026-09-17' },
      ]);
      vi.spyOn(fileCacheService, 'getBookFile').mockResolvedValue(null);
      vi.spyOn(api, 'getProgress').mockResolvedValue({
        bookId,
        positionJson: JSON.stringify({ page: 1, scrollY: 0 }),
      });

      // First call fails with Failed to fetch
      const downloadSpy = vi
        .spyOn(api, 'downloadBook')
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(new Blob(['pdf content'], { type: 'application/pdf' }));

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/reader/${bookId}`]}>
            <Routes>
              <Route path="/reader/:bookId" element={<ReaderPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Verify error is displayed
      await waitFor(() => {
        expect(screen.getByText(/Failed to fetch/i)).toBeDefined();
      });

      // Verify Retry button is present
      const retryBtn = screen.getByRole('button', { name: /retry/i });
      expect(retryBtn).toBeDefined();

      // Click Retry
      await act(async () => {
        retryBtn.click();
      });

      // Successfully recovers and renders viewer
      await waitFor(() => {
        expect(screen.getByTestId('mock-pdf-viewer')).toBeDefined();
      });

      expect(downloadSpy).toHaveBeenCalledTimes(2);
    });
  });
});
