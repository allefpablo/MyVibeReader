# Deploying MyVibeReader Backend to Render (`render-deployment.md`)

This guide provides an end-to-end walkthrough for deploying the **MyVibeReader** Spring Boot 3.4 backend to [Render](https://render.com). It covers codebase preparation (CORS, port binding, containerization), secrets management (AWS S3 & PostgreSQL), Infrastructure as Code (`render.yaml` Blueprint), deployment execution via the Render Dashboard, and connecting the native Tauri desktop and mobile clients.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          Tauri Clients                          │
│   • macOS Desktop (tauri://localhost)                           │
│   • Android App (https://tauri.localhost / http://tauri.localhost)│
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS / WSS
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Render Web Service (Cloud)                   │
│   • Spring Boot 3.4 (Java 21 / Eclipse Temurin)                │
│   • Exposes REST API & /actuator/health on $PORT               │
│   • Stateless JWT Authentication (HMAC-SHA256)                 │
└───────────────┬─────────────────────────────────┬───────────────┘
                │ JDBC (TLS)                      │ AWS SDK v2
                ▼                                 ▼
┌───────────────────────────────┐ ┌───────────────────────────────┐
│    Render PostgreSQL DB       │ │        AWS S3 Bucket          │
│   • User credentials          │ │   • Encrypted PDF & EPUB files│
│   • Book metadata             │ │   • Key: {userId}/{bookId}.ext│
│   • Reading progress sync     │ └───────────────────────────────┘
└───────────────────────────────┘
```

---

## Quickstart: Step-by-Step Deployment Walkthrough

Follow these 4 concise steps to deploy the backend to Render and connect your clients:

### Step 1: Push Changes to GitHub
Stage and commit the Render Blueprint (`render.yaml`), port binding, and deployment documentation:
```bash
git add render.yaml render-deployment.md server/src/main/resources/application.yml
git commit -m "feat(deploy): configure render deployment blueprint and port binding"
git push origin main
```

### Step 2: Deploy via Render Blueprint
1. Go to [dashboard.render.com](https://dashboard.render.com) and sign in.
2. Click **New +** in the top navigation and select **Blueprint**.
3. Connect your GitHub repository (`allefpablo/MyVibeReader`).
4. Render automatically parses [**`render.yaml`**](file:///Users/allefpablo/code/MyVibeReader/render.yaml) and detects both the `myvibereader-server` Web Service and `myvibereader-db` PostgreSQL database.
5. Provide your AWS S3 credentials when prompted:
   - `S3_BUCKET_NAME`: Name of your AWS S3 bucket
   - `AWS_ACCESS_KEY_ID`: Your AWS IAM access key ID
   - `AWS_SECRET_ACCESS_KEY`: Your AWS IAM secret key
6. Click **Apply**. Render will provision PostgreSQL, build the multi-stage Docker container, inject environment variables, and launch the service.

### Step 3: Verify Deployment Health
Once the deployment status shows **Live**, test your endpoint in terminal:
```bash
curl -i https://<your-service-name>.onrender.com/actuator/health
```
*Expected response:*
```http
HTTP/2 200
content-type: application/vnd.spring-boot.actuator.v3+json

{"status":"UP"}
```

### Step 4: Connect the Tauri Clients (macOS & Android)
Update [`client/.env`](file:///Users/allefpablo/code/MyVibeReader/client/.env) with your live Render URL (always appending `/api`):
```env
VITE_API_URL=https://<your-service-name>.onrender.com/api
```
Rebuild your client:
* **macOS Desktop App**:
  ```bash
  cd client && npm run tauri build
  ```
* **Android APK**:
  ```bash
  cd client && npx tauri android build --debug --apk
  adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
  ```

*(Note: On Android, you no longer need `adb reverse tcp:8080 tcp:8080` since the application connects directly to the live Render HTTPS endpoint over the internet).*

---

## 1. Codebase Preparation

### 1.1 Port Binding Configuration

Render dynamically assigns an HTTP port to your web service via the standard `PORT` environment variable (typically `10000`). By default, Spring Boot inspects `SERVER_PORT` or defaults to `8080`.

To guarantee that Spring Boot automatically binds to Render's port without requiring command-line overrides, ensure that [`server/src/main/resources/application.yml`](file:///Users/allefpablo/code/MyVibeReader/server/src/main/resources/application.yml) contains:

```yaml
server:
  port: ${PORT:${SERVER_PORT:8080}}
```

*Explanation*: Spring evaluates `${PORT}` first. If Render sets `PORT=10000`, Spring Boot listens on `10000`. If `PORT` is unset (such as in local development or Docker compose), it falls back to `SERVER_PORT` or `8080`.

---

### 1.2 CORS Configuration for Tauri Clients

Tauri applications make API requests originating from custom protocol schemes rather than traditional web domains. If CORS is not configured, cross-device synchronization and authentication requests will be blocked by the browser engine (WebKit on macOS, Android System WebView on Android).

In MyVibeReader, [`server/src/main/java/com/myvibereader/config/SecurityConfig.java`](file:///Users/allefpablo/code/MyVibeReader/server/src/main/java/com/myvibereader/config/SecurityConfig.java) defines allowed origins:

```java
@Bean
public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration configuration = new CorsConfiguration();

    // Default origins for development and native Tauri clients
    List<String> allowedOrigins = new ArrayList<>(List.of(
            "http://localhost:1420",     // Vite Dev Server (Desktop)
            "http://localhost:5173",     // Vite Preview
            "http://127.0.0.1:1420",
            "http://127.0.0.1:5173",
            "tauri://localhost",         // Tauri v2 macOS / Linux / Windows
            "https://tauri.localhost",   // Tauri v2 Android / iOS (HTTPS scheme)
            "http://tauri.localhost"     // Tauri v2 Android fallback (HTTP scheme)
    ));

    // Dynamic origin injection via CORS_ALLOWED_ORIGINS env variable
    if (customOrigins != null && !customOrigins.isBlank()) {
        for (String origin : customOrigins.split(",")) {
            String trimmed = origin.trim();
            if (!trimmed.isEmpty()) {
                allowedOrigins.add(trimmed);
            }
        }
    }

    configuration.setAllowedOriginPatterns(allowedOrigins);
    configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
    configuration.setAllowedHeaders(List.of("*"));
    configuration.setAllowCredentials(true);

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", configuration);
    return source;
}
```

> [!TIP]
> If you deploy a web-based client or custom domain later, you can whitelist its domain in Render without modifying code by adding it to the `CORS_ALLOWED_ORIGINS` environment variable (e.g. `https://reader.yourdomain.com`).

---

### 1.3 Database Hibernate DDL Strategy

In [`server/src/main/resources/application.yml`](file:///Users/allefpablo/code/MyVibeReader/server/src/main/resources/application.yml), the default DDL strategy is `ddl-auto: validate`. For a freshly provisioned Render PostgreSQL database, Hibernate must initialize the tables (`users`, `books`, `reading_progress`) on first boot.

Set the following environment variable in Render (or in `render.yaml`):
```env
SPRING_JPA_HIBERNATE_DDL_AUTO=update
```
`update` inspects the existing database schema, creates any missing tables or columns without dropping existing data, and persists reading progress safely across server restarts.

---

### 1.4 Packaging Strategy

You can package and deploy MyVibeReader to Render using either **Docker Runtime (Recommended)** or **Native Java Environment**.

#### Strategy A: Docker Runtime (Recommended)

Render natively builds multi-stage Dockerfiles. This ensures identical runtime behavior between local development, CI/CD, and production.

The repository includes an optimized multi-stage [`server/Dockerfile`](file:///Users/allefpablo/code/MyVibeReader/server/Dockerfile):

```dockerfile
# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21-alpine AS builder

WORKDIR /build

# 1. Cache Maven dependencies separately from application source code
COPY pom.xml .
RUN mvn dependency:go-offline -q

# 2. Compile and package the Spring Boot executable JAR
COPY src ./src
RUN mvn clean package -DskipTests -q

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine AS runtime

# Run as non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /build/target/*.jar app.jar

USER appuser

EXPOSE 8080

# Tune JVM heap memory to fit within Render container limits (512MB on Free tier)
ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -Dserver.port=${PORT:-8080} -jar app.jar"]
```

**Why this Dockerfile is optimized for Render:**
1. **Dependency Layer Caching:** `pom.xml` is copied and cached before copying `src`, so re-deployments with code changes take under 30 seconds.
2. **Alpine JRE Footprint:** Uses `eclipse-temurin:21-jre-alpine`, producing an image under 180MB.
3. **Container-Aware JVM Tuning:** `-XX:+UseContainerSupport` and `-XX:MaxRAMPercentage=75.0` prevent Java from exceeding Render's 512MB container RAM limit, avoiding cgroup OOM (Out Of Memory) kills.
4. **Dynamic Port Binding:** Passes `-Dserver.port=${PORT:-8080}` directly to the JVM entrypoint.

#### Strategy B: Render Native Java Environment

If you prefer deploying without Docker:
* **Root Directory:** `server`
* **Environment:** `Java` (Render supports Java 21 via `JAVA_VERSION=21.0.2`)
* **Build Command:** `./mvnw clean package -DskipTests`
* **Start Command:** `java -XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -Dserver.port=$PORT -jar target/server-0.0.1-SNAPSHOT.jar`

---

## 2. Environment & Secrets Management

MyVibeReader requires database connection details, AWS S3 storage credentials, and cryptographic signing keys.

### 2.1 Environment Variable Reference

| Variable Name | Required | Example / Default Value | Purpose |
|---|---|---|---|
| `PORT` | Auto by Render | `10000` | Port assigned by Render for incoming web traffic. |
| `SERVER_PORT` | Optional | `10000` | Matches `PORT` for Spring Boot compatibility. |
| `SPRING_PROFILES_ACTIVE` | Yes | `production` | Active profile identifier. |
| `SPRING_JPA_HIBERNATE_DDL_AUTO` | Yes | `update` | Automatically creates tables on fresh database. |
| `DB_HOST` | Yes | `dpg-xxxx-a.oregon-postgres.render.com` | Hostname of Render PostgreSQL instance. |
| `DB_PORT` | Yes | `5432` | PostgreSQL port. |
| `DB_NAME` | Yes | `myvibereader` | PostgreSQL database name. |
| `SPRING_DATASOURCE_USERNAME` | Yes | `myvibereader` | PostgreSQL username. |
| `SPRING_DATASOURCE_PASSWORD` | Yes (Secret) | `(generated password)` | PostgreSQL password. |
| `JWT_SECRET` | Yes (Secret) | `64+ char random string` | 256-bit secret key for HMAC-SHA256 JWT tokens. |
| `JWT_EXPIRATION_MS` | Optional | `86400000` | Token lifetime (default: 24 hours). |
| `S3_BUCKET_NAME` | Yes | `myvibereader-storage` | AWS S3 bucket name for PDF and EPUB files. |
| `AWS_REGION` | Yes | `us-east-1` | AWS region where the bucket resides. |
| `AWS_ACCESS_KEY_ID` | Yes (Secret) | `AKIAIOSFODNN7EXAMPLE` | IAM access key with S3 read/write permissions. |
| `AWS_SECRET_ACCESS_KEY` | Yes (Secret) | `wJalrXUtnFEMI/K7MDENG/bPxRfiCY` | IAM secret access key. |
| `S3_ENDPOINT` | Optional | ` ` | Custom S3 endpoint (leave empty for AWS S3). |
| `CORS_ALLOWED_ORIGINS` | Optional | `tauri://localhost,https://tauri.localhost` | Whitelisted client origins. |

---

### 2.2 PostgreSQL Connection Handling on Render

> [!IMPORTANT]
> **The Spring Boot JDBC URL Gotcha:**
> Render outputs an `Internal Database URL` formatted as `postgres://user:pass@host:5432/dbname`.
> Spring Boot and HikariCP **require** the JDBC protocol prefix: `jdbc:postgresql://host:5432/dbname`.
> 
> In MyVibeReader, [`server/src/main/resources/application.yml`](file:///Users/allefpablo/code/MyVibeReader/server/src/main/resources/application.yml) is structured as:
> ```yaml
> spring:
>   datasource:
>     url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:myvibereader}}
>     username: ${SPRING_DATASOURCE_USERNAME:myvibereader}
>     password: ${SPRING_DATASOURCE_PASSWORD:myvibereader}
> ```
> By populating `DB_HOST`, `DB_PORT`, `DB_NAME`, `SPRING_DATASOURCE_USERNAME`, and `SPRING_DATASOURCE_PASSWORD` (or using Render's `fromDatabase` blueprint syntax), Spring constructs the valid JDBC URL automatically.

---

### 2.3 AWS S3 Least-Privilege IAM Policy

Create a dedicated IAM user in AWS and attach the following minimal policy scoped strictly to your bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "MyVibeReaderS3Access",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::myvibereader-storage/*"
    },
    {
      "Sid": "MyVibeReaderBucketListing",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::myvibereader-storage"
    }
  ]
}
```

---

## 3. Infrastructure as Code: `render.yaml` Blueprint

Render supports declarative Infrastructure as Code via Blueprints. Adding a `render.yaml` file in the root of the repository allows you to provision both the **Spring Boot Web Service** and the **PostgreSQL Database** in a single click.

Create `render.yaml` in the root of the repository:

```yaml
services:
  # ──────────────────────────────────────────────────────────────────────────
  # Web Service: Spring Boot REST API
  # ──────────────────────────────────────────────────────────────────────────
  - type: web
    name: myvibereader-server
    runtime: docker
    rootDir: server # Monorepo: sets context to the server directory
    dockerfilePath: Dockerfile # Relative to rootDir
    dockerContext: . # Relative to rootDir (builds inside server/)
    plan: free # Change to starter / standard for 24/7 uptime without sleep
    region: oregon # Must match PostgreSQL region
    healthCheckPath: /actuator/health
    autoDeploy: true

    envVars:
      - key: PORT
        value: 10000
      - key: SERVER_PORT
        value: 10000
      - key: SPRING_PROFILES_ACTIVE
        value: production
      - key: SPRING_JPA_HIBERNATE_DDL_AUTO
        value: update

      # Database binding from Render managed PostgreSQL
      - key: DB_HOST
        fromDatabase:
          name: myvibereader-db
          property: host
      - key: DB_PORT
        fromDatabase:
          name: myvibereader-db
          property: port
      - key: DB_NAME
        fromDatabase:
          name: myvibereader-db
          property: database
      - key: SPRING_DATASOURCE_USERNAME
        fromDatabase:
          name: myvibereader-db
          property: user
      - key: SPRING_DATASOURCE_PASSWORD
        fromDatabase:
          name: myvibereader-db
          property: password

      # Cryptographic security
      - key: JWT_SECRET
        generateValue: true # Generates a secure random 256-bit string
      - key: JWT_EXPIRATION_MS
        value: 86400000 # 24 hours in milliseconds

      # S3 Object Storage (Prompted for input during Blueprint creation)
      - key: S3_BUCKET_NAME
        sync: false
      - key: AWS_REGION
        value: us-east-1
      - key: AWS_ACCESS_KEY_ID
        sync: false
      - key: AWS_SECRET_ACCESS_KEY
        sync: false
      - key: S3_ENDPOINT
        value: ""

      # Client CORS rules
      - key: CORS_ALLOWED_ORIGINS
        value: "tauri://localhost,https://tauri.localhost,http://tauri.localhost"

# ──────────────────────────────────────────────────────────────────────────
# Managed PostgreSQL Database
# ──────────────────────────────────────────────────────────────────────────
databases:
  - name: myvibereader-db
    databaseName: myvibereader
    user: myvibereader
    plan: free # Free tier valid for 30 days or starter tier for permanent persistence
    region: oregon
```

---

## 4. Deployment Execution

You can deploy using either the **Blueprint method (fastest)** or the **Manual Dashboard method**.

### Method 1: Deploy with Blueprint (Recommended)

1. **Push Changes to GitHub:**
   Commit the `render.yaml` file to your GitHub repository:
   ```bash
   git add render.yaml
   git commit -m "feat(infra): add render.yaml deployment blueprint"
   git push origin main
   ```
2. **Open Render Dashboard:**
   Go to [dashboard.render.com](https://dashboard.render.com).
3. **Create Blueprint Instance:**
   - Click **New +** in the top navigation and select **Blueprint**.
   - Connect your GitHub repository (`allefpablo/MyVibeReader`).
   - Render detects `render.yaml` and parses both the `myvibereader-server` web service and `myvibereader-db` PostgreSQL instance.
4. **Provide Required S3 Secrets:**
   Render will prompt you to enter the `sync: false` variables:
   - `S3_BUCKET_NAME`: Your AWS S3 bucket name.
   - `AWS_ACCESS_KEY_ID`: Your AWS IAM access key.
   - `AWS_SECRET_ACCESS_KEY`: Your AWS IAM secret key.
5. **Click Apply:**
   Render provisions the database, builds the Docker container, injects all secrets, and launches your service.

---

### Method 2: Deploy Manually via Render Dashboard

If you prefer setting up services individually through the UI:

#### Step 1: Create the Managed PostgreSQL Database
1. In the Render Dashboard, click **New +** $\rightarrow$ **PostgreSQL**.
2. Set the following options:
   - **Name:** `myvibereader-db`
   - **Database:** `myvibereader`
   - **User:** `myvibereader`
   - **Region:** Choose your preferred region (e.g., `Oregon (US West)`).
   - **Instance Type:** `Free` or `Starter`.
3. Click **Create Database**.
4. Once provisioned, note down the **Hostname**, **Port**, **Database**, **Username**, and **Password** from the **Connections** panel.

#### Step 2: Create the Web Service
1. Click **New +** $\rightarrow$ **Web Service**.
2. Connect your Git repository.
3. Select **Docker** as the Runtime:
   - **Name:** `myvibereader-server`
   - **Region:** Must match the PostgreSQL database region.
   - **Branch:** `main`
   - **Root Directory:** `server`
   - **Dockerfile Path:** `./server/Dockerfile` (or `Dockerfile` if Root Directory is `server`)
   - **Instance Type:** `Free` or `Starter`.
4. Expand **Advanced** and set **Health Check Path** to:
   ```
   /actuator/health
   ```
5. Click **Add Environment Variable** and add all variables from Section 2.1:
   - `PORT`: `10000`
   - `SPRING_PROFILES_ACTIVE`: `production`
   - `SPRING_JPA_HIBERNATE_DDL_AUTO`: `update`
   - `DB_HOST`: *(From database Connections panel)*
   - `DB_PORT`: `5432`
   - `DB_NAME`: `myvibereader`
   - `SPRING_DATASOURCE_USERNAME`: `myvibereader`
   - `SPRING_DATASOURCE_PASSWORD`: *(From database Connections panel)*
   - `JWT_SECRET`: *(Generate via `openssl rand -base64 48`)*
   - `JWT_EXPIRATION_MS`: `86400000`
   - `S3_BUCKET_NAME`: *(Your S3 bucket)*
   - `AWS_REGION`: `us-east-1`
   - `AWS_ACCESS_KEY_ID`: *(Your AWS key)*
   - `AWS_SECRET_ACCESS_KEY`: *(Your AWS secret)*
   - `CORS_ALLOWED_ORIGINS`: `tauri://localhost,https://tauri.localhost,http://tauri.localhost`
6. Click **Create Web Service**.

---

## 5. Post-Deployment Verification & Client Configuration

### 5.1 Verification Checklist

Once the deployment shows **Live** in Render, your service URL will resemble:
`https://myvibereader-server.onrender.com`

#### 1. Verify Health Endpoint
Run in terminal:
```bash
curl -i https://myvibereader-server.onrender.com/actuator/health
```
**Expected Response:**
```http
HTTP/2 200
content-type: application/vnd.spring-boot.actuator.v3+json

{"status":"UP"}
```

#### 2. Verify CORS Preflight Header
Test the CORS headers matching the Tauri origin:
```bash
curl -i -X OPTIONS https://myvibereader-server.onrender.com/api/auth/login \
  -H "Origin: https://tauri.localhost" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type"
```
**Expected Response:**
```http
HTTP/2 200
access-control-allow-origin: https://tauri.localhost
access-control-allow-credentials: true
access-control-allow-methods: GET,POST,PUT,DELETE,OPTIONS
```

#### 3. Test Authentication Endpoint
Register a test account via the API:
```bash
curl -i -X POST https://myvibereader-server.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePassword123!"}'
```
**Expected Response:** HTTP 200 with JWT authentication token.

---

### 5.2 Updating the Tauri Clients

The frontend client reads its base API URL from the `VITE_API_URL` environment variable defined in [`client/src/services/api.ts`](file:///Users/allefpablo/code/MyVibeReader/client/src/services/api.ts):

```typescript
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
```

> [!WARNING]
> Remember to append `/api` to your Render service URL!

#### Step 1: Update `client/.env`
Create or edit `client/.env`:
```env
VITE_API_URL=https://myvibereader-server.onrender.com/api
```

#### Step 2: Verify Tauri Content Security Policy (CSP)
Check [`client/src-tauri/tauri.conf.json`](file:///Users/allefpablo/code/MyVibeReader/client/src-tauri/tauri.conf.json) line 21:
```json
"csp": "default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline' blob:; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://localhost:8080 http://127.0.0.1:8080 https:; worker-src 'self' blob:; frame-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self' blob:;"
```
Notice `connect-src 'self' ... https:;`. Because `https:` is already permitted, requests to `https://myvibereader-server.onrender.com` are allowed without modifying `tauri.conf.json`.

#### Step 3: Compile and Test Clients

1. **Local Desktop Dev with Live Backend:**
   ```bash
   cd client
   npm run tauri dev
   ```
2. **Build Production macOS Desktop App:**
   ```bash
   cd client
   npm run tauri build
   ```
   *The built DMG/app will be saved to `client/src-tauri/target/release/bundle/`.*

3. **Build Android APK:**
   ```bash
   cd client
   npx tauri android build --debug --apk
   ```
   *Install on connected phone:*
   ```bash
   adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
   ```
   *(Note: You no longer need `adb reverse tcp:8080 tcp:8080` since the app connects directly to the live Render HTTPS endpoint).*

---

## 6. Production Considerations & Troubleshooting

### Free Tier Spin-Down (Cold Starts)
- **Behavior:** Render's Free Web Service spins down to zero after 15 minutes of inactivity.
- **Impact:** The first request after sleep may take 40–50 seconds while the container initializes. Subsequent requests respond instantly.
- **Solution:** For production usage without cold starts, upgrade the Web Service to Render's **Starter** tier ($7/mo).

### 30MB File Uploads
- MyVibeReader enforces a 30MB maximum ebook file upload limit.
- Render's HTTP reverse proxy supports streaming file uploads of this size with zero configuration.
- AWS S3 streaming upload in [`BookService.java`](file:///Users/allefpablo/code/MyVibeReader/server/src/main/java/com/myvibereader/service/BookService.java) streams directly from the multipart stream to S3, keeping JVM memory consumption minimal.

### Monorepo Structure: Root `render.yaml` vs `server/` Directory

If you encounter build errors like `stat pom.xml: file not found` or `Dockerfile not found`, check the following rules:

1. **`render.yaml` location:**
   - **Must be in the repository root (`/render.yaml`)**. Render's Blueprint engine *only* discovers Blueprints placed in the root of the repository. Do not move it into `server/`.
2. **Directory resolution in Blueprints (`render.yaml`):**
   - By declaring `rootDir: server`, all subsequent paths are evaluated *relative to the `server/` folder*.
   - Therefore, configure:
     ```yaml
     rootDir: server
     dockerfilePath: Dockerfile   # NOT ./server/Dockerfile
     dockerContext: .             # NOT ./server
     ```
   - If `rootDir` was omitted, Docker's build context would default to the repo root `/`, and the Dockerfile command `COPY pom.xml .` would look for `pom.xml` in the repository root rather than `server/pom.xml`, causing the build to fail immediately.
3. **Manual Dashboard Setup path conflict:**
   - If you configure the Web Service manually via the Render Dashboard and set **Root Directory** to `server`, make sure **Dockerfile Path** is set to `Dockerfile` (or `./Dockerfile`).
   - If you mistakenly set it to `./server/Dockerfile` while **Root Directory** is `server`, Render looks for `server/server/Dockerfile`, which fails with `Dockerfile not found`.
4. **Always commit and push changes:**
   - Render deploys from your remote GitHub branch (`origin/main`). Local uncommitted changes to `render.yaml` or `application.yml` are not visible to Render until you run:
     ```bash
     git add render.yaml render-deployment.md server/src/main/resources/application.yml
     git commit -m "fix(render): configure monorepo rootDir and relative docker paths"
     git push origin main
     ```
