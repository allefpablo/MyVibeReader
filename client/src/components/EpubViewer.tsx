import { useEffect, useRef, useState } from 'react';
import ePub, { Book, Rendition } from 'epubjs';
import { ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';

interface EpubViewerProps {
  blob: Blob;
  initialCfi?: string;
  onLocationChange?: (cfi: string) => void;
}

export function EpubViewer({ blob, initialCfi, onLocationChange }: EpubViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<string>('');

  const isInitialRenderRef = useRef<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    isInitialRenderRef.current = true;

    blob
      .arrayBuffer()
      .then((arrayBuffer) => {
        if (!isMounted || !containerRef.current) return;

        if (renditionRef.current) {
          renditionRef.current.destroy();
        }

        const book = ePub(arrayBuffer);
        bookRef.current = book;

        const rendition = book.renderTo(containerRef.current, {
          width: '100%',
          height: '100%',
          spread: 'auto',
        });

        // Enforce crisp white background and clear readable dark text for EPUB content
        rendition.themes.default({
          body: {
            'background': '#ffffff !important',
            'color': '#111827 !important',
            'padding': '16px !important',
          },
          'p, span, div, h1, h2, h3, h4, h5, h6, li, a': {
            'color': '#111827 !important',
          },
        });

        renditionRef.current = rendition;

        const displayPromise = initialCfi
          ? rendition.display(initialCfi).catch(() => rendition.display())
          : rendition.display();

        displayPromise
          .then(() => {
            if (isMounted) setLoading(false);
          })
          .catch((err) => {
            if (!isMounted) return;
            console.error('Failed to display EPUB rendition:', err);
            setError('Failed to render EPUB file.');
            setLoading(false);
          });

        rendition.on('relocated', (location: any) => {
          if (!isMounted) return;
          const cfi = location?.start?.cfi;
          if (cfi) {
            setCurrentLocation(cfi);
            if (isInitialRenderRef.current) {
              isInitialRenderRef.current = false;
              return;
            }
            if (onLocationChange) {
              onLocationChange(cfi);
            }
          }
        });
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Error loading EPUB book:', err);
        setError('Failed to render EPUB file.');
        setLoading(false);
      });

    return () => {
      isMounted = false;
      if (renditionRef.current) {
        renditionRef.current.destroy();
      }
    };
  }, [blob]);

  useEffect(() => {
    if (renditionRef.current && initialCfi && initialCfi !== currentLocation) {
      isInitialRenderRef.current = true;
      renditionRef.current.display(initialCfi).catch(() => {});
    }
  }, [initialCfi]);

  const handleNext = () => {
    if (renditionRef.current) {
      renditionRef.current.next();
    }
  };

  const handlePrev = () => {
    if (renditionRef.current) {
      renditionRef.current.prev();
    }
  };

  if (error) {
    return (
      <div className="p-8 text-center text-rose-400 text-sm bg-rose-500/10 rounded-2xl border border-rose-500/30">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto space-y-4">
      {/* Navigation Controls */}
      <div className="flex items-center justify-between w-full bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-300">
        <button
          onClick={handlePrev}
          className="p-1.5 hover:bg-slate-800 rounded-lg flex items-center gap-1 transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>

        <span className="font-mono text-[10px] text-slate-400 truncate max-w-xs sm:max-w-md">
          {currentLocation ? `CFI: ${currentLocation}` : 'Reading EPUB'}
        </span>

        <button
          onClick={handleNext}
          className="p-1.5 hover:bg-slate-800 rounded-lg flex items-center gap-1 transition cursor-pointer"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* EPUB Rendition Container */}
      <div className="w-full relative bg-slate-900 border border-slate-800/80 rounded-2xl p-4 sm:p-6 h-[600px] shadow-2xl overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 z-10 space-y-3">
            <RotateCw className="w-8 h-8 text-emerald-400 animate-spin" />
            <p className="text-xs text-slate-400">Loading EPUB book content...</p>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full bg-white text-slate-900 rounded-xl overflow-hidden shadow-inner" />
      </div>
    </div>
  );
}
