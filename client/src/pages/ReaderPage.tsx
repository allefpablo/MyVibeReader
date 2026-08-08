import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProgress } from '../hooks/useProgress';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { syncService } from '../services/syncService';
import {
  ArrowLeft,
  Wifi,
  WifiOff,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  RotateCw,
} from 'lucide-react';

export default function ReaderPage() {
  const { bookId = '' } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const { progress, loading, updatePosition } = useProgress(bookId);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages] = useState<number>(100);

  // Parse page number from positionJson when progress loads
  useEffect(() => {
    if (progress?.positionJson) {
      try {
        const parsed = JSON.parse(progress.positionJson);
        if (parsed.page) {
          setCurrentPage(parsed.page);
        }
      } catch (e) {
        console.warn('Failed to parse positionJson', e);
      }
    }
  }, [progress]);

  // Flush offline sync queue whenever connection is restored
  useEffect(() => {
    if (isOnline) {
      syncService.flushQueue();
    }
  }, [isOnline]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    const positionJson = JSON.stringify({ page: newPage, scrollY: 0 });
    updatePosition(positionJson);
  };

  const queueLength = syncService.getQueueLength();

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
              Reading Book ({bookId.substring(0, 8)})
            </h1>
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
      <main className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-900/30">
        {loading ? (
          <div className="flex flex-col items-center space-y-3">
            <RotateCw className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-xs text-slate-400">Loading reading position...</p>
          </div>
        ) : (
          <div className="w-full max-w-3xl bg-slate-900/90 border border-slate-800 rounded-2xl p-8 sm:p-12 shadow-2xl min-h-[500px] flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-800/80 pb-4">
              <span>Chapter 1: Introduction</span>
              <span>
                Page {currentPage} of {totalPages}
              </span>
            </div>

            <div className="my-8 text-slate-300 space-y-4 leading-relaxed text-sm sm:text-base">
              <p>
                Welcome to <strong className="text-indigo-300">MyVibeReader</strong>. This page simulates the eBook rendering viewport for page {currentPage}.
              </p>
              <p>
                As you navigate pages or scroll, your exact reading position is automatically tracked and synchronized across all your logged-in desktop and mobile devices.
              </p>
              <p className="text-xs text-slate-500 italic">
                Position JSON stored: {progress?.positionJson || `{"page": ${currentPage}}`}
              </p>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-slate-800/80">
              <button
                disabled={currentPage <= 1}
                onClick={() => handlePageChange(currentPage - 1)}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>

              <span className="text-xs text-slate-400 font-medium">
                {Math.round((currentPage / totalPages) * 100)}% completed
              </span>

              <button
                disabled={currentPage >= totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
                className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-indigo-600/20"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
