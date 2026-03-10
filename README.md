# MyVibeReader

A minimalist eBook reader that supports PDF and EPUB formats, with cross-device file sync and reading position tracking. Works offline and syncs as soon as a connection is restored.

## Platforms

- macOS (native app via Tauri v2)
- Android (native app via Tauri v2)

## Architecture

```
MyVibeReader/
├── server/    Spring Boot 3 REST API — auth, book storage, reading progress sync
└── client/    React + Tauri v2 — desktop and mobile native app
```

### Server (`server/`)

- **Runtime**: Java 21, Spring Boot 3.4, Maven
- **Database**: PostgreSQL
- **Auth**: JWT via Spring Security
- **Storage**: Local filesystem (path configured via `STORAGE_PATH` env var)
- **API**: REST — `/api/auth/**`, `/api/books/**`, `/api/progress/**`

### Client (`client/`)

- **UI**: React 18 + TypeScript + Vite + Tailwind CSS v4 + Lucide React
- **State / Data**: Zustand (local state) + TanStack Query (server state)
- **Native shell**: Tauri v2 (Rust)
- **Offline sync**: `@tauri-apps/plugin-store` persists reading positions locally; synced to server on reconnect

## Getting Started

### Server via Docker (recommended)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
cp .env.example .env       # fill in JWT_SECRET at minimum
docker compose up --build  # starts PostgreSQL + Spring Boot on port 8080
```

To stop:
```bash
docker compose down        # keeps data
docker compose down -v     # wipes data volumes too
```

### Server (local)

Prerequisites: Java 21, Maven 3.9+, PostgreSQL 15+

```bash
# Set environment variables (or use a .env loader)
export SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/myvibereader
export SPRING_DATASOURCE_USERNAME=myvibereader
export SPRING_DATASOURCE_PASSWORD=myvibereader
export JWT_SECRET=<256-bit-secret>
export STORAGE_PATH=./storage

cd server
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

### Client (desktop)

```bash
cd client
npm install
npm run tauri dev
```

### Client (Android)

```bash
cd client
npm run tauri android init   # first time only
npm run tauri android dev
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5432/myvibereader` | PostgreSQL JDBC URL |
| `SPRING_DATASOURCE_USERNAME` | `myvibereader` | DB username |
| `SPRING_DATASOURCE_PASSWORD` | `myvibereader` | DB password |
| `JWT_SECRET` | *(insecure default)* | 256-bit secret for JWT signing |
| `JWT_EXPIRATION_MS` | `86400000` | Token lifetime in ms (default 24h) |
| `STORAGE_PATH` | `./storage` | Directory where book files are stored |
| `SERVER_PORT` | `8080` | HTTP port |
