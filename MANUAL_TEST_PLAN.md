# Comprehensive End-to-End Manual Test Plan

This document provides a complete, step-by-step manual test plan for **MyVibeReader**, covering all software components, build instructions, REST API endpoints, client UI flows, and offline sync verification.

---

## 1. Environment & Build Instructions

### Prerequisites
* **Java**: JDK 21+
* **Build Tool**: Maven 3.9+ (or included `./mvnw`)
* **Node.js**: v20+ with `npm`
* **Rust**: Required for Tauri v2 native desktop compilation
* **Docker & Docker Compose**: Required for containerized database and app setup
* **PostgreSQL**: 15+ (if running database locally outside Docker)

---

### Step 1.1: Environment Configuration
Copy `.env.example` to `.env` in the repository root and fill in required variables:

```bash
cp .env.example .env
```

Ensure `.env` contains valid parameters:
```env
POSTGRES_DB=myvibereader
POSTGRES_USER=myvibereader
POSTGRES_PASSWORD=myvibereader
JWT_SECRET=super-secret-key-at-least-256-bits-long-for-hmac-sha256
JWT_EXPIRATION_MS=86400000
SERVER_PORT=8080
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_REGION=us-east-1
S3_BUCKET_NAME=myvibereader-storage-bucket
```

---

### Step 1.2: Launching the Server

#### Option A: Docker Compose (Recommended)
Starts PostgreSQL 16 and Spring Boot server in containerized isolation:

```bash
# Build and start all services
docker compose up --build

# Run in background (detached mode)
docker compose up -d --build

# View server logs
docker compose logs -f app

# Tear down (preserve database volume)
docker compose down

# Tear down and wipe database volume
docker compose down -v
```

#### Option B: Native Spring Boot (Dev Profile)
Requires local PostgreSQL running on `localhost:5432`:

```bash
cd server
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
```

*The server will run on `http://localhost:8080`.*

---

### Step 1.3: Launching the Client

Navigate to the `client/` directory:

```bash
cd client
npm install
```

#### Running Options:
1. **Vite Browser Dev Server (Fastest for UI work)**:
   ```bash
   npm run dev
   ```
   *Access at `http://localhost:5173`.*

2. **Native Tauri Desktop Application (macOS/Linux/Windows)**:
   ```bash
   npm run tauri dev
   ```

3. **Native Tauri Android Application**:
   ```bash
   npm run tauri android dev
   ```

---

## 2. Implemented REST API Endpoints & Functionality Catalog

All endpoints listed below are **100% fully implemented and verified**:

| Method | Endpoint | Auth Required | Implementation Status | Request Payload / Params | Response |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | No | ✅ Fully Implemented | `{"email": "...", "password": "..."}` | `201 Created` with JWT `token` & `user` object |
| `POST` | `/api/auth/login` | No | ✅ Fully Implemented | `{"email": "...", "password": "..."}` | `200 OK` with JWT `token` & `user` object |
| `GET` | `/actuator/health` | No | ✅ Fully Implemented | None | `200 OK` `{"status": "UP"}` |
| `GET` | `/api/sync` | No | ✅ Fully Implemented | None | `200 OK` `{"status":"UP", "service":"MyVibeReader Sync Service", "timestamp":"..."}` |
| `GET` | `/api/books` | Yes | ✅ Fully Implemented | Header: `Authorization: Bearer <token>` | `200 OK` array of `BookDto` objects |
| `POST` | `/api/books/upload` | Yes | ✅ Fully Implemented | Multipart Form: `file` (PDF/EPUB, max 100MB) | `201 Created` with `BookDto` metadata |
| `GET` | `/api/books/{id}/download` | Yes | ✅ Fully Implemented | Path: `id` (Book UUID) | `200 OK` binary file stream from S3 |
| `DELETE`| `/api/books/{id}` | Yes | ✅ Fully Implemented | Path: `id` (Book UUID) | `204 No Content` (S3 object + DB metadata purged) |
| `GET` | `/api/progress/{bookId}` | Yes | ✅ Fully Implemented | Path: `bookId` | `200 OK` with `ProgressDto` position JSON |
| `PUT` | `/api/progress/{bookId}` | Yes | ✅ Fully Implemented | Path: `bookId`, Body: `ProgressDto` | `200 OK` with updated `ProgressDto` |

---

## 3. Step-by-Step Manual Test Suites

---

### Test Suite 1: Authentication & Authorization Flow

#### Test Case 1.1: Register a New User
* **Steps**:
  1. Send request:
     ```bash
     curl -i -X POST http://localhost:8080/api/auth/register \
       -H "Content-Type: application/json" \
       -d '{"email":"reader_user@example.com","password":"Password123!"}'
     ```
* **Expected Result**:
  * Status code: `201 Created`
  * Response body contains `token` string and `user` object with `id` (UUID) and `email`.

#### Test Case 1.2: Register Duplicate Email (Error Handling)
* **Steps**:
  1. Execute Test Case 1.1 again with the exact same email.
* **Expected Result**:
  * Status code: `400 Bad Request`.
  * Response indicates email is already registered.

#### Test Case 1.3: User Login
* **Steps**:
  1. Send request:
     ```bash
     curl -i -X POST http://localhost:8080/api/auth/login \
       -H "Content-Type: application/json" \
       -d '{"email":"reader_user@example.com","password":"Password123!"}'
     ```
* **Expected Result**:
  * Status code: `200 OK`.
  * Response body contains valid JWT `token`.

#### Test Case 1.4: Access Protected Endpoint Without Token
* **Steps**:
  1. Call `GET http://localhost:8080/api/books` without an `Authorization` header.
* **Expected Result**:
  * Status code: `403 Forbidden` / `401 Unauthorized`.

---

### Test Suite 2: Book Upload, Download & S3 Deletion

#### Test Case 2.1: Upload PDF eBook
* **Steps**:
  1. Obtain token `$TOKEN` from Test Case 1.3.
  2. Send multipart upload request with a valid PDF file:
     ```bash
     curl -i -X POST http://localhost:8080/api/books/upload \
       -H "Authorization: Bearer $TOKEN" \
       -F "file=@sample.pdf;type=application/pdf"
     ```
* **Expected Result**:
  * Status code: `201 Created`.
  * Payload contains `id` (UUID), `title` ("sample"), `format` ("PDF"), `uploadedAt`.
  * S3 bucket receives object under key `{userId}/{s3KeyId}.pdf`.

#### Test Case 2.2: Upload EPUB eBook
* **Steps**:
  1. Send request with a valid EPUB file:
     ```bash
     curl -i -X POST http://localhost:8080/api/books/upload \
       -H "Authorization: Bearer $TOKEN" \
       -F "file=@sample.epub;type=application/epub+zip"
     ```
* **Expected Result**:
  * Status code: `201 Created`.
  * Payload contains `format` ("EPUB").

#### Test Case 2.3: Download eBook File
* **Steps**:
  1. Extract `$BOOK_ID` from Test Case 2.1.
  2. Execute download request:
     ```bash
     curl -i -X GET "http://localhost:8080/api/books/$BOOK_ID/download" \
       -H "Authorization: Bearer $TOKEN" \
       --output downloaded.pdf
     ```
* **Expected Result**:
  * Status code: `200 OK`.
  * Header `Content-Disposition: attachment; filename="book-$BOOK_ID"`.
  * `downloaded.pdf` saved on disk with complete file integrity.

#### Test Case 2.4: Delete eBook
* **Steps**:
  1. Execute deletion:
     ```bash
     curl -i -X DELETE "http://localhost:8080/api/books/$BOOK_ID" \
       -H "Authorization: Bearer $TOKEN"
     ```
* **Expected Result**:
  * Status code: `204 No Content`.
  * Metadata purged from PostgreSQL database.
  * S3 object `{userId}/{s3KeyId}.pdf` deleted from cloud storage.

---

### Test Suite 3: Reading Progress API & Multi-Device Sync

#### Test Case 3.1: Save PDF Reading Position
* **Steps**:
  1. Send position update for PDF book:
     ```bash
     curl -i -X PUT "http://localhost:8080/api/progress/$BOOK_ID" \
       -H "Authorization: Bearer $TOKEN" \
       -H "Content-Type: application/json" \
       -d "{\"bookId\":\"$BOOK_ID\",\"positionJson\":\"{\\\"page\\\":42,\\\"scrollY\\\":300}\",\"deviceId\":\"macbook-1\"}"
     ```
* **Expected Result**:
  * Status code: `200 OK`.
  * JSON contains saved position `{"page":42,"scrollY":300}`, device ID `macbook-1`, and updated `updatedAt` timestamp.

#### Test Case 3.2: Fetch Saved Progress
* **Steps**:
  1. Execute `GET /api/progress/$BOOK_ID`:
     ```bash
     curl -i -X GET "http://localhost:8080/api/progress/$BOOK_ID" \
       -H "Authorization: Bearer $TOKEN"
     ```
* **Expected Result**:
  * Status code: `200 OK`.
  * Returns latest position JSON matching saved state.

---

### Test Suite 4: React Client UI & Native Shell Verification

#### Test Case 4.1: Login & Registration Page (`LoginPage.tsx`)
* **Steps**:
  1. Open client app at `http://localhost:5173` or launch `npm run tauri dev`.
  2. Test toggle button between "Sign In" and "Create Account".
  3. Submit invalid credentials $\rightarrow$ verify error banner displays.
  4. Submit valid email & password $\rightarrow$ verify redirect to `/library` and token saved in Zustand/localStorage.

#### Test Case 4.2: Library Page & Upload Dropzone (`LibraryPage.tsx`)
* **Steps**:
  1. On `/library`, drag a `.pdf` or `.epub` file into the upload dropzone (or click to select).
  2. Verify upload spinner displays while file streams to S3.
  3. Verify new book card appears with format badge (`PDF` / `EPUB`), title, and upload date.
  4. Test search input $\rightarrow$ filter books by title.
  5. Click "Download" icon $\rightarrow$ verify browser downloads file.
  6. Click "Delete" icon $\rightarrow$ click "Confirm" $\rightarrow$ verify book card is removed.

#### Test Case 4.3: Real PDF/EPUB Reader View & Offline Sync (`ReaderPage.tsx`)
* **Steps**:
  1. Click "Read Now" on a PDF book card to open `/reader/:bookId`.
  2. Verify binary blob is retrieved via `api.downloadBook(bookId)` and `PdfViewer.tsx` renders PDF pages onto canvas with zoom and page controls.
  3. Click "Read Now" on an EPUB book card to open `/reader/:bookId`.
  4. Verify `EpubViewer.tsx` loads EPUB chapter content and tracks CFI section location.
  5. Verify top nav shows "Online" badge with green indicator.
  6. Turn off computer Wi-Fi / set browser DevTools to Offline mode.
  7. Navigate pages $\rightarrow$ observe top nav update to "Offline (Queued N)" badge with amber indicator.
  8. Re-enable Wi-Fi / set DevTools back to Online mode.
  9. Observe `useOnlineStatus` trigger `syncService.flushQueue()` $\rightarrow$ badge updates back to "Online" and server confirms position.

#### Test Case 4.4: Cross-Device Multi-Client Sync (Mac & Android)
* **Steps**:
  1. Log into the same account (`teste@teste.com`) on both the macOS desktop client (`npm run tauri dev`) and connected Android device (`app-universal-debug.apk`).
  2. Upload a new PDF/EPUB on Android $\rightarrow$ verify it appears automatically on the macOS library within 3 seconds without refreshing.
  3. Upload a new PDF/EPUB on macOS $\rightarrow$ verify it appears automatically on the Android library within 3 seconds.
  4. Open a book on Android and advance to page 7.
  5. Return to library on Android and open the same book on macOS $\rightarrow$ verify it opens directly on page 7.
  6. Advance to page 15 on macOS.
  7. Return to library on macOS and open the book on Android $\rightarrow$ verify it opens directly on page 15.

#### Test Case 4.5: Android 16 KB Page Size Compatibility Verification
* **Steps**:
  1. Inspect ELF alignment of native shared libraries:
     ```bash
     $NDK_HOME/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-readelf -l client/src-tauri/target/aarch64-linux-android/debug/libclient_lib.so | grep -E "LOAD|Align"
     ```
  2. Verify `Align` value on all `LOAD` segments is `0x4000` (16 KB) or `0x10000` (64 KB).
  3. Launch app on an Android 15 / 16 KB page-size kernel device $\rightarrow$ verify no ELF alignment or 16 KB compatibility warnings appear.
