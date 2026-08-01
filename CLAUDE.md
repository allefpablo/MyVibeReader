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

### Local development

```bash
# Run (dev profile uses create-drop DDL and verbose logging)
cd server && mvn spring-boot:run -Dspring-boot.run.profiles=dev

# Run tests
cd server && mvn test

# Run a single test class
cd server && mvn test -Dtest=AuthServiceTest

# Build JAR
cd server && mvn package -DskipTests

# Compile check only (no packaging)
cd server && mvn compile

# Run a single test method
cd server && mvn test -Dtest=BookServiceTest#uploadBook_validPdf_savesBookAndUploadsToS3
```

The client (`client/`) is a Tauri v2 + React 19 + TypeScript scaffold — pages currently export `null` and no app logic is wired up yet (`cd client && npm run dev` for Vite, `npm run tauri dev` for the desktop shell). Nearly all active work is server-side.

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

Implemented: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/books`, `POST /api/books/upload`.
Still stubbed (`throw new UnsupportedOperationException("TODO")`): `GET /api/books/{id}/download`, `DELETE /api/books/{id}`, `GET /api/progress/{bookId}`, `PUT /api/progress/{bookId}`. `GET /api/sync` is a placeholder returning "Hello World".

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
- TDD: always write tests before implementing a feature or endpoint

## Testing

Tests use H2 in-memory (not PostgreSQL). Services are unit-tested with Mockito; controllers with `@WebMvcTest` + `MockMvc`, injecting the JWT secret via `@TestPropertySource`. Test method names follow `method_scenario_expectedOutcome` (e.g. `uploadBook_unsupportedFormat_throws415`). CI (`.github/workflows/ci.yml`) runs `mvn test` on PRs to `main`.
