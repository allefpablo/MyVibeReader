# Connecting Tauri Clients to the Remote Backend (`client-remote-configuration.md`)

This guide explains step-by-step how to point your **MyVibeReader** client applications (macOS Desktop and Android Mobile) to your remote backend deployed on Render (or any cloud server).

---

## 1. How Client-Server Communication Works

In MyVibeReader, all network communication passes through the API service layer in [`client/src/services/api.ts`](client/src/services/api.ts):

```typescript
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
```

* **Build-Time Inlining:** Vite statically injects the value of `VITE_API_URL` into the compiled frontend JavaScript bundle during compilation (`npm run build` or `tauri build`).
* **The `/api` Requirement:** All server endpoints (`/api/auth/**`, `/api/books/**`, `/api/progress/**`) live under the `/api` prefix. Your remote URL **must include `/api`** at the end.
* **Tauri Security (CSP):** The Content Security Policy in [`client/src-tauri/tauri.conf.json`](client/src-tauri/tauri.conf.json) already includes `connect-src ... https:;`, which allows secure HTTPS traffic to any remote domain out of the box.

---

## 2. Prerequisites: Get Your Render Server URL

1. Log into your [Render Dashboard](https://dashboard.render.com).
2. Click on your web service: **`myvibereader-server`**.
3. At the top of the page, copy the service URL. It looks like:
   ```
   https://myvibereader-server.onrender.com
   ```
4. Append `/api` to this URL. This is your target API base URL:
   ```
   https://myvibereader-server.onrender.com/api
   ```

---

## 3. Step-by-Step Instructions

### Step 1: Configure the Environment File

In your terminal, navigate to the `client/` directory and create (or update) the `.env` file:

```bash
cd client
```

Create or edit `client/.env`:

```env
# Point to your live Render backend
VITE_API_URL=https://myvibereader-server.onrender.com/api
```

*(Replace `myvibereader-server.onrender.com` with your actual Render service domain).*

> [!TIP]
> **Environment File Priority:**
> * `client/.env`: Loaded in all environments (development and production builds).
> * `client/.env.production`: If created, takes precedence during production builds (`npm run build` / `npm run tauri build`).

---

### Step 2: Run macOS Desktop in Development Mode (Optional)

If you want to run the desktop client in development mode while communicating with the remote server:

```bash
cd client
npm run tauri dev
```

* The native macOS window will open.
* Any actions (register, login, upload book, sync progress) will talk directly to your remote Render server over HTTPS.

---

### Step 3: Build the Production macOS Desktop App

To build a standalone production application (`.dmg` installer and `.app` bundle):

```bash
cd client
npm run tauri build
```

**Where to find the built app:**
* Installer DMG: `client/src-tauri/target/release/bundle/dmg/client_0.3.0_x64.dmg` (or `aarch64` on Apple Silicon)
* Standalone `.app`: `client/src-tauri/target/release/bundle/macos/client.app`

You can drag `client.app` directly into your macOS `/Applications` folder.

---

### Step 4: Build and Install the Android Mobile App

When pointing to a remote server, Android devices connect over the internet (Wi-Fi or cellular).

> [!IMPORTANT]
> **No more port forwarding needed!**
> Previously with a local backend, you had to run `adb reverse tcp:8080 tcp:8080`. With the remote Render backend, this is **no longer required**.

#### 1. Compile the Debug APK:
```bash
cd client
npx tauri android build --debug --apk
```

*(For target-specific builds such as ARM64: `npx tauri android build --debug --apk --target aarch64-linux-android`)*

#### 2. Install onto Your Connected Android Device:
Connect your Android phone via USB (with USB Debugging enabled) and run:

```bash
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

Open the app on your phone. It will connect directly to your remote Render server.

---

## 4. Verification & Testing Checklist

After pointing to the remote server and opening either client:

1. **Test Registration & Login:**
   * On the login screen, switch to **Register** and create an account (e.g. `you@example.com`).
   * If registration succeeds and takes you to the Library page, the connection to PostgreSQL and JWT authentication is working!
2. **Test eBook Upload (S3 Verification):**
   * Click **Upload Book** and select an EPUB or PDF file.
   * If the book appears in the library with a cover thumbnail, AWS S3 storage is operating correctly.
3. **Test Cross-Device Reading Sync:**
   * Open the book on the desktop app and read to page 15 (or chapter 2).
   * Close the reader or return to the library.
   * Open the same book on your Android phone $\rightarrow$ it will automatically sync and resume at the exact same reading position.

---

## 5. Important Things to Keep in Mind

### 1. Render Free Tier Spin-Down (Cold Starts)
* On Render's Free tier, the web service spins down after **15 minutes of inactivity**.
* **What you will notice:** When you open the client after the server has been asleep, the initial login or request may take **40–50 seconds** to respond while Render wakes the container.
* Once awake, all subsequent interactions respond in milliseconds.
* If you want zero cold starts (24/7 instant response), upgrade the Web Service to Render's **Starter** tier ($7/mo).

### 2. Re-compiling When Changing URLs
Because Vite bakes `VITE_API_URL` directly into the JavaScript binary during compilation:
* If you ever change your domain or move to a custom domain, update `client/.env` and re-run `npm run tauri build` (or `npx tauri android build`).
