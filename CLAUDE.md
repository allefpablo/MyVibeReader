# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Server (`server/`)

```bash
# Run (dev profile uses create-drop DDL and verbose logging)
mvn spring-boot:run -Dspring-boot.run.profiles=dev

# Run tests
mvn test

# Run a single test class
mvn test -Dtest=AuthServiceTest

# Build JAR
mvn package -DskipTests

# Compile check only (no packaging)
mvn compile
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

- `config/` — `SecurityConfig` (JWT filter chain, CORS) and `JwtUtil` (token generation/validation)
- `controller/` — REST handlers; extract authenticated user ID from `SecurityContext`
- `service/` — business logic; injected into controllers
- `repository/` — Spring Data JPA interfaces
- `model/` — JPA entities: `User`, `Book`, `ReadingProgress`
- `dto/` — Java records used as request/response bodies

Services receive plain user IDs (strings) rather than full `User` entities — look up the user in the service layer.

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

### Reading position format (`positionJson` column / `ProgressDto`)

- EPUB: `{"cfi": "epubcfi(/6/4[chap01]!/4/2/2/1:0)"}`
- PDF: `{"page": 42, "scrollY": 320}`

## Key conventions

- All server endpoints under `/api/`; `/api/auth/**` is unauthenticated
- Spring profiles: `dev` (create-drop, verbose SQL), default (validate DDL)
- Server env vars: `SPRING_DATASOURCE_*`, `JWT_SECRET`, `JWT_EXPIRATION_MS`, `STORAGE_PATH`, `SERVER_PORT`
- Tailwind v4 — use `@tailwindcss/vite` plugin; global import is in `src/globals.css`
- CSS utilities: combine with `clsx` + `tailwind-merge` (use a `cn()` helper)
- TanStack Query for all server state; Zustand only for client-only state
