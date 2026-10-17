require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const {
  identifyPlatform,
  getVideoInfo,
  downloadMedia,
  updateYtDlp,
  formatBytes,
  YT_DLP_PATH,
  FFMPEG_PATH,
  DOWNLOADS_DIR
} = require('./services/downloader');
const { isSafeUrl, rateLimiter, startDiskCleanup } = require('./services/security');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3333;
const HOST = process.env.HOST || '0.0.0.0';

// Enable trust proxy for reverse proxies (Nginx, Cloudflare, Caddy, PM2)
app.set('trust proxy', 1);

// Production Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

// Middleware
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : '*';
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));

// Static file serving with caching
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  etag: true
}));

// Rate Limiter applied to API routes
app.use('/api/', rateLimiter(40, 60 * 1000));

// Safe Static File Delivery with safe deferred purge
app.get('/files/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename);

  // Security guard: never allow accessing hidden or sensitive files
  if (safeFilename.startsWith('.') || safeFilename.endsWith('.json') || safeFilename.endsWith('.js')) {
    return res.status(403).send('Access denied.');
  }

  const filePath = path.join(DOWNLOADS_DIR, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File expired or already downloaded.');
  }

  res.download(filePath, safeFilename, (err) => {
    // Schedule file removal 5 minutes after download initiation to allow completion & retry
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`[AutoPurge] 🧹 Purged temporary server file: ${safeFilename}`);
        }
      } catch (e) {}
    }, 5 * 60 * 1000);
  });
});

// In-memory active download jobs tracking with memory leak prevention
const activeJobs = new Map();

// Periodic sweep for abandoned active jobs older than 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of activeJobs.entries()) {
    if (job.createdAt && now - job.createdAt > 15 * 60 * 1000) {
      activeJobs.delete(id);
    }
  }
}, 5 * 60 * 1000).unref();

// Start background auto-cleanup for temp media files older than 15 minutes
startDiskCleanup(DOWNLOADS_DIR, 15 * 60 * 1000);

/**
 * Health check & diagnostic status
 */
app.get('/api/health', (req, res) => {
  const ytExists = fs.existsSync(YT_DLP_PATH);
  const ffmpegExists = fs.existsSync(FFMPEG_PATH);
  res.json({
    name: 'VidLoader Studio',
    status: 'online',
    version: '2.0.0',
    env: process.env.NODE_ENV || 'development',
    tools: {
      ytDlp: { available: ytExists, path: YT_DLP_PATH },
      ffmpeg: { available: ffmpegExists, path: FFMPEG_PATH }
    },
    activeJobsCount: activeJobs.size,
    downloadsDir: DOWNLOADS_DIR,
    timestamp: new Date().toISOString()
  });
});

/**
 * Fetch video metadata & format options
 */
app.post('/api/info', async (req, res) => {
  const { url } = req.body;

  // SSRF & Security Validation with DNS Rebinding Guard
  const check = await isSafeUrl(url);
  if (!check.safe) {
    console.warn(`[VidLoader] Security blocked URL: "${url}" -> ${check.reason}`);
    return res.status(400).json({ error: check.reason });
  }

  try {
    const info = await getVideoInfo(check.cleanUrl);
    console.log(`[VidLoader] ✅ Successfully extracted metadata: "${info.title}" (${info.formats.length} formats)`);
    res.json({ success: true, data: info });
  } catch (err) {
    console.error(`[VidLoader] ❌ /api/info error for "${url}":`, err.message);
    res.status(500).json({
      error: err.message || 'Failed to extract video information',
      details: 'Check if the URL is accessible, public, and not region-restricted.'
    });
  }
});

/**
 * SSE endpoint for live download progress tracking
 */
app.get('/api/progress/:jobId', (req, res) => {
  const safeJobId = (req.params.jobId || '').replace(/[^a-zA-Z0-9_-]/g, '');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const job = activeJobs.get(safeJobId);
  if (!job) {
    sendEvent({ status: 'not_found', percent: 0 });
    return res.end();
  }

  sendEvent(job.progress || { status: 'initialized', percent: 0 });

  const listener = (progress) => {
    sendEvent(progress);
    if (progress.status === 'completed' || progress.status === 'error') {
      res.end();
    }
  };

  job.listeners.push(listener);

  req.on('close', () => {
    const idx = job.listeners.indexOf(listener);
    if (idx !== -1) job.listeners.splice(idx, 1);
  });
});

/**
 * Start a download job (Zero-log, ephemeral)
 */
app.post('/api/download/start', async (req, res) => {
  try {
    const { url, formatId, title, isAudio } = req.body;

    const check = await isSafeUrl(url);
    if (!check.safe) {
      return res.status(400).json({ error: check.reason });
    }

    const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    const safeTitle = (title || 'video')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .slice(0, 60);

    const job = {
      id: jobId,
      url: check.cleanUrl,
      formatId,
      title: safeTitle,
      isAudio: !!isAudio,
      progress: { status: 'starting', percent: 0, speed: '', eta: '', size: '' },
      listeners: [],
      createdAt: Date.now()
    };

    activeJobs.set(jobId, job);

    downloadMedia({
      url: check.cleanUrl,
      formatId,
      isAudio: !!isAudio,
      outputFilename: safeTitle,
      jobId,
      onProgress: (progress) => {
        job.progress = progress;
        job.listeners.forEach(fn => fn(progress));
      }
    })
      .then((result) => {
        job.result = result;
        const completedProgress = { status: 'completed', percent: 100, fileName: result.fileName };
        job.progress = completedProgress;
        job.listeners.forEach(fn => fn(completedProgress));

        // Auto-cleanup job state after 5 minutes to prevent memory leak
        setTimeout(() => {
          activeJobs.delete(jobId);
        }, 5 * 60 * 1000);
      })
      .catch((err) => {
        console.error('[VidLoader] Job failed:', jobId, err.message);
        const errorProgress = { status: 'error', error: err.message };
        job.progress = errorProgress;
        job.listeners.forEach(fn => fn(errorProgress));

        // Auto-cleanup failed job state after 3 minutes
        setTimeout(() => {
          activeJobs.delete(jobId);
        }, 3 * 60 * 1000);
      });

    res.json({ success: true, jobId });
  } catch (err) {
    console.error('[VidLoader] Start download error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Direct file stream download endpoint
 */
app.get('/api/download/stream', async (req, res) => {
  try {
    const { url, formatId, audio, title } = req.query;

    const check = await isSafeUrl(url);
    if (!check.safe) {
      return res.status(400).send(check.reason);
    }

    const safeTitle = (title || 'download')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .slice(0, 60);

    const isAudio = audio === 'true' || audio === '1';
    const streamJobId = 'stream_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    const result = await downloadMedia({
      url: check.cleanUrl,
      formatId,
      isAudio,
      outputFilename: safeTitle,
      jobId: streamJobId
    });

    if (!result.filePath || !fs.existsSync(result.filePath)) {
      return res.status(500).send('File processing failed.');
    }

    res.download(result.filePath, result.fileName, (err) => {
      setTimeout(() => {
        try {
          if (fs.existsSync(result.filePath)) {
            fs.unlinkSync(result.filePath);
            console.log(`[AutoPurge] 🧹 Purged temporary stream file: ${result.fileName}`);
          }
        } catch (e) {}
      }, 5 * 60 * 1000);
    });
  } catch (err) {
    console.error('[VidLoader] Direct download error:', err.message);
    res.status(500).send(`Download failed: ${err.message}`);
  }
});

// Start Express Server
const server = app.listen(PORT, HOST, () => {
  console.log(`===============================================`);
  console.log(`  ⚡ VidLoader Studio Server online`);
  console.log(`  🌐 Web App:    http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`  🛡️ Security:   SSRF Guard, Concurrency Queue & Rate Limiter ACTIVE`);
  console.log(`  🔒 Mode:       Zero-log Ephemeral (Production Ready)`);
  console.log(`===============================================`);

  // Attempt background update check of yt-dlp on startup
  updateYtDlp().catch(() => {});
});

// Process signal handling & Graceful Shutdown
function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Closing server gracefully...`);
  server.close(() => {
    console.log('[Server] HTTP connections closed. Process terminating.');
    process.exit(0);
  });
  // Force kill if lingering after 10s
  setTimeout(() => {
    console.error('[Server] Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
});
