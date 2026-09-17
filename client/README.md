# MyVibeReader Client (`client/`)

The cross-platform frontend client for **MyVibeReader**, built with **React 19**, **TypeScript**, **Tailwind CSS v4**, and **Tauri v2 (Rust)**. It runs natively on **macOS Desktop** and **Android Mobile** with full offline reading and background synchronization.

---

## 1. Connecting to a Remote Backend Server

By default in development, the client connects to `http://localhost:8080/api`. To connect to a remote server (such as **Render**, **DigitalOcean**, or your own cloud deployment):

### Method A: Build-Time Inlining via `.env` (Recommended)

Create or edit `client/.env`:

```env
# URL to your remote Spring Boot backend (MUST end with /api)
VITE_API_URL=https://<your-remote-host>/api
```

#### Examples:
* **Render Deployment:**
  ```env
  VITE_API_URL=https://myvibereader-server.onrender.com/api
  ```
* **DigitalOcean Droplet / Custom Domain:**
  ```env
  VITE_API_URL=https://reader.yourdomain.com/api
  ```

> [!IMPORTANT]
> **Always append `/api`:** All Spring Boot REST endpoints (`/api/auth/**`, `/api/books/**`, `/api/progress/**`) are mounted under the `/api` route.
>
> **Build-Time Inlining:** Vite bakes `VITE_API_URL` directly into the compiled JavaScript bundle during `npm run build`, `npm run tauri build`, and `npx tauri android build`.

### Method B: Runtime Dynamic Override (No Re-compilation)

You can also dynamically override the backend URL at runtime (via developer tools or client settings) without rebuilding:

```javascript
import { api } from './services/api';

// Set a custom remote or local URL
api.setBaseUrl('https://myvibereader-server.onrender.com/api');

// Check current active URL
console.log(api.getBaseUrl());

// Reset back to the build-time default
api.setBaseUrl('');
```

This persists your custom URL in `localStorage` under the key `myvibereader_api_url`.

---

## 2. Running & Building Applications

### Development Mode

```bash
# Web-only dev server (fastest for UI iteration)
npm run dev

# Full Tauri macOS desktop dev mode (compiles Rust + opens native window)
npm run tauri dev
```

### Build Production macOS Desktop Application

```bash
npm run tauri build
```

The compiled standalone app and installer DMG will be located at:
- `.app`: `src-tauri/target/release/bundle/macos/client.app`
- `.dmg`: `src-tauri/target/release/bundle/dmg/`

### Build & Run Native Android App

Android builds require Android SDK 34+, NDK 27+, and Android Rust targets:

```bash
# Initialize Android project structure (first time only)
npm run tauri android init

# Compile debug APK (16 KB page-aligned automatically via src-tauri/build.rs)
npx tauri android build --debug --apk

# Install on connected device via adb
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk

# Launch app on device
adb shell am start -n com.myvibereader/.MainActivity
```

> [!TIP]
> **No USB Port Forwarding Needed for Remote Backends:**
> When pointing to a remote HTTPS backend (e.g. Render or DigitalOcean), `adb reverse tcp:8080 tcp:8080` is **not required**. The phone connects directly over Wi-Fi or cellular data. Port forwarding is only needed when testing against a local backend running on `localhost:8080`.

---

## 3. Testing & Code Quality

```bash
# Run unit tests (Vitest)
npm test

# Check TypeScript types
npx tsc --noEmit
```

---

## 4. Documentation References

- [**`client-remote-configuration.md`**](../client-remote-configuration.md): End-to-end client remote configuration guide.
- [**`render-deployment.md`**](../render-deployment.md): Complete guide for deploying the backend to Render.
- [**`DIGITALOCEAN_DEPLOYMENT.md`**](../DIGITALOCEAN_DEPLOYMENT.md): Complete guide for deploying to DigitalOcean.
- [**`AGENTS.md`**](../AGENTS.md): Architecture conventions and test protocols.
