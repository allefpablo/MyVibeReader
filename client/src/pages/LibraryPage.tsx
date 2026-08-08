import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { api, BookDto } from '../services/api';
import {
  BookOpen,
  UploadCloud,
  LogOut,
  FileText,
  Book,
  Download,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Search,
} from 'lucide-react';

export default function LibraryPage() {
  const user = useAppStore((state) => state.user);
  const logout = useAppStore((state) => state.logout);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Books
  const { data: books = [], isLoading, isError, error } = useQuery<BookDto[]>({
    queryKey: ['books'],
    queryFn: api.getBooks,
  });

  // Upload Mutation
  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadBook(file),
    onSuccess: () => {
      setUploadError(null);
      queryClient.invalidateQueries({ queryKey: ['books'] });
    },
    onError: (err: Error) => {
      setUploadError(err.message || 'Failed to upload book');
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteBook(id),
    onSuccess: () => {
      setDeletingId(null);
      queryClient.invalidateQueries({ queryKey: ['books'] });
    },
  });

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    const validTypes = ['application/pdf', 'application/epub+zip'];
    const validExtensions = ['.pdf', '.epub'];
    const hasValidExt = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (!validTypes.includes(file.type) && !hasValidExt) {
      setUploadError('Invalid file format. Only PDF and EPUB files are supported.');
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setUploadError('File size exceeds the 100MB limit.');
      return;
    }

    setUploadError(null);
    uploadMutation.mutate(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDownload = async (book: BookDto) => {
    try {
      const blob = await api.downloadBook(book.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = book.format.toLowerCase();
      a.download = `${book.title}.${ext}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      alert('Failed to download book file.');
    }
  };

  const filteredBooks = books.filter((b) =>
    b.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-indigo-500 to-violet-500 rounded-xl flex items-center justify-center shadow-md shadow-indigo-500/20">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              MyVibeReader
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 font-medium px-3 py-1.5 bg-slate-800/60 rounded-full border border-slate-700/50">
              {user?.email}
            </span>
            <button
              onClick={() => {
                logout();
                navigate('/');
              }}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Upload Dropzone */}
        <section>
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer relative overflow-hidden ${
              dragActive
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.epub,application/pdf,application/epub+zip"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="w-14 h-14 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-500/20 shadow-inner">
                {uploadMutation.isPending ? (
                  <span className="w-6 h-6 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                ) : (
                  <UploadCloud className="w-7 h-7" />
                )}
              </div>

              <div>
                <p className="text-base font-medium text-slate-200">
                  {uploadMutation.isPending
                    ? 'Uploading & Streaming to S3...'
                    : 'Click or drag & drop eBook file to upload'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Supports <span className="text-indigo-300 font-semibold">PDF</span> and{' '}
                  <span className="text-emerald-300 font-semibold">EPUB</span> up to 100MB
                </p>
              </div>
            </div>
          </div>

          {uploadError && (
            <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {uploadMutation.isSuccess && (
            <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-emerald-300 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Book uploaded successfully!</span>
            </div>
          )}
        </section>

        {/* Library Controls */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-100">Your eBook Library</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {books.length} {books.length === 1 ? 'book' : 'books'} synced across devices
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search library..."
                className="w-full pl-10 pr-4 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Book Cards Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-48 bg-slate-900/50 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center bg-slate-900/40 rounded-2xl border border-slate-800">
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
              <p className="text-sm text-slate-300">
                Failed to load library. {(error as Error)?.message}
              </p>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/30 rounded-2xl border border-slate-800/60">
              <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-slate-300">No books found</h3>
              <p className="text-xs text-slate-500 mt-1">
                {searchQuery
                  ? 'No results match your search query.'
                  : 'Upload your first PDF or EPUB file above to start reading.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredBooks.map((book) => (
                <div
                  key={book.id}
                  className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700/80 hover:bg-slate-900/90 transition shadow-lg group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="p-2.5 bg-slate-800/60 rounded-xl text-slate-300">
                        {book.format === 'PDF' ? (
                          <FileText className="w-6 h-6 text-indigo-400" />
                        ) : (
                          <Book className="w-6 h-6 text-emerald-400" />
                        )}
                      </div>

                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                          book.format === 'PDF'
                            ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        }`}
                      >
                        {book.format}
                      </span>
                    </div>

                    <h3 className="font-semibold text-slate-100 text-base line-clamp-2 mb-1 group-hover:text-indigo-300 transition">
                      {book.title}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Uploaded {new Date(book.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-800/60 flex items-center justify-between gap-2">
                    <button
                      onClick={() => navigate(`/reader/${book.id}`)}
                      className="flex-1 py-2 px-3 bg-indigo-600/80 hover:bg-indigo-600 text-white font-medium text-xs rounded-xl transition cursor-pointer text-center"
                    >
                      Read Now
                    </button>

                    <button
                      onClick={() => handleDownload(book)}
                      className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition cursor-pointer"
                      title="Download eBook"
                    >
                      <Download className="w-4 h-4" />
                    </button>

                    {deletingId === book.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => deleteMutation.mutate(book.id)}
                          className="py-1 px-2 bg-rose-600 text-white text-[10px] font-bold rounded-lg hover:bg-rose-700"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="py-1 px-2 bg-slate-800 text-slate-300 text-[10px] rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(book.id)}
                        className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition cursor-pointer"
                        title="Delete eBook"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
