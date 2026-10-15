const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const {
  identifyPlatform,
  getVideoInfo,
  downloadMedia,
  formatBytes,
  YT_DLP_PATH,
  FFMPEG_PATH,
  DOWNLOADS_DIR
} = require('./services/downloader');
const historyService = require('./services/history');
const { isSafeUrl, rateLimiter, startDiskCleanup } = require('./services/security');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiter applied to API routes
app.use('/api/', rateLimiter(40, 60 * 1000));

// Safe Static File Delivery with Auto-Purge after browser download
app.get('/files/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(DOWNLOADS_DIR, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File expired or already downloaded.');
  }

  res.download(filePath, safeFilename, (err) => {
    if (!err) {
      // Automatically purge the temporary server file 10s after sending to client
      setTimeout(() => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[AutoPurge] 🧹 Purged temporary server file: ${safeFilename}`);
          }
        } catch (e) {}
      }, 10000);
    }
  });
});

// In-memory active download jobs tracking
const activeJobs = new Map();

// Start background auto-cleanup for files older than 2 hours
startDiskCleanup(DOWNLOADS_DIR);

/**
 * Health check & diagnostic status
 */
app.get('/api/health', (req, res) => {
  const ytExists = fs.existsSync(YT_DLP_PATH);
  const ffmpegExists = fs.existsSync(FFMPEG_PATH);
  res.json({
    name: 'VidLoader',
    status: 'online',
    version: '2.0.0',
    tools: {
      ytDlp: { available: ytExists, path: YT_DLP_PATH },
      ffmpeg: { available: ffmpegExists, path: FFMPEG_PATH }
    },
    downloadsDir: DOWNLOADS_DIR,
    timestamp: new Date().toISOString()
  });
});

/**
 * Fetch video metadata & format options
 */
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  console.log(`[VidLoader] 📥 /api/info request received: "${url}"`);

  // SSRF & Security Validation
  const check = isSafeUrl(url);
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
 * Start a download job
 */
app.post('/api/download/start', async (req, res) => {
  try {
    const { url, formatId, title, isAudio, thumbnail, platform } = req.body;

    const check = isSafeUrl(url);
    if (!check.safe) {
      return res.status(400).json({ error: check.reason });
    }

    const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    const safeTitle = (title || 'video')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .slice(0, 70);

    const job = {
      id: jobId,
      url: check.cleanUrl,
      formatId,
      title: safeTitle,
      isAudio: !!isAudio,
      progress: { status: 'starting', percent: 0, speed: '', eta: '', size: '' },
      listeners: []
    };

    activeJobs.set(jobId, job);

    downloadMedia({
      url: check.cleanUrl,
      formatId,
      isAudio: !!isAudio,
      outputFilename: safeTitle,
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

        historyService.addHistoryItem({
          title: safeTitle || result.fileName,
          url: check.cleanUrl,
          format: isAudio ? 'MP3' : 'MP4',
          fileName: result.fileName,
          fileSize: formatBytes(result.fileSize),
          thumbnail: thumbnail || null,
          platform: platform || identifyPlatform(check.cleanUrl),
          downloadUrl: `/files/${encodeURIComponent(result.fileName)}`
        });
      })
      .catch((err) => {
        console.error('[VidLoader] Job failed:', jobId, err.message);
        const errorProgress = { status: 'error', error: err.message };
        job.progress = errorProgress;
        job.listeners.forEach(fn => fn(errorProgress));
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

    const check = isSafeUrl(url);
    if (!check.safe) {
      return res.status(400).send(check.reason);
    }

    const safeTitle = (title || 'download')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .slice(0, 70);

    const isAudio = audio === 'true' || audio === '1';
    const result = await downloadMedia({
      url: check.cleanUrl,
      formatId,
      isAudio,
      outputFilename: safeTitle
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
      }, 5000);
    });
  } catch (err) {
    console.error('[VidLoader] Direct download error:', err.message);
    res.status(500).send(`Download failed: ${err.message}`);
  }
});

/**
 * History endpoints
 */
app.get('/api/history', (req, res) => {
  res.json({ success: true, history: historyService.getHistory() });
});

app.delete('/api/history/:id', (req, res) => {
  const safeId = (req.params.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const success = historyService.removeHistoryItem(safeId);
  res.json({ success });
});

app.post('/api/history/clear', (req, res) => {
  const success = historyService.clearHistory();
  res.json({ success });
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`  ⚡ VidLoader Studio Server online on port ${PORT}`);
  console.log(`  🌐 Web App:    http://localhost:${PORT}`);
  console.log(`  🛡️ Security:   SSRF Protection & Rate Limiting ACTIVE`);
  console.log(`===============================================`);
});
