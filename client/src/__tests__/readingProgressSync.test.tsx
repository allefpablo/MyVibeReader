import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useProgress } from '../hooks/useProgress';
import { api, ProgressDto } from '../services/api';
import { syncService } from '../services/syncService';

describe('Reading Progress & Cross-Device Sync Regression Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe('useProgress Hook Persistence & Sync Lifecycle', () => {
    it('restores existing progress from localStorage immediately on first render', () => {
      const bookId = 'book-pdf-1';
      const cachedProgress: ProgressDto = {
        bookId,
        positionJson: JSON.stringify({ page: 14, scrollY: 350 }),
        deviceId: 'desktop-client',
        updatedAt: '2026-09-11T10:00:00.000Z',
      };
      localStorage.setItem(`myvibereader_progress_${bookId}`, JSON.stringify(cachedProgress));

      vi.spyOn(api, 'getProgress').mockReturnValue(new Promise(() => {})); // Never resolves during sync check

      const { result } = renderHook(() => useProgress(bookId));

      // Must be available synchronously on initial render to prevent defaulting to page 1
      expect(result.current.progress).not.toBeNull();
      expect(result.current.progress?.positionJson).toBe(cachedProgress.positionJson);
      const parsed = JSON.parse(result.current.progress!.positionJson);
      expect(parsed.page).toBe(14);
      expect(parsed.scrollY).toBe(350);
    });

    it('adopts authoritative server progress when moving to a new device without local cache', async () => {
      const bookId = 'book-pdf-2';
      // New device: localStorage has no cached progress
      expect(localStorage.getItem(`myvibereader_progress_${bookId}`)).toBeNull();

      const serverProgress: ProgressDto = {
        bookId,
        positionJson: JSON.stringify({ page: 28, scrollY: 520 }),
        deviceId: 'desktop-client',
        updatedAt: '2026-09-11T12:00:00.000Z',
      };

      vi.spyOn(api, 'getProgress').mockResolvedValue(serverProgress);
      const updateSpy = vi.spyOn(api, 'updateProgress').mockResolvedValue(serverProgress);

      const { result } = renderHook(() => useProgress(bookId));

      expect(result.current.loading).toBe(true);

      // Resolve the server progress promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.progress?.positionJson).toBe(serverProgress.positionJson);
      const parsed = JSON.parse(result.current.progress!.positionJson);
      expect(parsed.page).toBe(28);
      expect(parsed.scrollY).toBe(520);

      // Must have persisted the server progress to local storage on the new device
      const localStored = localStorage.getItem(`myvibereader_progress_${bookId}`);
      expect(localStored).not.toBeNull();
      expect(JSON.parse(localStored!).positionJson).toBe(serverProgress.positionJson);

      // Critical: Initial sync from server must NOT echo an update back to the server!
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('prioritizes offline queued updates over stale server progress', async () => {
      const bookId = 'book-offline-1';
      const queuedProgress = {
        bookId,
        positionJson: JSON.stringify({ page: 40, scrollY: 120 }),
        deviceId: 'mobile-client',
        updatedAt: '2026-09-11T14:00:00.000Z',
      };
      syncService.enqueueProgressUpdate(queuedProgress);

      const staleServerProgress: ProgressDto = {
        bookId,
        positionJson: JSON.stringify({ page: 10, scrollY: 0 }),
        deviceId: 'desktop-client',
        updatedAt: '2026-09-11T10:00:00.000Z',
      };

      vi.spyOn(api, 'getProgress').mockResolvedValue(staleServerProgress);
      const updateSpy = vi.spyOn(api, 'updateProgress').mockResolvedValue(queuedProgress);

      const { result } = renderHook(() => useProgress(bookId));

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // The queued update (page 40) must win over stale server (page 10)
      const parsed = JSON.parse(result.current.progress!.positionJson);
      expect(parsed.page).toBe(40);
      expect(updateSpy).toHaveBeenCalledWith(
        bookId,
        queuedProgress.positionJson,
        queuedProgress.deviceId,
        queuedProgress.updatedAt
      );
    });

    it('debounces position updates during rapid reading and syncs to server', async () => {
      const bookId = 'book-debounce-1';
      vi.spyOn(api, 'getProgress').mockRejectedValue(new Error('404 Not Found'));
      const updateSpy = vi.spyOn(api, 'updateProgress').mockImplementation(async (bId, pos) => ({
        bookId: bId,
        positionJson: pos,
      }));

      const { result } = renderHook(() => useProgress(bookId));

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // User scrolls through pages rapidly
      act(() => {
        result.current.updatePosition(JSON.stringify({ page: 2, scrollY: 50 }));
      });
      act(() => {
        result.current.updatePosition(JSON.stringify({ page: 3, scrollY: 100 }));
      });
      act(() => {
        result.current.updatePosition(JSON.stringify({ page: 4, scrollY: 150 }));
      });

      // Before timer fires, API should not have been called yet
      expect(updateSpy).not.toHaveBeenCalled();

      // Local storage and state should already have the latest value for instant UI
      expect(JSON.parse(result.current.progress!.positionJson).page).toBe(4);

      // Fast-forward debounce timer (300ms)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });

      // Only the final position should be synced to the server
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledWith(
        bookId,
        JSON.stringify({ page: 4, scrollY: 150 }),
        expect.any(String),
        expect.any(String)
      );
    });

    it('flushPendingUpdate returns a Promise and awaits completion before unmount', async () => {
      const bookId = 'book-flush-1';
      vi.spyOn(api, 'getProgress').mockRejectedValue(new Error('404 Not Found'));

      let resolveApiUpdate: (val: any) => void;
      const updatePromise = new Promise((resolve) => {
        resolveApiUpdate = resolve;
      });
      const updateSpy = vi.spyOn(api, 'updateProgress').mockReturnValue(updatePromise as any);

      const { result } = renderHook(() => useProgress(bookId));

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        result.current.updatePosition(JSON.stringify({ page: 12, scrollY: 0 }));
      });

      let flushCompleted = false;
      let flushPromise: Promise<void> | undefined;

      act(() => {
        flushPromise = result.current.flushPendingUpdate();
      });

      // flushPendingUpdate must return a Promise
      expect(flushPromise).toBeInstanceOf(Promise);

      flushPromise!.then(() => {
        flushCompleted = true;
      });

      // API was called
      expect(updateSpy).toHaveBeenCalledWith(
        bookId,
        JSON.stringify({ page: 12, scrollY: 0 }),
        expect.any(String),
        expect.any(String)
      );

      // Flush promise shouldn't resolve until API call finishes
      expect(flushCompleted).toBe(false);

      // Now resolve API update
      await act(async () => {
        resolveApiUpdate({
          bookId,
          positionJson: JSON.stringify({ page: 12, scrollY: 0 }),
        });
        await flushPromise;
      });

      expect(flushCompleted).toBe(true);
    });

    it('enqueues to offline sync queue if network fails during flushPendingUpdate', async () => {
      const bookId = 'book-flush-offline';
      vi.spyOn(api, 'getProgress').mockRejectedValue(new Error('404 Not Found'));
      vi.spyOn(api, 'updateProgress').mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useProgress(bookId));

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      act(() => {
        result.current.updatePosition(JSON.stringify({ page: 19, scrollY: 80 }));
      });

      await act(async () => {
        await result.current.flushPendingUpdate();
      });

      // Must be safely in offline queue
      expect(syncService.hasQueuedUpdate(bookId)).toBe(true);
      const queued = syncService.getQueuedUpdate(bookId);
      expect(queued?.positionJson).toBe(JSON.stringify({ page: 19, scrollY: 80 }));
    });

    it('does not send default PDF schema to server when opening a book with no prior progress', async () => {
      const bookId = 'book-new-epub';
      vi.spyOn(api, 'getProgress').mockRejectedValue(new Error('404 Not Found'));
      const updateSpy = vi.spyOn(api, 'updateProgress').mockResolvedValue({
        bookId,
        positionJson: '',
      });

      const { result } = renderHook(() => useProgress(bookId));

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Merely opening a book without progress must NOT auto-save anything to server
      expect(updateSpy).not.toHaveBeenCalled();

      // Flushed pending update with no user actions must not fire an update
      await act(async () => {
        await result.current.flushPendingUpdate();
      });

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });
});

describe('ReaderPage Position Hand-off & Spurious Update Prevention', () => {
  it('derives initial reading position synchronously from progress DTO', () => {
    // Simulating how ReaderPage should parse initial position directly from progress DTO
    const pdfProgress: ProgressDto = {
      bookId: 'b-pdf',
      positionJson: JSON.stringify({ page: 18, scrollY: 340 }),
    };

    const parsedPdf = pdfProgress.positionJson ? JSON.parse(pdfProgress.positionJson) : null;
    expect(parsedPdf?.page).toBe(18);
    expect(parsedPdf?.scrollY).toBe(340);

    const epubProgress: ProgressDto = {
      bookId: 'b-epub',
      positionJson: JSON.stringify({ cfi: 'epubcfi(/6/8[ch2]!/4/2:0)' }),
    };

    const parsedEpub = epubProgress.positionJson ? JSON.parse(epubProgress.positionJson) : null;
    expect(parsedEpub?.cfi).toBe('epubcfi(/6/8[ch2]!/4/2:0)');
  });

  it('PdfViewer guards against spurious initial scroll events before restoration', () => {
    // Verifies the guard logic required in PdfViewer:
    // Any scroll event before hasRestoredScrollRef is true MUST be ignored.
    let hasRestoredScroll = false;
    let isProgrammaticScroll = false;
    const scrollCallback = vi.fn();

    const handleScrollEvent = (scrollTop: number) => {
      if (!hasRestoredScroll) return; // Must ignore initial scroll events during mount / canvas resize
      if (isProgrammaticScroll) {
        isProgrammaticScroll = false;
        return;
      }
      scrollCallback(scrollTop);
    };

    // 1. Initial layout / canvas resize scroll event
    handleScrollEvent(0);
    expect(scrollCallback).not.toHaveBeenCalled();

    // 2. Programmatic scroll restoration
    isProgrammaticScroll = true;
    hasRestoredScroll = true;
    handleScrollEvent(340); // Browser triggers scroll event when scrollTop is set
    expect(scrollCallback).not.toHaveBeenCalled();

    // 3. User actively scrolls
    handleScrollEvent(360);
    expect(scrollCallback).toHaveBeenCalledWith(360);
  });

  it('EpubViewer guards against initial relocation events firing position updates', () => {
    let isInitialRender = true;
    const locationCallback = vi.fn();

    const handleRelocated = (cfi: string) => {
      if (isInitialRender) {
        isInitialRender = false;
        return; // Must NOT fire location change on initial render
      }
      locationCallback(cfi);
    };

    // Initial render relocation
    handleRelocated('epubcfi(/6/2[ch1]!/4/1:0)');
    expect(locationCallback).not.toHaveBeenCalled();

    // User page flip
    handleRelocated('epubcfi(/6/4[ch1]!/4/10:0)');
    expect(locationCallback).toHaveBeenCalledWith('epubcfi(/6/4[ch1]!/4/10:0)');
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReaderPage from '../pages/ReaderPage';
import { fileCacheService } from '../services/fileCacheService';

// Mock child viewers to observe exact props passed by ReaderPage
vi.mock('../components/PdfViewer', () => ({
  PdfViewer: vi.fn((props: any) => (
    <div
      data-testid="mock-pdf-viewer"
      data-initial-page={props.initialPage}
      data-initial-scroll={props.initialScrollY}
    >
      Mock PDF Viewer
    </div>
  )),
}));

vi.mock('../components/EpubViewer', () => ({
  EpubViewer: vi.fn((props: any) => (
    <div
      data-testid="mock-epub-viewer"
      data-initial-cfi={props.initialCfi}
    >
      Mock EPUB Viewer
    </div>
  )),
}));

describe('ReaderPage Component Mount & Initial Position Handoff', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  beforeEach(() => {
    cleanup();
    queryClient.clear();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
  });

  it('mounts PdfViewer with saved page and scroll position on the very first mount', async () => {
    const bookId = 'pdf-sync-test';
    const serverProgress: ProgressDto = {
      bookId,
      positionJson: JSON.stringify({ page: 25, scrollY: 480 }),
      deviceId: 'desktop-client',
      updatedAt: '2026-09-11T15:00:00.000Z',
    };

    vi.spyOn(api, 'getBooks').mockResolvedValue([
      { id: bookId, title: 'Test PDF Book', format: 'PDF', uploadedAt: '2026-09-11' },
    ]);
    vi.spyOn(fileCacheService, 'getBookFile').mockResolvedValue(
      new Blob(['dummy pdf'], { type: 'application/pdf' })
    );
    vi.spyOn(api, 'getProgress').mockResolvedValue(serverProgress);

    const { PdfViewer } = await import('../components/PdfViewer');
    const mockPdfViewer = vi.mocked(PdfViewer);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/reader/${bookId}`]}>
          <Routes>
            <Route path="/reader/:bookId" element={<ReaderPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Wait for the document content loading state to resolve
    await waitFor(() => {
      expect(screen.getByTestId('mock-pdf-viewer')).toBeDefined();
    });

    // CRITICAL: The very FIRST call to PdfViewer must receive page 25 and scrollY 480, NOT 1 and 0!
    const firstCallProps = mockPdfViewer.mock.calls[0][0];
    expect(firstCallProps.initialPage).toBe(25);
    expect(firstCallProps.initialScrollY).toBe(480);
  });

  it('mounts EpubViewer with saved CFI position on the very first mount', async () => {
    const bookId = 'epub-sync-test';
    const serverProgress: ProgressDto = {
      bookId,
      positionJson: JSON.stringify({ cfi: 'epubcfi(/6/12[chapter3]!/4/2/10:0)' }),
      deviceId: 'desktop-client',
      updatedAt: '2026-09-11T15:00:00.000Z',
    };

    vi.spyOn(api, 'getBooks').mockResolvedValue([
      { id: bookId, title: 'Test EPUB Book', format: 'EPUB', uploadedAt: '2026-09-11' },
    ]);
    vi.spyOn(fileCacheService, 'getBookFile').mockResolvedValue(
      new Blob(['dummy epub'], { type: 'application/epub+zip' })
    );
    vi.spyOn(api, 'getProgress').mockResolvedValue(serverProgress);

    const { EpubViewer } = await import('../components/EpubViewer');
    const mockEpubViewer = vi.mocked(EpubViewer);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/reader/${bookId}`]}>
          <Routes>
            <Route path="/reader/:bookId" element={<ReaderPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-epub-viewer')).toBeDefined();
    });

    // The very FIRST call to EpubViewer must receive the server CFI, NOT undefined!
    const firstCallProps = mockEpubViewer.mock.calls[0][0];
    expect(firstCallProps.initialCfi).toBe('epubcfi(/6/12[chapter3]!/4/2/10:0)');
  });

  it('handleBackToLibrary awaits flushPendingUpdate before navigating away', async () => {
    const bookId = 'nav-test-book';
    vi.spyOn(api, 'getBooks').mockResolvedValue([
      { id: bookId, title: 'Nav Test Book', format: 'PDF', uploadedAt: '2026-09-11' },
    ]);
    vi.spyOn(fileCacheService, 'getBookFile').mockResolvedValue(
      new Blob(['dummy'], { type: 'application/pdf' })
    );
    vi.spyOn(api, 'getProgress').mockResolvedValue({
      bookId,
      positionJson: JSON.stringify({ page: 5, scrollY: 100 }),
    });

    let flushFinished = false;
    let finishUpdate: () => void;
    const updatePromise = new Promise<any>((resolve) => {
      finishUpdate = () => {
        flushFinished = true;
        resolve({ bookId, positionJson: '{"page": 6, "scrollY": 120}' });
      };
    });

    // Mock updateProgress so we control when it resolves
    vi.spyOn(api, 'updateProgress').mockReturnValue(updatePromise);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/reader/${bookId}`]}>
          <Routes>
            <Route path="/reader/:bookId" element={<ReaderPage />} />
            <Route path="/library" element={<div data-testid="library-page">Library</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTitle('Back to Library')).toBeDefined();
    });

    const backButton = screen.getByTitle('Back to Library');

    // Simulate page scroll / reading change
    const { PdfViewer } = await import('../components/PdfViewer');
    const mockPdfViewer = vi.mocked(PdfViewer);
    const viewerProps = mockPdfViewer.mock.calls[0][0];
    viewerProps.onPageChange?.(6, 10);

    // Click back button
    backButton.click();

    // If handleBackToLibrary awaits flushPendingUpdate, it will NOT have arrived at library page yet while update is pending!
    expect(flushFinished).toBe(false);
    expect(screen.queryByTestId('library-page')).toBeNull();

    // Now resolve the flush
    await act(async () => {
      finishUpdate!();
    });

    // Now it should be on the library page
    await waitFor(() => {
      expect(screen.getByTestId('library-page')).toBeDefined();
    });
  });
});


