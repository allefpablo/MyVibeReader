// HTTP client pointing at the Spring Boot server.
import { useAppStore } from '../store/appStore';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

export interface UserDto {
  id: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: UserDto;
}

export interface BookDto {
  id: string;
  title: string;
  author?: string;
  format: 'PDF' | 'EPUB';
  uploadedAt: string;
}

export interface ProgressDto {
  bookId: string;
  positionJson: string;
  deviceId?: string;
  updatedAt?: string;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = useAppStore.getState().token;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if ((response.status === 401 || response.status === 403) && token) {
      useAppStore.getState().logout();
    }
    const errorText = await response.text().catch(() => 'Request failed');
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  const contentType = response.headers.get('Content-Type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }

  return response.blob() as unknown as T;
}

export const api = {
  // Auth
  register: async (email: string, password: string): Promise<AuthResponse> => {
    const data = await request<{ token: string; userId?: string; email?: string; user?: UserDto }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return {
      token: data.token,
      user: data.user || { id: data.userId || '', email: data.email || email },
    };
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    const data = await request<{ token: string; userId?: string; email?: string; user?: UserDto }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return {
      token: data.token,
      user: data.user || { id: data.userId || '', email: data.email || email },
    };
  },

  // Books
  getBooks: (): Promise<BookDto[]> =>
    request<BookDto[]>('/books'),

  uploadBook: (file: File): Promise<BookDto> => {
    const formData = new FormData();
    formData.append('file', file);
    return request<BookDto>('/books/upload', {
      method: 'POST',
      body: formData,
    });
  },

  downloadBook: (id: string): Promise<Blob> =>
    request<Blob>(`/books/${id}/download`),

  deleteBook: (id: string): Promise<void> =>
    request<void>(`/books/${id}`, {
      method: 'DELETE',
    }),

  // Reading Progress
  getProgress: (bookId: string): Promise<ProgressDto> =>
    request<ProgressDto>(`/progress/${bookId}`),

  updateProgress: (
    bookId: string,
    positionJson: string,
    deviceId?: string,
    updatedAt?: string
  ): Promise<ProgressDto> =>
    request<ProgressDto>(`/progress/${bookId}`, {
      method: 'PUT',
      body: JSON.stringify({ bookId, positionJson, deviceId, updatedAt }),
    }),
};
