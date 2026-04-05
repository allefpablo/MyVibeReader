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

### Reading position format (`positionJson` column / `ProgressDto`)

- EPUB: `{"cfi": "epubcfi(/6/4[chap01]!/4/2/2/1:0)"}`
- PDF: `{"page": 42, "scrollY": 320}`

## Key conventions

- All endpoints under `/api/`; `/api/auth/**` is unauthenticated
- Spring profiles: `dev` (create-drop, verbose SQL), `docker` (create DDL, INFO logging), default (validate DDL)
- Env vars: `SPRING_DATASOURCE_*`, `JWT_SECRET`, `JWT_EXPIRATION_MS`, `STORAGE_PATH`, `SERVER_PORT`
- TDD: always write tests before implementing a feature or endpoint
