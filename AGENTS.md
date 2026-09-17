# AGENTS.md

This file provides technical guidance and architectural conventions for AI coding agents (Antigravity, Claude Code, Cursor, Copilot, etc.) working on this repository.

## Commands

### Docker (recommended — no local Java/PostgreSQL needed)

```bash
cp .env.example .env          # first time only — fill in secrets
docker compose up --build     # build image + start db and app
docker compose up -d --build  # same but in background
docker compose down           # stop (data volumes preserved)
docker compose down -v        # stop and wipe all data
docker compose logs -f app    # tail server logs
```

### Server (`server/`)

```bash
# Run (dev profile uses create-drop DDL and verbose logging)
cd server && mvn spring-boot:run -Dspring-boot.run.profiles=dev

# Run tests
cd server && mvn test

# Run a single test class
cd server && mvn test -Dtest=AuthServiceTest

# Run a single test method
cd server && mvn test -Dtest=BookServiceTest#uploadBook_validPdf_savesBookAndUploadsToS3

# Build JAR
cd server && mvn package -DskipTests

# Compile check only (no packaging)
cd server && mvn compile
```

### Client (`client/`)

```bash
# Vite dev server only (no Rust compile — fastest for UI work)
npm run dev

# Full Tauri desktop dev (compiles Rust + opens native window)
npm run tauri dev

# Android dev / build
npm run tauri android init                     # First time only
npx tauri android build --debug --apk          # Build debug APK (16 KB page-aligned)
adb reverse tcp:8080 tcp:8080                  # Route phone localhost:8080 to Mac backend (local dev only)
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk

# Remote backend connection (Render / DigitalOcean / Cloud)
# Build-time: set VITE_API_URL=https://<host>/api in client/.env (adb reverse NOT needed for HTTPS)
# Runtime override: api.setBaseUrl('https://<host>/api') or localStorage.setItem('myvibereader_api_url', ...)

# Production build (desktop)
npm run tauri build

# Run unit tests
npm test

# Type check
npx tsc --noEmit
```

## Architecture

### Server package structure (`src/main/java/com/myvibereader/`)

- `config/` — `SecurityConfig` (stateless JWT filter chain, CORS, BCrypt), `JwtUtil` (token generation/validation, jjwt 0.12.6), `JwtAuthFilter` (`OncePerRequestFilter` reading `Authorization: Bearer`), `S3Config` (AWS SDK v2 `S3Client` bean)
- `controller/` — REST handlers; the authenticated user ID is injected via `@AuthenticationPrincipal String userId`
- `service/` — business logic; injected into controllers
- `repository/` — Spring Data JPA interfaces
- `model/` — JPA entities: `User`, `Book`, `ReadingProgress` (all UUID-keyed; `ReadingProgress` has a unique constraint on `(user_id, book_id)`)
- `dto/` — Java records used as request/response bodies

Services receive plain user IDs (strings) rather than full `User` entities — look up the user in the service layer.

### Book storage (S3)

Uploads are proxied through the backend (client → server → S3), not uploaded directly from the client. `BookService.uploadBook` validates the multipart Content-Type (`application/pdf` / `application/epub+zip`), streams the file to S3, and stores only the S3 key in `Book.storagePath`. The key pattern is `{userId}/{bookId}.{ext}` — scoped per user. There is no local filesystem storage (the old `STORAGE_PATH` volume was removed).

### Endpoints & implementation status

Fully implemented: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/books`, `POST /api/books/upload`, `GET /api/books/{id}/download`, `DELETE /api/books/{id}`, `GET /api/progress/{bookId}`, `PUT /api/progress/{bookId}`, `GET /api/sync` (returns sync status JSON).

### Client source structure (`src/`)

- `pages/` — `LoginPage`, `LibraryPage` (polls every 3s via `refetchInterval`), `ReaderPage`
- `hooks/` — `useProgress` (reads server state first, queues offline updates), `useOnlineStatus` (network detection, triggers sync flush)
- `store/appStore.ts` — Zustand store: auth token, current user, active book (validates JWT expiration on init and setAuth)
- `services/api.ts` — HTTP client for the Spring Boot server (auto-evicts session via `logout()` on 401/403)
- `services/authOfflineService.ts` — local salted SHA-256 credentials verification & offline JWT session generation
- `services/bookCacheService.ts` — localStorage caching of eBook library metadata for offline reading
- `services/fileCacheService.ts` — IndexedDB binary blob caching for offline eBook documents
- `services/syncService.ts` — drains the offline position queue via `flushQueue()`
- `utils/` — `jwt.ts` (JWT inspection, expiration check, base64url decoding), `sanitizeEpub.ts` (EPUB DOM sanitizer stripping scripts, event handlers, and dangerous URIs), `fileValidation.ts` (client 30MB pre-upload check)
- `router.tsx` — React Router routes: `/` (login), `/library`, `/reader/:bookId`

### Cross-device & offline sync flow

1. **Auto Library Sync:** `LibraryPage` queries books with `refetchInterval: 3000` and `refetchOnWindowFocus: true`, automatically displaying new/deleted books across active devices.
2. **Server Truth for Reading Progress:** When opening a book, `useProgress` treats `serverProgress` as authoritative unless un-synced offline updates exist in `syncService.getQueue()`.
3. **Cross-Device Focus & Visibility Sync:** `useProgress` refetches progress on window `focus` and document `visibilitychange` (to `visible`), dynamically adopting newer reading positions (`server.updatedAt > local.updatedAt`) advanced on other devices.
4. **Mobile App-Switching Flush:** When the app is backgrounded or tab hidden (`visibilityState === 'hidden'`, `pagehide`), pending progress updates are immediately flushed to the server without waiting for debounce timers.
5. **Non-Destructive Initial Render:** Viewer components (`PdfViewer`, `EpubViewer`) do not fire progress updates during initial document load or programmatic scroll restoration.
6. **Resilient Offline Queue:** If network fails during active reading, updates are queued in `syncService`. `syncService.flushQueue()` auto-flushes on reconnect/focus/visibility, automatically discarding non-retryable 404/400 poison pills while retaining temporary network/5xx failures.
7. **Server Rules:** Server uses `updatedAt` timestamp — last write wins. Stale updates (`incoming < existing`) are ignored. Timestamps > 5 minutes in the future are rejected with HTTP 400.
8. **Offline Authentication & Reading:** Users can log in offline using salted credentials cached during previous online sessions. Stored eBook metadata and IndexedDB binary blobs allow complete offline reading; progress is saved locally and flushed automatically on reconnection.
9. **Dynamic Server URL & LAN Connectivity:** `api.getBaseUrl()` / `api.setBaseUrl(url)` allows configuring backend URLs (e.g. Mac LAN IP `http://192.168.x.x:8080/api`) directly from the client without re-compiling; Tauri CSP permits `connect-src 'self' http: https:;`.

### Android 16 KB Page Alignment (Android 15+)

`client/src-tauri/build.rs` passes `-Wl,-z,max-page-size=16384` to ensure native `.so` binaries satisfy Android 15+ 16 KB page size kernel checks.

### Supported ebook formats

| Format | `Book.Format` enum value | Notes |
|---|---|---|
| EPUB | `EPUB` | Position tracked via EPUB CFI |
| PDF | `PDF` | Position tracked via page + scroll offset |

No other formats (MOBI, AZW, CBZ, etc.) are supported. Max upload size: 30MB.

### Reading position format (`positionJson` column / `ProgressDto`)

- EPUB: `{"cfi": "epubcfi(/6/4[chap01]!/4/2/2/1:0)"}`
- PDF: `{"page": 42, "scrollY": 320}`

## Key conventions & security rules

- All endpoints under `/api/`; `/api/auth/**` and `/actuator/health` are unauthenticated
- Config lives in `application.yml` (+ `application-{dev,docker}.yml`), not `.properties`. App-specific settings are namespaced under `app.jwt.*` and `app.s3.*`
- Spring profiles: `dev` (create-drop, verbose SQL), `docker` (create DDL, INFO logging), default (validate DDL — expects an existing schema)
- Env vars: `SPRING_DATASOURCE_*` / `DB_*`, `JWT_SECRET` (256-bit min), `JWT_EXPIRATION_MS`, `SERVER_PORT`, and S3 — `S3_BUCKET_NAME`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- Tailwind v4 — use `@tailwindcss/vite` plugin; global import is in `src/globals.css`
- CSS utilities: combine with `clsx` + `tailwind-merge` (use a `cn()` helper)
- TanStack Query for all server state; Zustand only for client-only state
- TDD: always write tests before implementing a feature or endpoint
- **Security & Ingestion Rules:**
  - **Magic Byte Inspection:** Validate file headers (`%PDF-`, `PK\x03\x04`) on upload; MIME alone is untrusted.
  - **Streaming Downloads:** Stream S3 objects directly via `ResponseInputStream` / `InputStreamResource` without buffering byte arrays in memory.
  - **30MB Upload Limit:** Enforced at servlet container, service layer (`MAX_FILE_SIZE_BYTES`), and client pre-flight. Returns HTTP 413.
  - **Filename Sanitization:** Strip directory traversals (`/`, `\`), control characters, and Unicode RTLO/bidi formatters. Default to `"Untitled"`.
  - **CORS Whitelist:** Never use wildcard `*`; whitelist explicit dev ports and Tauri app origins (`tauri://localhost`, `https://tauri.localhost`, `http://tauri.localhost`).
  - **Payload Schema Validation:** Validate `positionJson` constraints (`@NotBlank @Size(max = 2000)`) and reject schema mismatches.
  - **Strict CSP & EPUB Sanitization:** Enforce strict Tauri CSP (`default-src 'self'`, `object-src 'none'`), set `allowScriptedContent: false` in `EpubViewer`, and strip scripts/inline event handlers/`javascript:` links via `sanitizeEpubDocument`.
  - **Auth Session Lifecycle:** Inspect JWT expiration on client boot; auto-evict session on 401/403.
  - **Structured Error Handling:** Ensure all 4xx/5xx responses return structured JSON via `GlobalExceptionHandler` (`{"error": "...", "status": 404}`), preventing Spring Security forwarding to `/error` from triggering unintended 403 logout evictions.
  - **Mobile WebView Polyfills:** Provide standard polyfills (`Uint8Array.prototype.toHex`, `Map.prototype.getOrInsertComputed`, `Promise.withResolvers`) for mobile WebViews (Android WebView).
  - **Resilient EPUB Ingestion:** Normalize `.xhtml` $\leftrightarrow$ `.html` mismatches in EPUB archive manifests (`epubPatch.ts`) and provide graceful TOC navigation fallbacks to prevent infinite stalls.

## Releases & CI/CD

All project releases (Backend Server JAR, macOS Desktop DMG/App, and Android APKs) and **Automated Continuous Deployment to DigitalOcean** are **fully automated via GitHub Actions** ([`.github/workflows/release.yml`](.github/workflows/release.yml)):

- Triggered automatically on tag push (`git tag v1.0.0 && git push origin v1.0.0`) or manually via `gh workflow run release.yml -f tag_name=v1.0.0`.
- Matrix builds the Spring Boot JAR, macOS DMG, and 16 KB page-aligned Android APKs on GitHub runners, then publishes the release with all attached binaries.
- Builds and pushes the Docker container to GitHub Container Registry (`ghcr.io/<owner>/myvibereader-server:<tag>`).
- Deploys the release to the DigitalOcean Droplet via SSH, verifying server health via `/actuator/health` before confirming.
- **Rule for future sessions:** Always use the automated GitHub Actions release pipeline for creating releases and deploying.

## Testing

- **Backend (82 tests):** Run with `cd server && ./mvnw test`. Tests use H2 in-memory (not PostgreSQL). Services are unit-tested with Mockito; controllers with `@WebMvcTest` + `MockMvc`, injecting the JWT secret via `@TestPropertySource`. Test method names follow `method_scenario_expectedOutcome` (e.g. `uploadBook_unsupportedFormat_throws415`).
- **Frontend (70 tests):** Run with `cd client && npm test` (Vitest) and `npx tsc --noEmit` (TypeScript type check).
- **CI Pipeline:** (`.github/workflows/ci.yml`) runs `./mvnw test` (server) and `tsc --noEmit` (client) on PRs to `main`.
