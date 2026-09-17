import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useProgress } from '../hooks/useProgress';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { syncService } from '../services/syncService';
import { api, BookDto } from '../services/api';
import { fileCacheService } from '../services/fileCacheService';
import { bookCacheService } from '../services/bookCacheService';
import { useAppStore } from '../store/appStore';
import { parseJwtPayload } from '../utils/jwt';
import { PdfViewer } from '../components/PdfViewer';
import { EpubViewer } from '../components/EpubViewer';
import {
  ArrowLeft,
  Wifi,
  WifiOff,
  BookOpen,
  RotateCw,
  AlertCircle,
} from 'lucide-react';

export default function ReaderPage() {
  const { bookId = '' } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const user = useAppStore((state) => state.user);
  const { progress, loading: progressLoading, updatePosition, flushPendingUpdate } = useProgress(bookId);

  const [bookBlob, setBookBlob] = useState<Blob | null>(null);
  const [downloading, setDownloading] = useState<boolean>(true);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadAttempt, setDownloadAttempt] = useState<number>(0);

  // Fetch book metadata with offline cache fallback
  const { data: books = [] } = useQuery<BookDto[]>({
    queryKey: ['books', user?.id],
    queryFn: async () => {
      try {
        const remoteBooks = await api.getBooks();
        if (user?.id) {
          bookCacheService.saveBooks(user.id, remoteBooks);
        }
        return remoteBooks;
      } catch (err) {
        if (user?.id) {
          const cached = bookCacheService.getBooks(user.id);
          if (cached && cached.length > 0) {
            return cached;
          }
        }
        throw err;
      }
    },
    initialData: () => (user?.id ? bookCacheService.getBooks(user.id) : []),
  });

  const currentBook = books.find((b) => b.id === bookId);

  // Capture initial reading position once when document/progress becomes ready
  const initialPositionRef = useRef<{ page: number; scrollY: number; cfi?: string } | null>(null);

  if (!progressLoading && initialPositionRef.current === null) {
    if (progress?.positionJson) {
      try {
        initialPositionRef.current = JSON.parse(progress.positionJson);
      } catch (e) {
        console.warn('Failed to parse positionJson', e);
        initialPositionRef.current = { page: 1, scrollY: 0 };
      }
    } else {
      initialPositionRef.current = { page: 1, scrollY: 0 };
    }
  }

  // Reset when bookId changes
  useEffect(() => {
    initialPositionRef.current = null;
  }, [bookId]);

  // Keep track of the current reading position for PDF updates
  const pdfPositionRef = useRef<{ page: number; scrollY: number }>({
    page: 1,
    scrollY: 0,
  });

  // Dynamically update position if a newer remote update arrives from another device
  useEffect(() => {
    if (!progressLoading && progress?.positionJson) {
      try {
        const parsed = JSON.parse(progress.positionJson);
        initialPositionRef.current = parsed;
        if (parsed.page) pdfPositionRef.current.page = parsed.page;
        if (parsed.scrollY !== undefined) pdfPositionRef.current.scrollY = parsed.scrollY;
      } catch (e) {
        console.warn('Failed to parse progress update', e);
      }
    }
  }, [progress, progressLoading]);

  // Download book binary from backend API or local IndexedDB cache
  useEffect(() => {
    let isMounted = true;
    if (!bookId) return;

    setDownloading(true);
    setDownloadError(null);

    fileCacheService.getBookFile(bookId).then((cachedBlob) => {
      if (cachedBlob && isMounted) {
        setBookBlob(cachedBlob);
        setDownloading(false);
        return;
      }

      api
        .downloadBook(bookId)
        .then((blob) => {
          if (isMounted) {
            setBookBlob(blob);
            setDownloading(false);
            fileCacheService.saveBookFile(bookId, blob);
          }
        })
        .catch((err) => {
          if (isMounted) {
            console.error('Failed to download book blob:', err);
            setDownloadError(err.message || 'Failed to download book content');
            setDownloading(false);
          }
        });
    });

    return () => {
      isMounted = false;
    };
  }, [bookId, downloadAttempt]);

  // Auto-retry download on network reconnection or window focus if previously failed
  useEffect(() => {
    if (downloadError) {
      const handleRetry = () => {
        setDownloadAttempt((prev) => prev + 1);
      };
      window.addEventListener('online', handleRetry);
      window.addEventListener('focus', handleRetry);
      return () => {
        window.removeEventListener('online', handleRetry);
        window.removeEventListener('focus', handleRetry);
      };
    }
  }, [downloadError]);


  // Flush offline sync queue and refresh session token whenever connection is restored
  useEffect(() => {
    if (isOnline) {
      const currentToken = useAppStore.getState().token;
      if (currentToken) {
        const payload = parseJwtPayload(currentToken);
        if (payload?.offline) {
          api
            .refreshToken()
            .then((res) => {
              useAppStore.getState().setAuth(res.token, res.user);
            })
            .catch((err) => {
              console.warn('Failed to refresh offline token on reconnect:', err);
            });
        }
      }
      syncService.flushQueue();
    }
  }, [isOnline]);

  const handlePdfPageChange = (page: number) => {
    pdfPositionRef.current.page = page;
    const positionJson = JSON.stringify({ page, scrollY: pdfPositionRef.current.scrollY });
    updatePosition(positionJson);
  };

  const handlePdfScroll = (scrollY: number) => {
    pdfPositionRef.current.scrollY = scrollY;
    const positionJson = JSON.stringify({ page: pdfPositionRef.current.page, scrollY });
    updatePosition(positionJson);
  };

  const handleEpubCfiChange = (cfi: string) => {
    if (!cfi) return;
    const positionJson = JSON.stringify({ cfi });
    updatePosition(positionJson);
  };

  const handleBackToLibrary = async () => {
    await flushPendingUpdate();
    navigate('/library');
  };

  const queueLength = syncService.getQueueLength();
  const format = currentBook?.format || (bookBlob?.type.includes('pdf') ? 'PDF' : 'EPUB');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Reader Navbar */}
      <header className="h-16 border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToLibrary}
            className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition cursor-pointer"
            title="Back to Library"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <h1 className="text-sm font-semibold text-slate-200 truncate max-w-xs sm:max-w-md">
              {currentBook?.title || `Book (${bookId.substring(0, 8)})`}
            </h1>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                format === 'PDF'
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}
            >
              {format}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Network Sync Status Badge */}
          {isOnline ? (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-full font-medium">
              <Wifi className="w-3.5 h-3.5" />
              <span>Online {queueLength > 0 && `(Syncing ${queueLength}...)`}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-full font-medium">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline (Queued {queueLength})</span>
            </span>
          )}
        </div>
      </header>

      {/* Main Viewport Container */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-900/30">
        {progressLoading || downloading ? (
          <div className="flex flex-col items-center space-y-3">
            <RotateCw className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-xs text-slate-400">Loading document content...</p>
          </div>
        ) : downloadError ? (
          <div className="p-8 text-center bg-slate-900/60 border border-slate-800 rounded-2xl max-w-md">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
            <p className="text-sm text-slate-300 mb-4">{downloadError}</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setDownloadAttempt((prev) => prev + 1)}
                className="py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl transition cursor-pointer flex items-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Retry
              </button>
              <button
                onClick={() => navigate('/library')}
                className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl transition cursor-pointer"
              >
                Return to Library
              </button>
            </div>
          </div>
        ) : bookBlob && format === 'PDF' ? (
          <PdfViewer
            blob={bookBlob}
            initialPage={initialPositionRef.current?.page ?? 1}
            initialScrollY={initialPositionRef.current?.scrollY ?? 0}
            onPageChange={handlePdfPageChange}
            onScroll={handlePdfScroll}
          />
        ) : bookBlob && format === 'EPUB' ? (
          <EpubViewer
            blob={bookBlob}
            initialCfi={initialPositionRef.current?.cfi}
            onLocationChange={handleEpubCfiChange}
          />
        ) : (
          <div className="p-8 text-center text-slate-400 text-sm">No book file available</div>
        )}
      </main>
    </div>
  );
}
