# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

# Android dev
npm run tauri android dev

# Production build (desktop)
npm run tauri build

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

Fully implemented: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/books`, `POST /api/books/upload`, `GET /api/books/{id}/download`, `DELETE /api/books/{id}`, `GET /api/progress/{bookId}`, `PUT /api/progress/{bookId}`, `GET /api/sync` (returns sync status JSON).

### Client source structure (`src/`)

- `pages/` — `LoginPage`, `LibraryPage`, `ReaderPage`
- `hooks/` — `useProgress` (read/write position, queues offline updates), `useOnlineStatus` (network detection, triggers sync flush)
- `store/appStore.ts` — Zustand store: auth token, current user, active book
- `services/api.ts` — HTTP client for the Spring Boot server
- `services/syncService.ts` — drains the offline position queue via `flushQueue()`
- `router.tsx` — React Router routes: `/` (login), `/library`, `/reader/:bookId`

### Offline sync flow

1. `useProgress` writes position to both Zustand and `@tauri-apps/plugin-store` (disk)
2. If the server request fails (offline), the update is pushed to the sync queue in `syncService`
3. `useOnlineStatus` fires `syncService.flushQueue()` on reconnect
4. Server uses `updatedAt` timestamp — last write wins

### Supported ebook formats

| Format | `Book.Format` enum value | Notes |
|---|---|---|
| EPUB | `EPUB` | Position tracked via EPUB CFI |
| PDF | `PDF` | Position tracked via page + scroll offset |

No other formats (MOBI, AZW, CBZ, etc.) are supported. Max upload size: 100MB.

### Reading position format (`positionJson` column / `ProgressDto`)

- EPUB: `{"cfi": "epubcfi(/6/4[chap01]!/4/2/2/1:0)"}`
- PDF: `{"page": 42, "scrollY": 320}`

## Key conventions

- All endpoints under `/api/`; `/api/auth/**` and `/actuator/health` are unauthenticated
- Config lives in `application.yml` (+ `application-{dev,docker}.yml`), not `.properties`. App-specific settings are namespaced under `app.jwt.*` and `app.s3.*`
- Spring profiles: `dev` (create-drop, verbose SQL), `docker` (create DDL, INFO logging), default (validate DDL — expects an existing schema)
- Env vars: `SPRING_DATASOURCE_*` / `DB_*`, `JWT_SECRET` (256-bit min), `JWT_EXPIRATION_MS`, `SERVER_PORT`, and S3 — `S3_BUCKET_NAME`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- Tailwind v4 — use `@tailwindcss/vite` plugin; global import is in `src/globals.css`
- CSS utilities: combine with `clsx` + `tailwind-merge` (use a `cn()` helper)
- TanStack Query for all server state; Zustand only for client-only state
- TDD: always write tests before implementing a feature or endpoint

## Testing

Tests use H2 in-memory (not PostgreSQL). Services are unit-tested with Mockito; controllers with `@WebMvcTest` + `MockMvc`, injecting the JWT secret via `@TestPropertySource`. Test method names follow `method_scenario_expectedOutcome` (e.g. `uploadBook_unsupportedFormat_throws415`). CI (`.github/workflows/ci.yml`) runs `mvn test` (server) and `tsc --noEmit` (client) on PRs to `main`.
