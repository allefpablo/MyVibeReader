# MyVibeReader — Server

Spring Boot 3 REST API for MyVibeReader. Handles authentication, book storage, and reading progress sync.

## Stack

- **Runtime**: Java 21, Spring Boot 3.4, Maven
- **Database**: PostgreSQL
- **Auth**: JWT via Spring Security
- **Storage**: Local filesystem (path configured via `STORAGE_PATH` env var)
- **API**: REST — `/api/auth/**`, `/api/books/**`, `/api/progress/**`

## Getting Started

### Docker (recommended — no local Java/PostgreSQL needed)

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

### Local

Prerequisites: Java 21, Maven 3.9+, PostgreSQL 15+

```bash
export SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/myvibereader
export SPRING_DATASOURCE_USERNAME=myvibereader
export SPRING_DATASOURCE_PASSWORD=myvibereader
export JWT_SECRET=<256-bit-secret>
export STORAGE_PATH=./storage

cd server
mvn spring-boot:run -Dspring-boot.run.profiles=dev
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

## Related

- **Client**: [MyVibeReader-client](https://github.com/allefpablo/MyVibeReader-client) — Tauri v2 + React desktop/mobile app
