import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface PdfViewerProps {
  blob: Blob;
  initialPage?: number;
  onPageChange?: (page: number, totalPages: number) => void;
}

export function PdfViewer({ blob, initialPage = 1, onPageChange }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [loading, setLoading] = useState<boolean>(true);
  const [rendering, setRendering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load PDF Document from Blob
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);

    blob
      .arrayBuffer()
      .then((arrayBuffer) => {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        return loadingTask.promise;
      })
      .then((doc) => {
        if (isCancelled) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);

        const targetPage = Math.min(Math.max(1, initialPage), doc.numPages);
        setCurrentPage(targetPage);
        if (onPageChange) {
          onPageChange(targetPage, doc.numPages);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error('Error loading PDF document:', err);
        setError('Failed to render PDF file.');
        setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [blob]);

  // Render current page to Canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let isCancelled = false;
    setRendering(true);

    pdfDoc
      .getPage(currentPage)
      .then((page) => {
        if (isCancelled || !canvasRef.current) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (!context) return;

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          transform: transform,
          canvas: canvas,
        };

        return page.render(renderContext).promise;
      })
      .then(() => {
        if (!isCancelled) setRendering(false);
      })
      .catch((err) => {
        if (!isCancelled) {
          console.warn('PDF page render error:', err);
          setRendering(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, currentPage, scale]);

  const changePage = (delta: number) => {
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      if (onPageChange) {
        onPageChange(newPage, totalPages);
      }
    }
  };

  const handleZoom = (delta: number) => {
    setScale((prev) => Math.min(Math.max(0.6, prev + delta), 2.5));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3">
        <RotateCw className="w-8 h-8 text-indigo-400 animate-spin" />
        <p className="text-xs text-slate-400">Loading PDF document...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-rose-400 text-sm bg-rose-500/10 rounded-2xl border border-rose-500/30">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto space-y-4">
      {/* Controls Bar */}
      <div className="flex items-center justify-between w-full bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <button
            disabled={currentPage <= 1}
            onClick={() => changePage(-1)}
            className="p-1.5 hover:bg-slate-800 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="font-medium">
            Page {currentPage} of {totalPages}
          </span>

          <button
            disabled={currentPage >= totalPages}
            onClick={() => changePage(1)}
            className="p-1.5 hover:bg-slate-800 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleZoom(-0.15)}
            className="p-1.5 hover:bg-slate-800 rounded-lg transition cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="font-mono text-[11px] text-slate-400">{Math.round(scale * 100)}%</span>

          <button
            onClick={() => handleZoom(0.15)}
            className="p-1.5 hover:bg-slate-800 rounded-lg transition cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Canvas Rendering Container */}
      <div
        ref={containerRef}
        className="w-full flex justify-center bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 overflow-auto min-h-[500px] shadow-2xl relative"
      >
        {rendering && (
          <div className="absolute top-4 right-4 bg-slate-900/80 px-2 py-1 rounded text-[10px] text-indigo-300 border border-indigo-500/20 flex items-center gap-1">
            <RotateCw className="w-3 h-3 animate-spin" /> Rendering...
          </div>
        )}
        <canvas ref={canvasRef} className="shadow-lg rounded bg-white" />
      </div>
    </div>
  );
}
