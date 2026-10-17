const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

function resolveYtDlpPath() {
  const isWindows = process.platform === 'win32';
  const binDir = path.join(process.cwd(), 'bin');
  if (!fs.existsSync(binDir)) {
    try {
      fs.mkdirSync(binDir, { recursive: true });
    } catch (e) {}
  }

  const exePath = path.join(binDir, 'yt-dlp.exe');
  const unixPath = path.join(binDir, 'yt-dlp');

  if (isWindows) {
    if (fs.existsSync(exePath)) return exePath;
    if (fs.existsSync(unixPath)) return unixPath;
    return 'yt-dlp.exe';
  }

  // Linux / macOS: check for native unix binary first
  if (fs.existsSync(unixPath)) {
    try {
      fs.chmodSync(unixPath, 0o755);
    } catch (e) {}
    return unixPath;
  }

  // If binary missing on Unix, attempt auto-download if curl is available
  try {
    const { execSync } = require('child_process');
    console.log('[VidLoader] Native yt-dlp binary missing for Linux/macOS. Downloading latest binary...');
    execSync(`curl -L -o "${unixPath}" https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux && chmod +x "${unixPath}"`, { stdio: 'inherit' });
    if (fs.existsSync(unixPath)) {
      return unixPath;
    }
  } catch (e) {
    console.warn('[VidLoader] Automatic yt-dlp download failed:', e.message);
  }

  // Fallback to exe if exists (e.g. Wine environment) or system PATH
  if (fs.existsSync(exePath)) {
    try {
      fs.chmodSync(exePath, 0o755);
    } catch (e) {}
    return exePath;
  }

  return 'yt-dlp';
}

function resolveFfmpegPath() {
  const isWindows = process.platform === 'win32';

  // Check for modern system FFmpeg first (supports AV1/Opus/MP4 modern muxing)
  try {
    const { execSync } = require('child_process');
    const cmd = isWindows ? 'where ffmpeg' : 'which ffmpeg';
    const sysFfmpeg = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim().split('\n')[0].trim();
    if (sysFfmpeg && fs.existsSync(sysFfmpeg)) {
      return sysFfmpeg;
    }
  } catch (e) {}

  // Fallback to @ffmpeg-installer bundle
  if (ffmpegInstaller && ffmpegInstaller.path && fs.existsSync(ffmpegInstaller.path)) {
    try {
      if (!isWindows) {
        fs.chmodSync(ffmpegInstaller.path, 0o755);
      }
    } catch (e) {}
    return ffmpegInstaller.path;
  }

  return 'ffmpeg';
}

const YT_DLP_PATH = resolveYtDlpPath();
const FFMPEG_PATH = resolveFfmpegPath();
const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

/**
 * Identify platform from URL
 */
function identifyPlatform(url) {
  if (!url) return 'generic';
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('tiktok.com') || u.includes('tiktokv.com')) return 'tiktok';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
  if (u.includes('reddit.com') || u.includes('redd.it')) return 'reddit';
  if (u.includes('facebook.com') || u.includes('fb.watch')) return 'facebook';
  if (u.includes('threads.net')) return 'threads';
  if (u.includes('pinterest.com') || u.includes('pin.it')) return 'pinterest';
  return 'generic';
}

/**
 * Sanitize and clean user URL
 */
function cleanUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();

  // Prepend protocol if missing
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  // Strip excessive playlist & tracking query params from YouTube videos
  if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.delete('list');
      parsed.searchParams.delete('index');
      parsed.searchParams.delete('pp');
      parsed.searchParams.delete('si');
      url = parsed.toString();
    } catch (e) {
      url = url.replace(/([?&])(list|index|pp|si)=[^&]+(&|$)/g, '$1').replace(/[?&]$/, '');
    }
  }

  // Strip webapp, referral, and tracking query params from TikTok, Instagram, Twitter/X
  if (url.includes('tiktok.com/') || url.includes('instagram.com/') || url.includes('twitter.com/') || url.includes('x.com/')) {
    try {
      const parsed = new URL(url);
      parsed.search = '';
      url = parsed.toString();
    } catch (e) {
      url = url.split('?')[0];
    }
  }

  return url;
}

/**
 * Sanitize formatId string to prevent argument tampering
 */
function sanitizeFormatId(rawFormatId) {
  if (!rawFormatId || typeof rawFormatId !== 'string') return null;
  const cleaned = rawFormatId.replace(/[^a-zA-Z0-9_+/[\]<=.: -]/g, '').trim().slice(0, 80);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const sec = Math.floor(seconds);
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const remainingSecs = sec % 60;
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
}

/**
 * Format bytes to readable size
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return 'Auto';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Direct check for direct media stream URLs
 */
function isDirectMediaUrl(url) {
  const u = url.split('?')[0].toLowerCase();
  return u.endsWith('.mp4') || u.endsWith('.webm') || u.endsWith('.mov') || u.endsWith('.m3u8') || u.endsWith('.mp3');
}

// YouTube player clients. android/ios bypass datacenter IP bot checks but yt-dlp skips them
// when --cookies is passed, so cookies are only used with the web clients as a fallback.
const YOUTUBE_DEFAULT_CLIENTS = 'youtube:player_client=android,ios,tv';
const YOUTUBE_COOKIE_CLIENTS = 'youtube:player_client=web,mweb';

function getCookiesPath() {
  const cookiesPath = process.env.YOUTUBE_COOKIES_PATH || path.join(process.cwd(), 'cookies.txt');
  return fs.existsSync(cookiesPath) ? cookiesPath : null;
}

/**
 * True when a YouTube yt-dlp error indicates the video needs a signed-in session
 */
function isYouTubeAuthError(stderr) {
  return /confirm your age|age[- ]restricted|inappropriate for some users|members-only|Sign in to confirm you.re not a bot|login required/i.test(stderr || '');
}

function normalizeTikWmUrl(u) {
  if (!u) return null;
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return 'https://www.tikwm.com' + u;
  return u;
}

/**
 * High-reliability TikTok fallback metadata extractor via TikWM API
 */
async function extractTikTokViaApi(url) {
  console.log(`[TikTokFallback] Querying fallback extractor for: ${url}`);
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!res.ok) {
    throw new Error(`Fallback API returned HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.code !== 0 || !json.data) {
    throw new Error(json.msg || 'TikTok fallback extraction returned empty data.');
  }

  const d = json.data;
  const formats = [];

  const hdUrl = normalizeTikWmUrl(d.hdplay);
  const playUrl = normalizeTikWmUrl(d.play);
  const wmUrl = normalizeTikWmUrl(d.wmplay);
  const musicUrl = normalizeTikWmUrl(d.music);

  if (hdUrl || playUrl) {
    formats.push({
      formatId: 'tikwm_hd',
      label: 'Best Quality (No Watermark)',
      resolution: hdUrl ? '1080p HD' : '720p HD',
      ext: 'mp4',
      type: 'video',
      estimatedSize: formatBytes(d.size),
      rawBytes: d.size || 0,
      directUrl: hdUrl || playUrl
    });
  }

  if (playUrl && hdUrl) {
    formats.push({
      formatId: 'tikwm_sd',
      label: 'Standard Quality (No Watermark)',
      resolution: '720p SD',
      ext: 'mp4',
      type: 'video',
      estimatedSize: formatBytes(d.size),
      rawBytes: d.size || 0,
      directUrl: playUrl
    });
  }

  if (wmUrl) {
    formats.push({
      formatId: 'tikwm_wm',
      label: 'With Watermark (Original)',
      resolution: 'Original',
      ext: 'mp4',
      type: 'video',
      estimatedSize: formatBytes(d.wm_size || d.size),
      rawBytes: d.wm_size || d.size || 0,
      directUrl: wmUrl
    });
  }

  if (musicUrl) {
    formats.push({
      formatId: 'tikwm_audio',
      label: 'Original Audio Track (MP3)',
      resolution: 'Original Audio',
      ext: 'mp3',
      type: 'audio',
      estimatedSize: 'Audio Track',
      rawBytes: 0,
      directUrl: musicUrl
    });
  }

  return {
    id: d.id || 'tiktok_' + Date.now(),
    title: (d.title || 'TikTok Video').slice(0, 150),
    description: (d.title || '').slice(0, 300),
    thumbnail: normalizeTikWmUrl(d.cover || d.origin_cover || (d.author && d.author.avatar)) || null,
    duration: d.duration || 0,
    durationFormatted: formatDuration(d.duration),
    uploader: d.author ? (d.author.nickname || d.author.unique_id) : 'TikTok Creator',
    uploaderUrl: d.author && d.author.unique_id ? `https://www.tiktok.com/@${d.author.unique_id}` : null,
    platform: 'tiktok',
    views: d.play_count ? d.play_count.toLocaleString() : null,
    likes: d.digg_count ? d.digg_count.toLocaleString() : null,
    previewUrl: playUrl || wmUrl || null,
    formats,
    originalUrl: url
  };
}

/**
 * Direct HTTP stream downloader with high-speed curl process & live progress
 */
function downloadDirectStream({ streamUrl, outputTemplate, isAudio, jobId, onProgress }) {
  return new Promise((resolve, reject) => {
    console.log(`[DirectStream] Downloading direct stream with curl to: ${outputTemplate}`);

    const curlArgs = [
      '-L',
      '--fail',
      '--silent',
      '--show-error',
      '--retry', '3',
      '--retry-delay', '1',
      '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      '-o', outputTemplate
    ];

    if (streamUrl.includes('tiktok') || streamUrl.includes('tikwm')) {
      curlArgs.push('-e', 'https://www.tiktok.com/');
    }

    curlArgs.push(streamUrl);

    const proc = spawn('curl', curlArgs, { windowsHide: true });
    let errorOutput = '';
    const startTime = Date.now();
    let lastSize = 0;
    let lastTime = startTime;
    let expectedSize = 0;

    // Check progress every 350ms by inspecting output file size
    const progressTimer = setInterval(() => {
      try {
        if (fs.existsSync(outputTemplate)) {
          const stats = fs.statSync(outputTemplate);
          const currentSize = stats.size;
          const now = Date.now();
          const elapsedSec = (now - lastTime) / 1000;
          let speedStr = 'Downloading...';

          if (elapsedSec > 0) {
            const bytesPerSec = (currentSize - lastSize) / elapsedSec;
            if (bytesPerSec > 0) {
              speedStr = `${formatBytes(bytesPerSec)}/s`;
            }
          }
          lastSize = currentSize;
          lastTime = now;

          if (expectedSize <= 0) {
            expectedSize = Math.max(currentSize, 5 * 1024 * 1024);
          }
          const pct = Math.min(98, Math.max(10, Math.round((currentSize / (expectedSize * 1.05)) * 100)));

          if (onProgress) {
            onProgress({
              percent: pct,
              rawPercent: pct,
              phase: isAudio ? 'audio' : 'video',
              phaseLabel: isAudio ? 'Downloading Audio Stream' : 'Downloading Media Stream',
              speed: speedStr,
              eta: 'Finishing...',
              transferred: formatBytes(currentSize),
              size: formatBytes(expectedSize),
              status: 'downloading'
            });
          }
        }
      } catch (e) {}
    }, 350);

    proc.stderr.on('data', (d) => {
      errorOutput += d.toString();
    });

    proc.on('close', (code) => {
      clearInterval(progressTimer);
      if (code === 0 && fs.existsSync(outputTemplate)) {
        const finalSize = fs.statSync(outputTemplate).size;
        const finalFileName = path.basename(outputTemplate);
        if (onProgress) {
          onProgress({
            percent: 100,
            rawPercent: 100,
            phase: 'muxing',
            phaseLabel: 'Finalizing Media File',
            speed: 'Done',
            eta: 'Complete',
            transferred: formatBytes(finalSize),
            size: formatBytes(finalSize),
            status: 'completed',
            fileName: finalFileName
          });
        }
        resolve({
          filePath: outputTemplate,
          fileName: finalFileName,
          fileSize: finalSize
        });
      } else {
        clearInterval(progressTimer);
        reject(new Error(errorOutput || `Curl failed with exit code ${code}`));
      }
    });

    proc.on('error', (err) => {
      clearInterval(progressTimer);
      reject(err);
    });
  });
}

/**
 * Fetch video metadata using yt-dlp with strict timeout & error handling
 */
async function getVideoInfo(rawUrl) {
  const url = cleanUrl(rawUrl);
  const platform = identifyPlatform(url);

  // Fast-path: Direct media stream URL
  if (isDirectMediaUrl(url)) {
    const ext = url.split('?')[0].split('.').pop().toLowerCase();
    const filename = path.basename(url.split('?')[0]) || 'media_stream';
    return {
      id: 'direct_' + Date.now(),
      title: decodeURIComponent(filename),
      description: 'Direct media stream source',
      thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
      duration: 0,
      durationFormatted: 'Direct Stream',
      uploader: 'Direct Host',
      uploaderUrl: null,
      platform: 'generic',
      views: null,
      likes: null,
      previewUrl: url,
      formats: [
        {
          formatId: 'direct',
          label: `Source (${ext.toUpperCase()})`,
          resolution: 'Original',
          ext: ext === 'mp3' ? 'mp3' : 'mp4',
          type: ext === 'mp3' ? 'audio' : 'video',
          estimatedSize: 'Direct Stream',
          rawBytes: 0
        }
      ],
      originalUrl: url
    };
  }

  if (platform === 'youtube') {
    try {
      return await extractInfoWithYtDlp(url, platform, false);
    } catch (err) {
      if (!err.authRequired || !getCookiesPath()) throw err;
      console.log(`[Extractor] YouTube requires login for ${url}. Retrying with cookies and web clients.`);
      return extractInfoWithYtDlp(url, platform, true);
    }
  }

  return extractInfoWithYtDlp(url, platform, true);
}

/**
 * Run yt-dlp metadata extraction. useCookies controls whether cookies.txt is passed
 * (and, for YouTube, switches to cookie-capable player clients).
 */
function extractInfoWithYtDlp(url, platform, useCookies) {
  return new Promise((resolve, reject) => {
    console.log(`[Extractor] Starting extraction for [${platform}]${useCookies && platform === 'youtube' ? ' with cookies' : ''}: ${url}`);

    const args = [
      '--dump-single-json',
      '--no-playlist',
      '--socket-timeout', '10',
      '--no-warnings',
      '--no-check-certificates',
      '--geo-bypass',
      '--ffmpeg-location', FFMPEG_PATH
    ];

    if (platform === 'youtube') {
      args.push('--js-runtimes', `node:${process.execPath}`);
      // android/ios/tv avoid the GVS PO Token / bot challenge on datacenter VPS IPs, but android and ios
      // don't support cookies, so authenticated retries use the web clients instead
      args.push('--extractor-args', useCookies ? YOUTUBE_COOKIE_CLIENTS : YOUTUBE_DEFAULT_CLIENTS);
    } else if (platform === 'tiktok') {
      // ByteDance WAF detects and blocks curl_cffi TLS impersonation with 403 or captcha
      args.push('--add-header', 'Referer:https://www.tiktok.com/');
      args.push('--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');
    } else {
      // Impersonate modern browser TLS fingerprint for Instagram, Twitter
      args.push('--impersonate', 'chrome');
    }

    // Support cookies for age-restricted or protected videos
    const cookiesPath = useCookies ? getCookiesPath() : null;
    if (cookiesPath) {
      args.push('--cookies', cookiesPath);
    }

    const proxy = process.env.PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (proxy) {
      args.push('--proxy', proxy);
    }

    // Explicit '--' stops option parsing so user URL is never treated as a flag
    args.push('--', url);

    let stdout = '';
    let stderr = '';
    let hasResolved = false;

    const proc = spawn(YT_DLP_PATH, args, { windowsHide: true });

    if (proc.stdin) {
      proc.stdin.end();
    }

    // Safety timeout: 25 seconds
    const timer = setTimeout(async () => {
      if (!hasResolved) {
        try {
          proc.kill('SIGTERM');
        } catch (e) {}

        if (platform === 'tiktok') {
          console.log(`[Extractor] Timeout after 25s for TikTok. Attempting TikWM fallback for: ${url}`);
          try {
            const fallbackData = await extractTikTokViaApi(url);
            if (fallbackData) {
              hasResolved = true;
              return resolve(fallbackData);
            }
          } catch (e) {}
        }

        hasResolved = true;
        console.error(`[Extractor] Timeout after 25s for: ${url}`);
        reject(new Error('Extraction timed out. The platform may be rate-limiting or the link is private/inaccessible.'));
      }
    }, 25000);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', async (code) => {
      if (hasResolved) return;

      if (code !== 0 || !stdout.trim()) {
        const cleanErr = (stderr || '').trim();
        console.error(`[Extractor] Extraction error (code ${code}):`, cleanErr);

        if (platform === 'tiktok') {
          console.log(`[Extractor] yt-dlp encountered an error for TikTok. Activating zero-failure TikWM fallback for: ${url}`);
          try {
            const fallbackData = await extractTikTokViaApi(url);
            if (fallbackData) {
              hasResolved = true;
              clearTimeout(timer);
              return resolve(fallbackData);
            }
          } catch (apiErr) {
            console.warn(`[Extractor] TikTok fallback API also failed: ${apiErr.message}`);
          }
        }

        hasResolved = true;
        clearTimeout(timer);
        
        let userMessage = 'Unable to extract media from this URL.';
        if (cleanErr.includes('Private video')) {
          userMessage = 'This video is private or removed by the creator.';
        } else if (/confirm you.re not a bot/i.test(cleanErr)) {
          userMessage = 'YouTube rate-limited server IP. Try another URL, use the Chrome Extension, or provide a cookies.txt file.';
        } else if (/page needs to be reloaded/i.test(cleanErr)) {
          userMessage = 'YouTube rejected the request from this server. Please try again shortly.';
        } else if (/Sign in|age[- ]restricted|confirm your age|inappropriate for some users/i.test(cleanErr)) {
          userMessage = 'This video is age-restricted or requires login.';
        } else if (cleanErr.includes('blocked from accessing') || cleanErr.includes('HTTP Error 403')) {
          userMessage = 'Platform temporarily rate-limited or blocked direct access. Try another URL or use the Chrome Extension.';
        } else if (cleanErr.includes('Unsupported URL') || cleanErr.includes('is not a valid URL')) {
          userMessage = 'The link provided is not recognized as a supported video URL.';
        } else if (cleanErr) {
          userMessage = cleanErr.split('\n')[0].replace(/^ERROR:\s*/i, '');
        }

        const extractError = new Error(userMessage);
        extractError.authRequired = platform === 'youtube' && isYouTubeAuthError(cleanErr);
        return reject(extractError);
      }

      hasResolved = true;
      clearTimeout(timer);

      try {
        const data = JSON.parse(stdout);

        // Process available formats
        const rawFormats = data.formats || [];
        const formats = [];

        // Estimate best audio stream size for combining with video-only DASH streams
        let bestAudioBytes = 0;
        for (const f of rawFormats) {
          if (f.vcodec === 'none' && f.acodec !== 'none') {
            const bytes = f.filesize || f.filesize_approx || 0;
            if (bytes > bestAudioBytes) bestAudioBytes = bytes;
          }
        }
        if (bestAudioBytes === 0 && data.duration) {
          bestAudioBytes = Math.round(data.duration * 16000); // ~128kbps fallback
        }

        // Dynamically detect all video heights present in raw formats
        const detectedHeights = new Set();
        for (const f of rawFormats) {
          if (f.vcodec && f.vcodec !== 'none' && f.height && typeof f.height === 'number') {
            detectedHeights.add(f.height);
          }
        }

        // Priority resolution tiers (highest first)
        const priorityTiers = [4320, 2160, 1440, 1080, 720, 480, 360, 240];
        const allHeights = [
          ...priorityTiers.filter(h => detectedHeights.has(h)),
          ...Array.from(detectedHeights).filter(h => !priorityTiers.includes(h))
        ].sort((a, b) => b - a);

        // Add standard "Best Available (Max Quality)" first
        formats.push({
          formatId: 'bestvideo+bestaudio/best',
          label: 'Best Available Quality',
          resolution: data.resolution || 'Auto Max',
          ext: 'mp4',
          type: 'video',
          estimatedSize: formatBytes(data.filesize || data.filesize_approx),
          rawBytes: data.filesize || data.filesize_approx || 0
        });

        const addedHeights = new Set();
        for (const height of allHeights) {
          const matching = rawFormats.filter(f => f.height === height && f.vcodec !== 'none');
          if (matching.length > 0 && !addedHeights.has(height)) {
            addedHeights.add(height);
            const best = matching[matching.length - 1];
            const videoBytes = best.filesize || best.filesize_approx || 0;
            const totalBytes = best.acodec !== 'none' ? videoBytes : (videoBytes ? videoBytes + bestAudioBytes : 0);

            let tierName = 'SD';
            if (height >= 4320) tierName = '8K UHD';
            else if (height >= 2160) tierName = '4K Ultra HD';
            else if (height >= 1440) tierName = '2K Quad HD';
            else if (height >= 1080) tierName = 'Full HD';
            else if (height >= 720) tierName = 'HD';
            else if (height <= 240) tierName = 'Mobile';

            const fpsTag = best.fps && best.fps > 30 ? ` ${best.fps}fps` : '';

            formats.push({
              formatId: `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`,
              label: `${height}p ${tierName}${fpsTag}`,
              resolution: `${best.width || ''}x${best.height || height}`,
              ext: 'mp4',
              type: 'video',
              estimatedSize: formatBytes(totalBytes),
              rawBytes: totalBytes
            });
          }
        }

        // Fallback if no specific heights matched
        if (formats.filter(f => f.type === 'video').length === 0) {
          formats.unshift({
            formatId: 'bestvideo+bestaudio/best',
            label: 'Original Video Quality',
            resolution: data.resolution || 'Original',
            ext: 'mp4',
            type: 'video',
            estimatedSize: formatBytes(data.filesize || data.filesize_approx),
            rawBytes: data.filesize || data.filesize_approx || 0
          });
        }

        // Audio-only options
        formats.push({
          formatId: 'bestaudio/best',
          label: 'Audio Only (MP3 HQ 320kbps)',
          resolution: '320 kbps',
          ext: 'mp3',
          type: 'audio',
          estimatedSize: formatBytes(bestAudioBytes || Math.round((data.duration || 180) * 40000)),
          rawBytes: bestAudioBytes || Math.round((data.duration || 180) * 40000)
        });

        formats.push({
          formatId: 'bestaudio[ext=m4a]/bestaudio/best',
          label: 'Audio Only (M4A HQ)',
          resolution: 'Original',
          ext: 'm4a',
          type: 'audio',
          estimatedSize: formatBytes(bestAudioBytes || Math.round((data.duration || 180) * 32000)),
          rawBytes: bestAudioBytes || Math.round((data.duration || 180) * 32000)
        });

        // Direct stream preview URL if available
        let previewUrl = null;
        const mp4Streams = rawFormats.filter(f => f.ext === 'mp4' && f.vcodec !== 'none' && f.acodec !== 'none');
        if (mp4Streams.length > 0) {
          previewUrl = mp4Streams[0].url;
        } else if (data.url) {
          previewUrl = data.url;
        }

        resolve({
          id: data.id || 'vid_' + Date.now(),
          title: data.title || 'Untitled Video',
          description: (data.description || '').slice(0, 300),
          thumbnail: data.thumbnail || (data.thumbnails && data.thumbnails.length ? data.thumbnails[data.thumbnails.length - 1].url : null),
          duration: data.duration,
          durationFormatted: formatDuration(data.duration),
          uploader: data.uploader || data.channel || data.creator || 'Social Media Creator',
          uploaderUrl: data.uploader_url || data.channel_url || null,
          platform,
          views: data.view_count ? data.view_count.toLocaleString() : null,
          likes: data.like_count ? data.like_count.toLocaleString() : null,
          previewUrl,
          formats,
          originalUrl: url
        });
      } catch (err) {
        console.error('[Extractor] JSON parse error:', err.message);
        reject(new Error(`Failed to parse video metadata: ${err.message}`));
      }
    });

    proc.on('error', async (err) => {
      if (hasResolved) return;
      if (platform === 'tiktok') {
        try {
          const fallbackData = await extractTikTokViaApi(url);
          if (fallbackData) {
            hasResolved = true;
            clearTimeout(timer);
            return resolve(fallbackData);
          }
        } catch (e) {}
      }
      hasResolved = true;
      clearTimeout(timer);
      console.error('[Extractor] Process spawn error:', err.message);
      reject(new Error(`Extraction process failed: ${err.message}`));
    });
  });
}

// Concurrency Queue Management
const MAX_CONCURRENT_DOWNLOADS = parseInt(process.env.MAX_CONCURRENT_DOWNLOADS, 10) || 3;
let activeDownloadCount = 0;
const downloadQueue = [];

function updateQueuePositions() {
  downloadQueue.forEach((item, idx) => {
    if (item.onProgress) {
      item.onProgress({
        status: 'queued',
        percent: 0,
        queuePosition: idx + 1,
        message: `Queued (position #${idx + 1} of ${downloadQueue.length})...`
      });
    }
  });
}

function processNextDownload() {
  if (activeDownloadCount >= MAX_CONCURRENT_DOWNLOADS || downloadQueue.length === 0) {
    return;
  }

  const nextJob = downloadQueue.shift();
  updateQueuePositions();
  activeDownloadCount++;

  runDownload(nextJob.params)
    .then(nextJob.resolve)
    .catch(nextJob.reject)
    .finally(() => {
      activeDownloadCount--;
      processNextDownload();
    });
}

/**
 * Execute download execution helper
 */
function runDownload({ url, formatId, isAudio, outputFilename, jobId, onProgress }) {
  const cleanedUrl = cleanUrl(url);
  const platform = identifyPlatform(cleanedUrl);
  const safeJobId = (jobId || 'job_' + Date.now()).replace(/[^a-zA-Z0-9_-]/g, '');

  return new Promise(async (resolve, reject) => {
    const finalExt = isAudio ? (formatId && (formatId.includes('mp3') || formatId.includes('audio')) ? 'mp3' : 'm4a') : 'mp4';
    const cleanName = (outputFilename || `video_${Date.now()}`)
      .replace(/[/\\?%*:|"<>]/g, '_')
      .slice(0, 60);

    // Embed unique jobId directly in file template to eliminate race condition file conflicts
    const outputTemplate = path.join(DOWNLOADS_DIR, `${safeJobId}_${cleanName}.${finalExt}`);

    const safeFormat = sanitizeFormatId(formatId);

    // Fast-path: Direct media stream URL or direct format
    if (isDirectMediaUrl(cleanedUrl) || (safeFormat && safeFormat === 'direct')) {
      try {
        if (onProgress) {
          onProgress({
            percent: 10,
            phase: 'video',
            phaseLabel: 'Direct Stream Download',
            speed: 'Connecting',
            eta: 'Fast',
            transferred: 'Streaming Media File',
            status: 'downloading'
          });
        }
        const result = await downloadDirectStream({
          streamUrl: cleanedUrl,
          outputTemplate,
          isAudio,
          jobId: safeJobId,
          onProgress
        });
        return resolve(result);
      } catch (err) {
        console.error('[Downloader] Direct stream download error:', err.message);
        return reject(err);
      }
    }

    // Fast-path: Direct TikWM format or stream
    if (safeFormat && safeFormat.startsWith('tikwm_')) {
      try {
        if (onProgress) {
          onProgress({
            percent: 5,
            phase: 'resolving',
            phaseLabel: 'Resolving Direct Stream',
            speed: 'Connecting',
            eta: 'Fast',
            transferred: 'Resolving CDN',
            status: 'downloading'
          });
        }
        const apiInfo = await extractTikTokViaApi(cleanedUrl);
        const matched = (apiInfo.formats || []).find(f => f.formatId === safeFormat) || apiInfo.formats[0];
        const streamUrl = matched ? matched.directUrl : null;
        if (!streamUrl) {
          throw new Error('Direct stream URL could not be resolved from TikTok fallback.');
        }

        const result = await downloadDirectStream({
          streamUrl,
          outputTemplate,
          isAudio,
          jobId: safeJobId,
          onProgress
        });
        return resolve(result);
      } catch (err) {
        console.error('[Downloader] Direct TikTok download error:', err.message);
        return reject(err);
      }
    }

    // Runs yt-dlp; YouTube starts without cookies and retries once with them if login is required
    const startYtDlp = (useCookies) => {
      const args = [
        '--no-playlist',
        '--socket-timeout', '15',
        '--no-warnings',
        '--no-check-certificates',
        '--newline',
        '--progress-template', 'download-progress:%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress._percent_str)s|%(info.vcodec)s|%(info.acodec)s',
        '--ffmpeg-location', FFMPEG_PATH,
        '-o', outputTemplate
      ];

      if (platform === 'youtube') {
        args.push('--js-runtimes', `node:${process.execPath}`);
        args.push('--extractor-args', useCookies ? YOUTUBE_COOKIE_CLIENTS : YOUTUBE_DEFAULT_CLIENTS);
      } else if (platform === 'tiktok') {
        args.push('--add-header', 'Referer:https://www.tiktok.com/');
        args.push('--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');
      } else {
        args.push('--impersonate', 'chrome');
      }

      const cookiesPath = useCookies ? getCookiesPath() : null;
      if (cookiesPath) {
        args.push('--cookies', cookiesPath);
      }

      const proxy = process.env.PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
      if (proxy) {
        args.push('--proxy', proxy);
      }

      if (isAudio) {
        args.push(
          '-x',
          '--audio-format', finalExt,
          '--audio-quality', '0'
        );
      } else {
        args.push(
          '-f', safeFormat && safeFormat !== 'direct' ? safeFormat : 'bestvideo+bestaudio/best',
          '--merge-output-format', 'mp4'
        );
      }

      // Stop option parsing before positional URL
      args.push('--', cleanedUrl);

      console.log(`[Downloader] Starting download [Job: ${safeJobId}] for: ${cleanedUrl}`);
      const proc = spawn(YT_DLP_PATH, args, { windowsHide: true });
    
      if (proc.stdin) {
        proc.stdin.end();
      }

      let resolvedPath = null;
      let errorOutput = '';

      // Multi-phase progress state trackers
      let highestPercent = 1;
      let currentPhase = isAudio ? 'audio' : 'video';
      let lastKnownSpeed = '';
      let lastKnownEta = '';
      let lastKnownSize = '';

      // Safety timeout: 15 minutes for 4K streams
      let timedOut = false;
      const downloadTimer = setTimeout(() => {
        timedOut = true;
        try {
          proc.kill('SIGTERM');
        } catch (e) {}
        reject(new Error('Download exceeded maximum time limit (15 minutes).'));
      }, 15 * 60 * 1000);

      proc.stdout.on('data', (chunk) => {
        const rawText = chunk.toString();
        const lines = rawText.split('\n');

        for (let line of lines) {
          line = line.trim();
          if (!line) continue;

          // 1. Check for FFmpeg Merger / Audio Extraction phase
          if (line.includes('[Merger]') || line.includes('[ExtractAudio]')) {
            currentPhase = 'muxing';
            highestPercent = Math.max(highestPercent, 96);
            if (onProgress) {
              onProgress({
                percent: Math.min(99, highestPercent),
                phase: 'muxing',
                phaseLabel: 'FFmpeg Studio Muxing',
                speed: 'Processing',
                eta: 'Finalizing',
                size: lastKnownSize || 'Processing Container',
                transferred: lastKnownSize || 'Merging Streams',
                status: 'processing',
                message: '⚡ Assembling & merging high-definition media streams...'
              });
            }
            continue;
          }

          // 2. Structured progress template output from yt-dlp
          if (line.startsWith('download-progress:')) {
            const payload = line.replace('download-progress:', '').trim();
            const parts = payload.split('|');
            const downloadedBytes = parseInt(parts[0], 10) || 0;
            const totalBytes = parseInt(parts[1], 10) || 0;
            let speed = (parts[2] || '').trim();
            let eta = (parts[3] || '').trim();
            let pctStr = (parts[4] || '').replace('%', '').trim();
            const vcodec = (parts[5] || '').trim();
            const acodec = (parts[6] || '').trim();

            const subPercent = parseFloat(pctStr) || 0;

            // Determine current phase based on stream codecs
            if (vcodec && vcodec !== 'none' && acodec === 'none') {
              currentPhase = 'video';
            } else if (vcodec === 'none' && acodec && acodec !== 'none') {
              currentPhase = 'audio';
            } else if (isAudio) {
              currentPhase = 'audio';
            }

            // Calculate monotonic overall progress
            let calculatedPercent = 0;
            if (isAudio) {
              calculatedPercent = subPercent * 0.92;
            } else if (currentPhase === 'video') {
              calculatedPercent = subPercent * 0.74; // Video is 0% -> 74%
            } else if (currentPhase === 'audio') {
              calculatedPercent = 74 + (subPercent * 0.20); // Audio is 74% -> 94%
            } else {
              calculatedPercent = subPercent * 0.94;
            }

            highestPercent = Math.max(highestPercent, calculatedPercent);

            if (speed && speed !== 'Unknown B/s' && speed !== 'NA') {
              lastKnownSpeed = speed;
            }
            if (eta && eta !== 'Unknown' && eta !== 'NA') {
              lastKnownEta = eta;
            }

            let transferred = '';
            if (downloadedBytes > 0 && totalBytes > 0) {
              transferred = `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`;
              lastKnownSize = formatBytes(totalBytes);
            } else if (downloadedBytes > 0) {
              transferred = formatBytes(downloadedBytes);
            }

            if (onProgress) {
              onProgress({
                percent: Math.min(99, Math.round(highestPercent)),
                rawPercent: Math.round(subPercent),
                phase: currentPhase,
                phaseLabel: currentPhase === 'audio' ? 'Downloading Audio Stream' : 'Downloading Video Stream',
                speed: lastKnownSpeed || 'Analyzing...',
                eta: lastKnownEta || 'Calculating...',
                transferred: transferred || lastKnownSize || '-- / --',
                size: lastKnownSize || '',
                status: 'downloading'
              });
            }
            continue;
          }

          // 3. Fallback standard yt-dlp line regex matcher
          const pctMatch = line.match(/\[download\]\s+([\d.]+)%/i);
          if (pctMatch) {
            const subPercent = parseFloat(pctMatch[1]);
            const sizeMatch = line.match(/of\s+~?\s*([\d.]+\s*[KMGT]?i?B)/i);
            const speedMatch = line.match(/at\s+([\d.]+\s*[KMGT]?i?B\/s)/i);
            const etaMatch = line.match(/ETA\s+([\d:]+)/i);

            if (speedMatch && speedMatch[1]) lastKnownSpeed = speedMatch[1].trim();
            if (etaMatch && etaMatch[1]) lastKnownEta = etaMatch[1].trim();
            if (sizeMatch && sizeMatch[1]) lastKnownSize = sizeMatch[1].trim();

            // Transition to audio if destination indicates audio track or secondary stream
            if (line.includes('.f251.') || line.includes('.f140.') || line.includes('audio')) {
              currentPhase = 'audio';
            }

            let calculatedPercent = isAudio ? subPercent * 0.92 : (currentPhase === 'video' ? subPercent * 0.74 : 74 + subPercent * 0.20);
            highestPercent = Math.max(highestPercent, calculatedPercent);

            if (onProgress) {
              onProgress({
                percent: Math.min(99, Math.round(highestPercent)),
                rawPercent: Math.round(subPercent),
                phase: currentPhase,
                phaseLabel: currentPhase === 'audio' ? 'Downloading Audio Stream' : 'Downloading Video Stream',
                speed: lastKnownSpeed || 'Optimizing...',
                eta: lastKnownEta || 'Estimating...',
                transferred: lastKnownSize || '--',
                size: lastKnownSize || '',
                status: 'downloading'
              });
            }
          }

          const destMatch = line.match(/\[(?:download|Merger|ExtractAudio)\] Destination:\s+(.+)$/m) ||
                            line.match(/\[Merger\] Merging formats into "(.+)"/m);
          if (destMatch && destMatch[1]) {
            resolvedPath = destMatch[1].trim();
          }
        }
      });

      proc.stderr.on('data', (chunk) => {
        errorOutput += chunk.toString();
      });

      proc.on('close', async (code) => {
        clearTimeout(downloadTimer);
        if (code === 0) {
          if (!resolvedPath || !fs.existsSync(resolvedPath)) {
            if (fs.existsSync(outputTemplate)) {
              resolvedPath = outputTemplate;
            } else {
              const files = fs.readdirSync(DOWNLOADS_DIR);
              // Search strictly for file prefixed with our safeJobId
              const found = files.find(f => f.startsWith(`${safeJobId}_`));
              if (found) {
                resolvedPath = path.join(DOWNLOADS_DIR, found);
              }
            }
          }
          resolve({
            filePath: resolvedPath,
            fileName: path.basename(resolvedPath || outputTemplate),
            fileSize: resolvedPath && fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath).size : 0
          });
        } else {
          if (platform === 'youtube' && !useCookies && !timedOut && getCookiesPath() && isYouTubeAuthError(errorOutput)) {
            console.log(`[Downloader] YouTube requires login [Job: ${safeJobId}]. Retrying with cookies and web clients.`);
            return startYtDlp(true);
          }
          if (platform === 'tiktok') {
            console.warn('[Downloader] yt-dlp failed on TikTok during download. Attempting TikWM auto-recovery...');
            try {
              if (onProgress) {
                onProgress({
                  percent: 8,
                  phase: 'resolving',
                  phaseLabel: 'Auto-Recovering via High-Speed Stream',
                  speed: 'Connecting',
                  eta: 'Recovering',
                  transferred: 'Switching Stream Engine',
                  status: 'downloading'
                });
              }
              const apiInfo = await extractTikTokViaApi(cleanedUrl);
              const targetFormat = isAudio
                ? (apiInfo.formats.find(f => f.type === 'audio') || apiInfo.formats[0])
                : (apiInfo.formats.find(f => f.formatId === 'tikwm_hd') || apiInfo.formats[0]);

              if (targetFormat && targetFormat.directUrl) {
                const directResult = await downloadDirectStream({
                  streamUrl: targetFormat.directUrl,
                  outputTemplate,
                  isAudio,
                  jobId: safeJobId,
                  onProgress
                });
                return resolve(directResult);
              }
            } catch (recoveryErr) {
              console.error('[Downloader] TikTok recovery download failed:', recoveryErr.message);
            }
          }
          console.error('[Downloader] Exit code:', code, errorOutput);
          reject(new Error(errorOutput.split('\n')[0] || `Download failed (exit code ${code})`));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(downloadTimer);
        reject(err);
      });
    };

    startYtDlp(platform !== 'youtube');
  });
}

/**
 * Public queue-managed downloadMedia function
 */
function downloadMedia(params) {
  return new Promise((resolve, reject) => {
    if (activeDownloadCount < MAX_CONCURRENT_DOWNLOADS) {
      activeDownloadCount++;
      runDownload(params)
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeDownloadCount--;
          processNextDownload();
        });
    } else {
      // Queue job and notify listener
      downloadQueue.push({ params, resolve, reject, onProgress: params.onProgress });
      const pos = downloadQueue.length;
      if (params.onProgress) {
        params.onProgress({
          status: 'queued',
          percent: 0,
          queuePosition: pos,
          message: `Server busy. Queued (position #${pos})...`
        });
      }
    }
  });
}

/**
 * Check and run yt-dlp self-update
 */
async function updateYtDlp() {
  return new Promise((resolve) => {
    try {
      const proc = spawn(YT_DLP_PATH, ['-U'], { windowsHide: true });
      let output = '';
      proc.stdout.on('data', d => output += d.toString());
      proc.stderr.on('data', d => output += d.toString());
      proc.on('close', (code) => {
        resolve({ success: code === 0, message: output.trim() });
      });
      proc.on('error', (e) => {
        resolve({ success: false, message: e.message });
      });
    } catch (e) {
      resolve({ success: false, message: e.message });
    }
  });
}

module.exports = {
  cleanUrl,
  identifyPlatform,
  getVideoInfo,
  downloadMedia,
  updateYtDlp,
  formatBytes,
  formatDuration,
  sanitizeFormatId,
  YT_DLP_PATH,
  FFMPEG_PATH,
  DOWNLOADS_DIR
};
