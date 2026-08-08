import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useProgress } from '../hooks/useProgress';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { syncService } from '../services/syncService';
import { api, BookDto } from '../services/api';
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
  const { progress, loading: progressLoading, updatePosition } = useProgress(bookId);

  const [bookBlob, setBookBlob] = useState<Blob | null>(null);
  const [downloading, setDownloading] = useState<boolean>(true);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [initialPage, setInitialPage] = useState<number>(1);
  const [initialCfi, setInitialCfi] = useState<string | undefined>(undefined);

  // Fetch book metadata
  const { data: books = [] } = useQuery<BookDto[]>({
    queryKey: ['books'],
    queryFn: api.getBooks,
  });

  const currentBook = books.find((b) => b.id === bookId);

  // Parse reading position when progress loads
  useEffect(() => {
    if (progress?.positionJson) {
      try {
        const parsed = JSON.parse(progress.positionJson);
        if (parsed.page) setInitialPage(parsed.page);
        if (parsed.cfi) setInitialCfi(parsed.cfi);
      } catch (e) {
        console.warn('Failed to parse positionJson', e);
      }
    }
  }, [progress]);

  // Download book binary from backend API
  useEffect(() => {
    let isMounted = true;
    if (!bookId) return;

    setDownloading(true);
    setDownloadError(null);

    api
      .downloadBook(bookId)
      .then((blob) => {
        if (isMounted) {
          setBookBlob(blob);
          setDownloading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to download book blob:', err);
          setDownloadError(err.message || 'Failed to download book content');
          setDownloading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [bookId]);

  // Flush offline sync queue whenever connection is restored
  useEffect(() => {
    if (isOnline) {
      syncService.flushQueue();
    }
  }, [isOnline]);

  const handlePdfPageChange = (page: number) => {
    const positionJson = JSON.stringify({ page, scrollY: 0 });
    updatePosition(positionJson);
  };

  const handleEpubCfiChange = (cfi: string) => {
    const positionJson = JSON.stringify({ cfi });
    updatePosition(positionJson);
  };

  const queueLength = syncService.getQueueLength();
  const format = currentBook?.format || (bookBlob?.type.includes('pdf') ? 'PDF' : 'EPUB');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Reader Navbar */}
      <header className="h-16 border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/library')}
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
            <button
              onClick={() => navigate('/library')}
              className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl"
            >
              Return to Library
            </button>
          </div>
        ) : bookBlob && format === 'PDF' ? (
          <PdfViewer
            blob={bookBlob}
            initialPage={initialPage}
            onPageChange={handlePdfPageChange}
          />
        ) : bookBlob && format === 'EPUB' ? (
          <EpubViewer
            blob={bookBlob}
            initialCfi={initialCfi}
            onLocationChange={handleEpubCfiChange}
          />
        ) : (
          <div className="p-8 text-center text-slate-400 text-sm">No book file available</div>
        )}
      </main>
    </div>
  );
}
