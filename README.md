# VidLoader Studio ⚡

A high-speed, secure, and privacy-focused **Universal Social Media Video & Audio Downloader Suite**, comprising:
1. **Full-Stack Web Application**: High-speed extraction backend and modern obsidian studio web dashboard.
2. **Progressive Web App (PWA)**: Installable on iOS, Android, macOS, and Windows.
3. **Browser Extension (Manifest V3)**: 1-click floating downloads on YouTube, TikTok, Instagram, Twitter/X, and Reddit.

---

## 🌟 Key Features

- **Direct Clean Rips**: Native Full HD 1080p, 2K, and 4K MP4 downloads from YouTube, TikTok (no watermark), Instagram Reels, Twitter/X, and Reddit.
- **Lossless Audio Extraction**: Dedicated MP3 HQ (320kbps) and M4A audio extraction with automatic metadata tagging.
- **Local FFmpeg Processing**: Combines video and audio streams into clean universal containers on the fly.
- **Concurrency & Resource Queue**: Worker-managed download queue preventing CPU and memory exhaustion under concurrent loads.
- **Job-Isolated Filenames**: Embedded UUID/job identifiers preventing race condition collisions between simultaneous downloads.
- **Enterprise-Grade Security**:
  - **SSRF & DNS Rebinding Protection**: Validates against loopback, private CIDR ranges, and cloud metadata endpoints.
  - **Memory-Safe Rate Limiter**: Auto-evicting TTL in-memory rate limiter protecting against scrapers without heap leaks.
  - **Path Traversal Guards**: Restricts file delivery strictly to temporary ephemeral downloads.
  - **Automated Disk Cleanup**: Background worker purges temporary files older than 15 minutes.
- **Complete SEO Engine**:
  - Open Graph & Twitter Summary Cards with custom 1200x630 studio feature banner.
  - Schema.org `WebApplication` and `FAQPage` structured data for Google rich snippets.
- **PWA & Mobile-First**: Touch-friendly command bar, horizontal platform carousel, and service worker caching.

---

## 📂 Project Structure

```
vidloader/
├── bin/
│   └── yt-dlp / yt-dlp.exe        # Extraction engine binary (Linux/macOS/Windows)
├── services/
│   ├── downloader.js              # yt-dlp & FFmpeg execution wrapper with concurrency queue
│   └── security.js                # SSRF filter, DNS rebinding guard & TTL rate limiter
├── public/                        # Web Dashboard & PWA Frontend
│   ├── css/
│   │   └── style.css              # Obsidian studio design system & mobile queries
│   ├── js/
│   │   └── app.js                 # Frontend controller, PWA installer & SSE listener
│   ├── images/
│   │   ├── logo.jpg               # Brand logo
│   │   └── og-feature.jpg         # 1200x630 Open Graph banner
│   ├── icons/                     # True PNG PWA icons (192, 512, maskable)
│   ├── manifest.json              # PWA Web App Manifest
│   ├── sw.js                      # Service Worker for offline shell caching
│   ├── index.html                 # Semantic HTML5 UI with JSON-LD SEO schema
│   └── vidloader-extension.zip    # Bundled Manifest V3 extension package
├── extension/                     # Manifest V3 Browser Extension Source
│   ├── manifest.json              # Extension manifest & permissions
│   ├── popup.html / popup.js      # Auto tab-detect popup with format selector
│   ├── content.js / content.css   # In-page floating "⚡ Download" button
│   ├── background.js              # Context menu & download dispatcher
│   └── icons/                     # True PNG extension icons (16, 48, 128)
├── ecosystem.config.js            # PM2 production process configuration
├── .env.example                   # Environment configuration template
├── server.js                      # Express API & static server
├── package.json                   # Node dependencies & start scripts
└── README.md
```

---

## 🚀 Deployment & Operations

### 1. Environment Configuration

Copy the example environment file:
```bash
cp .env.example .env
```

Adjust any settings in `.env` if desired (such as `PORT`, `CORS_ORIGIN`, or `MAX_CONCURRENT_DOWNLOADS`).

---

### 2. Running with PM2 (Production)

Ensure PM2 is installed globally:
```bash
npm install -g pm2
```

Start the application with PM2:
```bash
npm run pm2:start
```

Check status, logs, and process management:
```bash
npm run pm2:status    # View running status and resource usage
npm run pm2:logs      # View live application logs
npm run pm2:reload    # Gracefully reload the application
npm run pm2:stop      # Stop the application
```

To configure PM2 to automatically restart VidLoader on system reboot:
```bash
pm2 startup
pm2 save
```

---

### 3. Local Development Mode

```bash
npm run dev
```

Navigate to:
- **Web App:** [http://localhost:3333](http://localhost:3333)
- **API Health:** [http://localhost:3333/api/health](http://localhost:3333/api/health)

---

### 4. Automated CI/CD (GitHub Actions)

A preconfigured workflow is located at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). It is configured to run **manually on-demand** from the GitHub **Actions** tab ("Run workflow" button) so you have full control over when to deploy. When triggered, it will:
1. Validate JS syntax and dependencies.
2. Connect to your VPS via SSH using username and password.
3. Pull the latest code, install dependencies with `pnpm`, set permissions, and reload the PM2 process with zero downtime.

#### Required GitHub Secrets:
Go to your repository on GitHub: **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**:

| Secret Name | Description | Example |
| :--- | :--- | :--- |
| `VPS_HOST` | IP address or domain of your VPS | `192.0.2.1` or `api.yourdomain.com` |
| `VPS_USERNAME` | SSH username | `root` or `ubuntu` |
| `VPS_PASSWORD` | SSH password for that user | `YourSecurePassword123` |
| `VPS_PORT` | *(Optional)* SSH port (defaults to 22) | `22` |
| `VPS_TARGET_DIR` | *(Optional)* Destination folder on VPS | `/var/www/vidloader` |

---

### 5. Install the Browser Extension

1. Download [`vidloader-extension.zip`](public/vidloader-extension.zip) from the dashboard or use the `extension/` folder directly.
2. Open Chrome, Edge, or Brave and navigate to `chrome://extensions/`.
3. Toggle on **Developer mode** (top right).
4. Click **Load unpacked** and select the `extension/` directory.
