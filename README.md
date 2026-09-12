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
- **Storage**: AWS S3 (object key stored in DB; file never touches local disk)
- **API**: REST — `/api/auth/**`, `/api/books/**`, `/api/progress/**`

### Client (`client/`)

- **UI**: React 19 + TypeScript + Vite + Tailwind CSS v4 + Lucide React
- **State / Data**: Zustand (local state) + TanStack Query (server state)
- **Native shell**: Tauri v2 (Rust)
- **Offline sync**: `@tauri-apps/plugin-store` persists reading positions locally; synced to server on reconnect

## Getting Started & Development

### Prerequisites

- **Java**: JDK 21+
- **Node.js**: v20+ with `npm`
- **Docker**: Docker Desktop (recommended for database and containerized runs)
- **Rust**: Required only for compiling native desktop binaries via Tauri v2
- **Android Studio / SDK**: Required only for native Android builds

---

### Environment Setup

Copy `.env.example` to `.env` in the repository root and configure secrets:

```bash
cp .env.example .env
```

Ensure `.env` contains valid AWS S3 and database parameters:
```env
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/myvibereader
SPRING_DATASOURCE_USERNAME=myvibereader
SPRING_DATASOURCE_PASSWORD=myvibereader
JWT_SECRET=super-secret-key-at-least-256-bits-long-for-hmac-sha256
JWT_EXPIRATION_MS=86400000
SERVER_PORT=8080
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_REGION=us-east-1
S3_BUCKET_NAME=myvibereader-storage-bucket
```

---

## Server (`server/`)

### 1. Run Server via Docker Compose (Recommended)

Starts PostgreSQL 16 database and Spring Boot server in isolated containers:

```bash
# Build image and start services
docker compose up --build

# Run in background (detached mode)
docker compose up -d --build

# View server logs
docker compose logs -f app

# Stop containers (database volume preserved)
docker compose down

# Stop containers and wipe database volume
docker compose down -v
```
*Server runs at `http://localhost:8080`.*

### 2. Run Server Locally (Maven)

Requires local PostgreSQL running on `localhost:5432`:

```bash
cd server

# Run using Maven wrapper with dev profile (auto table creation)
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
```

### 3. Run Server Tests

```bash
cd server
./mvnw test
```

### 4. Build Production JAR

```bash
cd server
./mvnw clean package -DskipTests
```
*Executable JAR built at `server/target/server-0.0.1-SNAPSHOT.jar`.*

---

## Client (`client/`)

Navigate to the `client/` directory and install dependencies:

```bash
cd client
npm install
```

### 1. Run Browser Dev Server (Fastest for UI Development)

Uses Vite dev server with pre-configured API proxy to `http://localhost:8080`:

```bash
npm run dev
```
*Access at `http://localhost:1420` or `http://localhost:5173`.*

### 2. Run Native Desktop Dev Mode (macOS / Linux / Windows)

Compiles Rust native shell and launches native desktop app window:

```bash
npm run tauri dev
```

### 3. Build Production Native Desktop Application

Compiles optimized release binary and installer bundle:

```bash
npm run tauri build
```
*Production installer output saved under `client/src-tauri/target/release/bundle/`.*

### 4. Build and Run Native Android Application

Android builds require Android SDK (API 34+), NDK (27+ recommended), and Rust compilation targets (`aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android`, `i686-linux-android`).

```bash
# Initialize Android project structure (first time only)
npm run tauri android init

# Build debug APK (16 KB ELF page alignment is enabled automatically in build.rs)
npx tauri android build --debug --apk

# Connect physical device via USB and forward backend port (8080)
adb reverse tcp:8080 tcp:8080

# Install generated APK onto connected device
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

> **Note on 16 KB Page Size:** Android 15+ kernel devices (e.g. Galaxy Z Fold6) require 16 KB ELF page alignment for native libraries (`.so`). MyVibeReader automatically passes `-Wl,-z,max-page-size=16384` during Rust Android compilation.

### 5. Check TypeScript Types

```bash
npx tsc --noEmit
```

### 6. Production Deployment to DigitalOcean ($4 - $6/month)

Deploy the entire backend stack (Spring Boot 3.4 + PostgreSQL 16 + Caddy with automated HTTPS) on a single budget DigitalOcean Droplet:

```bash
# 1. Create a $4/mo (512MB RAM) or $6/mo (1GB RAM) Ubuntu Droplet on DigitalOcean.
# 2. SSH into your Droplet and run the automated setup script:
curl -fsSL https://raw.githubusercontent.com/allefpablo/MyVibeReader/main/deploy/setup-droplet.sh | sudo bash

# 3. Configure production secrets:
sudo cp /opt/myvibereader/.env.prod.example /opt/myvibereader/.env
sudo nano /opt/myvibereader/.env   # Set DOMAIN, JWT_SECRET, S3 credentials, etc.

# 4. Start the stack:
sudo docker compose -f /opt/myvibereader/docker-compose.prod.yml up -d
```

### 7. Automated Releases & Continuous Deployment (GitHub Actions)

Releases and DigitalOcean server deployments are **fully automated** via GitHub Actions ([`.github/workflows/release.yml`](.github/workflows/release.yml)):

1. Tag push triggers automated multi-platform compilation (Spring Boot JAR, macOS DMG, Android APKs, and Docker image pushed to GitHub Container Registry `ghcr.io`).
2. The `deploy-digitalocean` job automatically connects to your Droplet via SSH, pulls the new image tag, performs an atomic rolling update, and validates server health (`/actuator/health`).

```bash
# Push a version tag to build, release, and deploy:
git tag v1.0.0
git push origin v1.0.0
```

#### Required GitHub Secrets for Automated Deployment:
- `DO_HOST`: Droplet IP address or hostname
- `DO_USER`: `root` or deploy user
- `DO_SSH_KEY`: Private SSH key authorized on the Droplet (`cat ~/.ssh/id_rsa`)
- `DO_PORT`: SSH Port (default: `22`)

## Environment Variables

### Client (`client/`)
| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8080/api` | Backend API Base URL for native desktop/mobile apps |

### Server (`server/`)

| Variable | Default | Description |
|---|---|---|
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5432/myvibereader` | PostgreSQL JDBC URL |
| `SPRING_DATASOURCE_USERNAME` | `myvibereader` | DB username |
| `SPRING_DATASOURCE_PASSWORD` | `myvibereader` | DB password |
| `JWT_SECRET` | *(insecure default)* | 256-bit secret for JWT signing |
| `JWT_EXPIRATION_MS` | `86400000` | Token lifetime in ms (default 24h) |
| `AWS_ACCESS_KEY_ID` | *(required)* | IAM access key with S3 permissions |
| `AWS_SECRET_ACCESS_KEY` | *(required)* | IAM secret key |
| `AWS_REGION` | `us-east-1` | AWS region where the bucket lives |
| `S3_BUCKET_NAME` | *(required)* | Name of the S3 bucket for book files |
| `SERVER_PORT` | `8080` | HTTP port |

## Book Upload Flow

Files are uploaded via a **backend proxy** pattern:

```
Client → POST /api/books/upload (multipart/form-data)
           └─ Server validates format (PDF/EPUB only)
           └─ Server streams file → S3
           └─ Server saves metadata (title, format, S3 key) → PostgreSQL
           └─ Returns BookDto (id, title, format, uploadedAt)
```

The S3 object key follows the pattern `{userId}/{bookId}.{ext}`, scoping each user's files to their own prefix.

### Why backend proxy instead of presigned URLs?

The alternative approach would have the client upload directly to S3 using a short-lived presigned URL generated by the server. That was considered and rejected for the following reasons:

| | Backend proxy (chosen) | Presigned URL |
|---|---|---|
| **Client complexity** | One endpoint, standard multipart | Two round-trips: get URL, then upload |
| **S3 CORS config** | Not needed | Required |
| **API contract** | Matches existing `BookController` stub | Requires redesigning the upload API |
| **Server bandwidth** | File passes through server | File goes direct to S3 |
| **Scale** | Fine for personal use | Better for multi-user at scale |

For a personal application with a single user uploading a small library, the bandwidth cost of proxying through the server is negligible. The simpler architecture was the right trade-off.

## Supported Formats

| Format | Notes |
|---|---|
| **EPUB** | Position synced via EPUB Canonical Fragment Identifier (CFI) |
| **PDF** | Position synced via page number + scroll offset |

Max upload size: 30MB per file.
 
## Security & Hardening

MyVibeReader implements defense-in-depth across the full application stack:

* **File Ingestion Security**: File uploads undergo non-destructive magic byte signature inspection (`%PDF-` and `PK\x03\x04`), rejecting disguised executable or HTML payloads regardless of declared MIME type.
* **Denial of Service Prevention**: eBook downloads stream directly from AWS S3 via `ResponseInputStream` and `InputStreamResource` without buffering byte arrays in server memory. Maximum upload file size is strictly capped at 30MB across the servlet container, service layer, and client pre-flight checks.
* **Input & Filename Sanitization**: Uploaded filenames are stripped of path traversal sequences (`../`, `C:\`), ASCII control characters, and Unicode Right-to-Left Override (RTLO) spoofing characters before saving display titles.
* **Strict Webview Sandbox**: Tauri desktop and mobile webviews enforce a strict Content Security Policy (`default-src 'self'`, `object-src 'none'`). EPUB documents are rendered with `allowScriptedContent: false` and DOM-sanitized via content interception hooks that strip scripts, objects, embeds, iframes, inline `on*` event handlers, and `javascript:` URIs.
* **Sync Engine Integrity**: Reading positions require valid JSON adhering to format schemas (PDF integer `page >= 1` & `scrollY >= 0`; EPUB non-blank `cfi`). Updates enforce Last-Write-Wins timestamps and reject future clocks skewed by more than 5 minutes.
* **Auth Lifecycle & Session Eviction**: JWT tokens are structurally validated and checked for expiration on client boot. Any authenticated request returning HTTP 401/403 automatically purges persisted storage and evicts the session.
* **Strict CORS Whitelisting**: CORS is restricted to trusted local development origins and Tauri application schemes (`tauri://localhost`, `https://tauri.localhost`, `http://tauri.localhost`).
