# Building MyVibeReader: The Technical Architecture of an Offline-First, Cross-Platform eBook Reader Built with AI & TDD

## 1. The Architecture

When I set out to build **MyVibeReader**, my goal was to create a cross-platform eBook reader (supporting PDF and EPUB) that behaves like a first-class citizen on both macOS desktop and Android mobile devices, backed by a cloud synchronization engine. The system comprises three primary tiers:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Client Layer (Tauri v2)                            │
│  ┌─────────────────────────────────┐   ┌─────────────────────────────────┐  │
│  │     macOS Desktop (Tauri)       │   │       Android App (Tauri)       │  │
│  │  • React 19 + TypeScript + Vite │   │  • React 19 + TypeScript + Vite │  │
│  │  • WebKit (WKWebView)           │   │  • Android System WebView       │  │
│  │  • IndexedDB Blob Store         │   │  • IndexedDB Blob Store         │  │
│  │  • localStorage Offline Queue   │   │  • localStorage Offline Queue   │  │
│  └────────────────┬────────────────┘   └────────────────┬────────────────┘  │
└───────────────────┼─────────────────────────────────────┼───────────────────┘
                    │ HTTPS / REST (Stateless JWT)         │
                    ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Backend Server (Spring Boot 3.4 / Java 21)               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Security Filter Chain: JwtAuthFilter (JJWT 0.12.6 HMAC-SHA256)        │  │
│  │ Controllers: AuthController | BookController | ProgressController     │  │
│  │ Services:    AuthService    | BookService    | ProgressService        │  │
│  │ S3 Client:   AWS SDK v2 S3Client (Direct Streaming Proxy)             │  │
│  └──────────────────┬───────────────────────────────────┬────────────────┘  │
└─────────────────────┼───────────────────────────────────┼───────────────────┘
                      │ JDBC (HikariCP)                   │ AWS SDK v2
                      ▼                                   ▼
┌───────────────────────────────────────┐   ┌─────────────────────────────────┐
│     PostgreSQL 16 Database            │   │      AWS S3 Object Store        │
│  • users (UUID, email, password_hash) │   │  • Scoped Bucket Keys:          │
│  • books (UUID, user_id, storage_path)│   │    {userId}/{bookId}.{ext}      │
│  • reading_progress (unique user+book)│   │  • Direct stream upload/download│
└───────────────────────────────────────┘   └─────────────────────────────────┘
```

### The Client Tier (Tauri v2 + React 19)
The client is a single codebase built with **React 19**, **TypeScript**, **Tailwind CSS v4**, and **Vite**, packaged via **Tauri v2 (Rust)**. 
- **macOS Desktop:** Runs on Apple Silicon and Intel using the native WebKit engine (`tauri://localhost`), consuming minimal CPU and idle memory compared to Electron.
- **Android Mobile:** Compiles into native Android APKs rendering via Android System WebView (`https://tauri.localhost`). A crucial architectural constraint on Android 15+ kernels (such as the Galaxy Z Fold6) is the strict requirement for **16 KB ELF page alignment**. In [`client/src-tauri/build.rs`](client/src-tauri/build.rs), I passed `-Wl,-z,max-page-size=16384` to the native linker so the generated Rust shared libraries (`libclient_lib.so`) pass kernel memory checks.
- **Client State Split:** I strictly segregated client state:
  - **Server State:** Handled exclusively through **TanStack Query v5**, utilizing short background polling (`refetchInterval: 3000`) and window-focus queries (`refetchOnWindowFocus: true`) to ensure library synchronization across devices.
  - **Local App State:** Managed via **Zustand v5** (auth session, user profile, active reading book).

### The Backend Tier (Spring Boot 3.4)
The backend is a Spring Boot 3.4 service running Java 21 on Alpine JRE containers, deployed both on a DigitalOcean Droplet (via Docker Compose + Caddy HTTPS) and on Render.
- **Stateless Authentication:** Spring Security intercepts requests via a custom `JwtAuthFilter` validating HMAC-SHA256 signed bearer tokens generated with `jjwt 0.12.6`. The authenticated user ID (`@AuthenticationPrincipal String userId`) is extracted from token claims and injected directly into controller endpoints.
- **Database Schema:** PostgreSQL 16 stores relational records (`users`, `books`, `reading_progress`). Every entity uses UUID primary keys. The `reading_progress` table enforces a composite unique constraint on `(user_id, book_id)`.

### The Object Storage Tier (AWS S3 Backend Proxy Pattern)
Rather than having client apps generate AWS credentials or manage complex presigned S3 URLs, I implemented a **Backend Proxy Pattern** in [`BookService.java`](server/src/main/java/com/myvibereader/service/BookService.java):
- **Upload Flow:** Client sends `multipart/form-data` to `POST /api/books/upload`. The server inspects magic byte signatures (`%PDF-` for PDFs, `PK\x03\x04` for EPUB ZIP containers) to reject spoofed files, verifies the strict 30MB limit, and immediately streams the byte stream to S3 via `s3Client.putObject()` with the scoped key `{userId}/{bookId}.{ext}`. The file never touches server disk.
- **Download Flow:** `GET /api/books/{id}/download` queries S3 with `GetObjectRequest` and streams the response directly to the client HTTP socket using Spring's `InputStreamResource` and `ResponseInputStream`, maintaining a tiny memory footprint on 512MB RAM servers.

---

## 2. Key Design Decisions

The most technically demanding aspect of MyVibeReader was building an **offline-first reading engine** with **seamless connection-recovery synchronization** across mobile and desktop.

### 2.1 Complete Offline-First Authentication & Reading
Most eBook readers fail completely if you open them on a plane or subway without an active connection. I solved this by designing a three-layer offline persistence architecture:

1. **Local Salted Credential Cache ([`authOfflineService.ts`](client/src/services/authOfflineService.ts)):** When a user logs in online, their email and a salted SHA-256 hash of their password (`crypto.subtle.digest('SHA-256', ...)`) are cached in `localStorage`. If the user attempts to log in with no internet, the app verifies their credentials locally, generates a deterministic offline session token, and grants instant access to their local library.
2. **Metadata Caching ([`bookCacheService.ts`](client/src/services/bookCacheService.ts)):** The entire library metadata list (`BookDto[]`) is persisted in `localStorage`. When the app loads offline, it renders cached books without waiting for network timeouts.
3. **Binary Document Caching via IndexedDB ([`fileCacheService.ts`](client/src/services/fileCacheService.ts)):** Raw EPUB and PDF binaries cannot safely reside in `localStorage` due to storage quotas (typically 5MB). I built an IndexedDB wrapper (`myvibereader-files` DB, `files` object store) storing the complete document `Blob`. When a user opens a book:
   - The app checks IndexedDB for a cached `Blob`.
   - If found, it renders immediately from local storage.
   - If absent and online, it fetches the file from `/api/books/{id}/download`, saves it to IndexedDB in the background, and renders.

### 2.2 Reading Position Format: CFI vs. Page Offsets
PDF and EPUB have fundamentally different layout paradigms, which required distinct tracking representations serialized into a common `positionJson` column:
- **EPUB:** Because font size, viewport dimensions, and line spacing reflow dynamically, page numbers are meaningless. The app tracks position using EPUB **Canonical Fragment Identifiers (CFI)** generated by `epub.js` (e.g., `{"cfi": "epubcfi(/6/4[chap01]!/4/2/2/1:0)"}`).
- **PDF:** Rendered via Mozilla's `pdfjs-dist` inside a virtualized canvas. Position is stored as the absolute page number and vertical pixel scroll offset (e.g., `{"page": 42, "scrollY": 320}`).

### 2.3 Resilient Connection-Recovery Queue ([`syncService.ts`](client/src/services/syncService.ts))
When reading offline, reading progress cannot simply be discarded. I implemented a persistent FIFO sync queue:

```
[ Active Reading Event ] 
        │
        ▼
[ useProgress Hook (Debounce 1000ms) ]
        │
        ├── Online? ──► [ PUT /api/progress/{bookId} ] ──► (Saved to PostgreSQL)
        │
        └── Offline or Failed Request?
                │
                ▼
        [ syncService.enqueue() ] ──► (Persisted to localStorage FIFO Queue)
                │
                ▲ (Reconnect / Window Focus / Visibility Event)
                │
        [ syncService.flushQueue() ]
                │
                ├── HTTP 200 OK ──► Dequeue item
                ├── HTTP 400/404 Poison Pill ──► Evict item immediately
                └── Network/5xx Error ──► Retain item in queue, retry next cycle
```

Key nuances in this sync pipeline:
- **Poison Pill Elimination:** If an update fails with an unrecoverable client error (e.g., HTTP 404 Book Deleted or HTTP 400 Malformed JSON), `flushQueue` discards the item immediately. Without this, a single bad record would block the queue forever. Temporary network failures and 5xx server errors leave the record intact for the next flush.
- **Mobile Backgrounding & App-Switching Flush:** Mobile OSs frequently kill background webviews without notice. I attached listeners to both `visibilitychange` (`document.visibilityState === 'hidden'`) and `pagehide`. When a user switches apps or locks their phone, active debounces are immediately cancelled and pending positions are synchronously flushed before the webview freezes.
- **Suppressing Destructive Initial Progress Events:** When a viewer component (`PdfViewer` or `EpubViewer`) mounts and restores a saved scroll position, it triggers internal scroll events. If unhandled, these synthetic scroll events would fire a progress update for "Page 1, Scroll 0", overwriting the user's real progress. I introduced mount guards (`isRestoringRef` and `initialRenderRef`) that swallow all progress events until the saved position is fully restored into the DOM.

### 2.4 Server-Side Last-Write-Wins Conflict Resolution
On the Spring Boot server ([`ProgressService.java`](server/src/main/java/com/myvibereader/service/ProgressService.java)), reading progress updates include an ISO-8601 UTC timestamp (`updatedAt`).
- **Clock Skew Guard:** Updates with timestamps more than 5 minutes into the future are rejected with HTTP 400 to prevent corrupted system clocks from permanently pinning a position.
- **Last-Write-Wins (LWW):** If an incoming update's timestamp is older than the database's existing `updatedAt`, the update is ignored.
- **Cross-Device Dynamic Focus Adoption:** In [`useProgress.ts`](client/src/hooks/useProgress.ts), when a user shifts from reading on Android to macOS, the desktop window's `focus` and `visibilitychange` listeners fetch the latest server progress. If `server.updatedAt > local.updatedAt`, the desktop viewer dynamically jumps forward to the phone's reading position.

---

## 3. The "Vibe Coding" & TDD Process

MyVibeReader was my first complete application built using **"Vibe Coding"**—collaborating with autonomous AI coding agents (such as Antigravity and Claude Code). However, "vibe coding" without structure usually leads to architectural drift, hallucinated APIs, and broken edge cases. 

To build a production-grade system, I paired AI velocity with two strict engineering constraints: **Agent Guidance Documents (`AGENTS.md`)** and **Rigid Test-Driven Development (TDD)**.

### 3.1 Markdown as the Agent's "Constitution"
AI agents lack long-term memory between tasks unless you anchor them to unambiguous specifications. I created [`AGENTS.md`](AGENTS.md) and [`SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md) at the root of the repository, treating them as executable architectural contracts:

- **Strict Boundary Rules:** Services receive plain `userId` strings from `@AuthenticationPrincipal`, never complete JPA entities (preventing detached entity bugs).
- **Zero Local File Storage:** Explicitly forbade saving books to the container filesystem; all uploads must stream to S3.
- **Security Ingestion Contracts:** Enforced magic byte validation (`%PDF-`, `PK\x03\x04`), 30MB limits, filename traversal stripping (`../`), and strict DOM sanitization of EPUB documents ([`sanitizeEpub.ts`](client/src/utils/sanitizeEpub.ts)) to strip script tags, event handlers, and `javascript:` URIs.
- **Mobile WebView Compatibility:** Mandated modern ECMAScript polyfills (`Uint8Array.prototype.toHex`, `Map.prototype.getOrInsertComputed`, `Promise.withResolvers`) in [`polyfills.ts`](client/src/utils/polyfills.ts) to eliminate silent crashes on older Android WebViews.

Whenever an agent started a task, it was instructed to read the markdown documentation before writing a single line of code. This completely eliminated architectural hallucination.

### 3.2 The Strict Red-Green-Refactor Loop
The single biggest risk with AI-assisted coding is regression introduction: the agent fixes one bug but silently breaks two existing features. I mitigated this by enforcing an uncompromising TDD cycle:

```
┌────────────────────────────────────────────────────────┐
│ 1. Red Phase: Test Creation                           │
│    • Agent writes unit/integration tests for feature  │
│    • Execute tests & verify they FAIL as expected      │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. Green Phase: Minimal Implementation                │
│    • Agent writes minimal code to satisfy tests        │
│    • Execute tests & verify all PASS                   │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. Refactor & Regression Verification                  │
│    • Clean up code, enforce types (npx tsc --noEmit)  │
│    • Run entire test suite (82 backend + 70 frontend) │
│    • Commit only when zero regressions exist           │
└────────────────────────────────────────────────────────┘
```

### Real-World Example: Catching Regressions Before Deployment
During development, I added dynamic server URL switching (`api.setBaseUrl`) so the Android APK could toggle between a local development Mac (`http://192.168.x.x:8080/api`) and a cloud backend (`https://myvibereader-server.onrender.com/api`). 

When the agent implemented the feature, it modified `client/.env`. Immediately, the automated test suite flagged a regression in [`crossDeviceAndNetworkRecovery.test.tsx`](client/src/__tests__/crossDeviceAndNetworkRecovery.test.tsx):
```
FAIL src/__tests__/crossDeviceAndNetworkRecovery.test.tsx
  AssertionError: expected 'https://myvibereader-server.onrender.com/api' to contain '8080'
```
Because the test suite executed on every change, we caught the hardcoded assumption instantly and refactored the test assertion to validate URL schema shapes dynamically. 

By the end of the project, the test suite comprised:
- **82 Backend Unit & MockMvc Tests:** Testing JWT filters, S3 streaming, 30MB rejection, last-write-wins clock drift, and corrupted file magic bytes.
- **70 Frontend Vitest & React Testing Library Tests:** Testing offline credential hashing, IndexedDB binary retrieval, debounce flushing, poison pill discarding, and cross-device focus synchronization.
- **Strict CI Pipeline ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):** Running `./mvnw test` and `npx tsc --noEmit` on every pull request.

---

## 4. Takeaways

Building MyVibeReader reshaped how I think about both full-stack software architecture and AI-augmented software engineering:

1. **Separation of State Lifecycles is Critical:** Dividing data into **Server Cache** (TanStack Query), **UI State** (Zustand), **Document Blobs** (IndexedDB), and **Offline Queues** (`localStorage`) made an otherwise chaotic offline-sync problem tractable and modular.
2. **AI Needs Guardrails, Not Just Prompts:** Vibe coding without automated tests and living architecture specs (`AGENTS.md`) is a recipe for technical debt. When you give an AI clear boundaries and a fast test feedback loop, it transforms from an unpredictable generator into an exceptionally fast, rigorous pair programmer.
3. **Tauri v2 is a Game Changer for Cross-Platform Desktop + Mobile:** Being able to target both macOS and Android from a single React 19 codebase—with native Rust performance, direct hardware bridge access, and zero Electron bloat—makes Tauri v2 one of the most compelling stacks for modern cross-platform applications.
4. **Automate the Deployment Pipeline Early:** Writing automated GitHub Actions workflows ([`.github/workflows/release.yml`](.github/workflows/release.yml)) that simultaneously matrix-compile the Spring Boot JAR, macOS DMG, and 16 KB page-aligned Android APKs on tag push allowed me to test real hardware builds within minutes rather than spending hours troubleshooting local build tools.
