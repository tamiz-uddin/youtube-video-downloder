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
- **Enterprise-Grade Security**:
  - **SSRF Protection**: Blocks local loopback and cloud instance metadata attacks.
  - **Path Traversal Guards**: Restricts media access strictly to designated download sandbox.
  - **IP Rate Limiting**: In-memory protection against scraper abuse and DoS.
  - **Automated Disk Cleanup**: Background worker purges temporary files older than 2 hours.
- **Complete SEO Engine**:
  - Open Graph & Twitter Summary Cards with custom 1200x630 studio feature banner.
  - Schema.org `WebApplication` and `FAQPage` structured data for Google rich snippets.
- **PWA & Mobile-First**: Touch-friendly command bar, horizontal platform carousel, and service worker caching.

---

## 📂 Project Structure

```
vidloader/
├── bin/
│   └── yt-dlp.exe                 # Extraction engine binary
├── services/
│   ├── downloader.js              # yt-dlp & FFmpeg execution wrapper
│   ├── history.js                 # JSON history store
│   └── security.js                # SSRF filter, IP rate limiter & disk cleaner
├── public/                        # Web Dashboard & PWA Frontend
│   ├── css/
│   │   └── style.css              # Obsidian studio design system & mobile queries
│   ├── js/
│   │   └── app.js                 # Frontend controller, PWA installer & SSE listener
│   ├── images/
│   │   ├── logo.jpg               # Official VidLoader futuristic brand logo
│   │   └── og-feature.jpg         # 1200x630 Open Graph feature banner
│   ├── icons/                     # PWA icons (192, 512, maskable)
│   ├── manifest.json              # PWA Web App Manifest
│   ├── sw.js                      # Service Worker for offline shell caching
│   └── index.html                 # Semantic HTML5 UI with JSON-LD SEO schema
├── extension/                     # Manifest V3 Browser Extension
│   ├── manifest.json              # Extension manifest & permissions
│   ├── popup.html / popup.js      # Auto tab-detect popup with format selector
│   ├── content.js / content.css   # In-page floating "⚡ Download" button
│   ├── background.js              # Context menu & download dispatcher
│   └── icons/                     # Extension icons (16, 48, 128)
├── server.js                      # Express API & static server
├── package.json                   # Node dependencies & start scripts
└── README.md
```

---

## 🚀 Getting Started

### 1. Start the Server

```bash
npm start
```

Navigate to:
- **Web App:** [http://localhost:3000](http://localhost:3000)
- **API Health:** [http://localhost:3000/api/health](http://localhost:3000/api/health)

### 2. Install the Browser Extension

1. Open Chrome, Edge, or Brave and go to `chrome://extensions/`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose:
   `c:\Users\tamiz\Documents\something\extension`
