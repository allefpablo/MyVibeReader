# MyVibeReader — System Design Document

This document provides a comprehensive technical design and architectural specification for **MyVibeReader**, a cross-platform eBook reading application supporting PDF and EPUB formats with offline reading position tracking and cross-device cloud sync.

---

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph ClientLayer ["Client Architecture (Desktop & Mobile)"]
        UI["React 18 + UI Components<br/>(LoginPage, LibraryPage, ReaderPage)"]
        Store["Zustand App Store<br/>(Auth & Local Reader State)"]
        TauriStore["@tauri-apps/plugin-store<br/>(Persistent Disk Storage)"]
        SyncQueue["Sync Service Queue<br/>(syncService.ts)"]
        NetHook["useOnlineStatus Hook<br/>(Network Reconnection Detector)"]
        NativeShell["Tauri v2 Native Shell<br/>(Rust — macOS & Android)"]

        UI --> Store
        Store --> TauriStore
        UI --> SyncQueue
        NetHook -->|"Triggers flushQueue()"| SyncQueue
        UI --> NativeShell
    end

    subgraph Network ["Security & Network Layer"]
        HTTPS["HTTPS / REST API<br/>(Authorization: Bearer JWT)"]
    end

    subgraph ServerLayer ["Backend Server (Spring Boot 3.4)"]
        Filter["JwtAuthFilter<br/>(Stateless Bearer Validation)"]
        AuthCtrl["AuthController<br/>(/api/auth/register, /login)"]
        BookCtrl["BookController<br/>(/api/books/**)"]
        ProgCtrl["ProgressController<br/>(/api/progress/**)"]

        AuthSvc["AuthService<br/>(BCrypt & JwtUtil)"]
        BookSvc["BookService<br/>(S3 Proxy Upload/Stream/Delete)"]
        ProgSvc["ProgressService<br/>(Last-Write-Wins Upsert)"]

        Filter --> AuthCtrl & BookCtrl & ProgCtrl
        AuthCtrl --> AuthSvc
        BookCtrl --> BookSvc
        ProgCtrl --> ProgSvc
    end

    subgraph DataStorage ["Persistence Layer"]
        PG[("PostgreSQL 16 DB<br/>(Users, Books, Progress)")]
        S3[("AWS S3 Bucket<br/>(Scoped Keys: {userId}/{bookId}.{ext})")]
    end

    SyncQueue -->|REST Requests| HTTPS
    UI -->|REST Requests| HTTPS
    HTTPS --> Filter

    AuthSvc --> PG
    BookSvc --> PG
    BookSvc -->|AWS SDK v2 Stream| S3
    ProgSvc --> PG
```

---

## 2. Sequence Diagrams

### 2.1 Backend Proxy eBook Upload & Stream Download Flow
Files are uploaded and downloaded through a server proxy pattern so client code never needs S3 presigned credentials or complex S3 CORS configuration.

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Client
    participant Server as Spring Boot API
    participant S3 as AWS S3 Object Store
    participant DB as PostgreSQL Database

    User->>Server: POST /api/books/upload (multipart/form-data) + JWT
    Server->>Server: Validate JWT & Extract userId
    Server->>Server: Validate Content-Type (application/pdf or application/epub+zip)
    Server->>Server: Generate S3 Key: {userId}/{s3KeyId}.{ext}
    Server->>S3: Stream File via S3Client.putObject()
    S3-->>Server: 200 OK (S3 Upload Confirmed)
    Server->>DB: Save Book entity (title, format, storagePath, user_id)
    DB-->>Server: Book entity saved
    Server-->>User: HTTP 201 Created (BookDto JSON)
```

---

### 2.2 Offline Reading & Reconnection Progress Sync Flow
Positions are saved locally when offline and flushed to the backend using a timestamp-based Last-Write-Wins resolution strategy upon reconnection.

```mermaid
sequenceDiagram
    autonumber
    actor Reader as Reader Interface
    participant LocalStore as @tauri-apps/plugin-store
    participant Queue as syncService Queue
    participant Detector as useOnlineStatus
    participant Server as Spring Boot API
    participant DB as PostgreSQL Database

    Reader->>LocalStore: Write Reading Position (page or EPUB CFI)
    alt Network Online
        Reader->>Server: PUT /api/progress/{bookId}
        Server->>DB: Upsert ReadingProgress (LWW based on updatedAt)
        DB-->>Server: Saved
        Server-->>Reader: HTTP 200 OK (ProgressDto)
    else Network Offline
        Reader->>Queue: Push update to sync queue
        Note over Queue: Persistent queue saved locally
        Detector-->>Detector: Connection Restored!
        Detector->>Queue: Trigger flushQueue()
        Queue->>Server: PUT /api/progress/{bookId}
        Server->>DB: Upsert ReadingProgress
        DB-->>Server: Saved
        Server-->>Queue: HTTP 200 OK
        Queue->>Queue: Remove update from queue
    end
```

---

## 3. Entity Relationship Diagram (Database Schema)

```mermaid
erDiagram
    users ||--o{ books : "owns"
    users ||--o{ reading_progress : "has"
    books ||--o{ reading_progress : "tracks"

    users {
        string id PK "UUID"
        string email UK "NOT NULL"
        string password_hash "NOT NULL"
        timestamp created_at "NOT NULL"
    }

    books {
        string id PK "UUID"
        string user_id FK "NOT NULL"
        string title "NOT NULL"
        string author
        string format "ENUM (PDF, EPUB)"
        string storage_path "S3 Key: {userId}/{keyId}.ext"
        timestamp uploaded_at "NOT NULL"
    }

    reading_progress {
        string id PK "UUID"
        string user_id FK "NOT NULL, Unique constraint (user_id, book_id)"
        string book_id FK "NOT NULL, Unique constraint (user_id, book_id)"
        text position_json "JSON: {page, scrollY} or {cfi}"
        string device_id "Device identifier"
        timestamp updated_at "NOT NULL"
    }
```

---

## 4. Key Component Responsibilities

### 4.1 Client Components
* **Tauri v2 Native Shell**: Hosts cross-platform webview for macOS desktop and Android mobile native builds. Includes Rust build script configuration for Android 15+ 16 KB ELF page alignment (`-Wl,-z,max-page-size=16384`).
* **React 18 & Router**: Declarative UI pages (`LoginPage`, `LibraryPage`, `ReaderPage`).
* **TanStack Query Auto-Sync**: Manages server state with 3-second polling interval on library queries (`refetchInterval: 3000`) and window focus refetching (`refetchOnWindowFocus: true`) for real-time cross-device library synchrony.
* **Zustand & `@tauri-apps/plugin-store`**: Synchronous local state combined with persistent disk storage for offline access.
* **IndexedDB Binary Cache (`fileCacheService`)**: Stores downloaded PDF and EPUB binary blobs locally for offline reading without network requests to S3.
* **Offline Sync Engine (`useOnlineStatus` + `syncService` + `useProgress`)**: Listens to network status, ensures non-destructive initial rendering in PDF and EPUB viewers, and drains the persistent queue via `PUT /api/progress/{bookId}` upon reconnection.

### 4.2 Server Components
* **Stateless JWT Security Filter (`JwtAuthFilter`)**: Intercepts requests, validates Bearer tokens via `JwtUtil`, and injects user identity into Spring Security context (`@AuthenticationPrincipal String userId`).
* **Book Proxy Service (`BookService`)**: Validates eBook file signatures/content types, streams file binaries directly to AWS S3 (`downloadBook`), deletes S3 objects (`deleteBook`), and records metadata in PostgreSQL.
* **Progress Service (`ProgressService`)**: Manages reading position synchronization per user and per book using Last-Write-Wins semantics based on `updatedAt`.

---

## 5. Production Deployment Architecture (DigitalOcean)

```mermaid
graph TB
    subgraph Internet ["Public Internet"]
        Clients["macOS / Android / Web Clients"]
    end

    subgraph Droplet ["DigitalOcean Basic Droplet ($4 - $6 / mo)"]
        UFW["UFW Firewall (Ports 22, 80, 443)"]
        Swap["2GB Swap File (OOM Protection)"]

        subgraph Docker ["Docker Compose Network"]
            Caddy["Caddy 2 Reverse Proxy<br/>(Auto SSL Let's Encrypt / ZeroSSL)"]
            App["Spring Boot 3.4 API<br/>(Java 21 JRE, MaxRAM 65%)"]
            DB[("PostgreSQL 16 Alpine<br/>(Named Volume: postgres_data)")]

            Caddy -->|Reverse Proxy :8080| App
            App -->|JDBC Internal Bridge| DB
        end
    end

    subgraph Cloud ["External Cloud Storage"]
        S3["AWS S3 / Cloudflare R2 / DO Spaces<br/>(Bucket: {userId}/{bookId}.ext)"]
    end

    subgraph CICD ["GitHub Actions CI/CD Pipeline"]
        GHCR["GitHub Packages (GHCR)<br/>ghcr.io/allefpablo/myvibereader-server"]
        Workflow["release.yml<br/>(Multi-platform build & SSH deploy)"]
    end

    Clients -->|HTTPS :443| UFW
    UFW --> Caddy
    App -->|S3 Client SDK| S3
    Workflow -->|Build & Push Docker Image| GHCR
    Workflow -->|SSH Atomic Deploy & Healthcheck| Droplet
    Droplet -->|Pull Image| GHCR
```

---

## 6. Implementation Verification Status

All architectural components described in this document are **100% fully implemented**:
* **Backend**: 54 automated unit and integration tests passing (`./mvnw test`).
* **Frontend**: TypeScript compilation clean (`npx tsc --noEmit`).
* **DevOps**: Docker, Caddyfile, Droplet setup script, GHCR container publishing, and automated SSH zero-downtime deployment workflow ready.
