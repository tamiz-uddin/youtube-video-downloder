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
    execSync(`curl -L -o "${unixPath}" https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && chmod +x "${unixPath}"`, { stdio: 'inherit' });
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
  if (ffmpegInstaller && ffmpegInstaller.path && fs.existsSync(ffmpegInstaller.path)) {
    try {
      if (process.platform !== 'win32') {
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
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
  if (u.includes('reddit.com')) return 'reddit';
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
      // Remove playlist and search params that cause whole-playlist extraction
      parsed.searchParams.delete('list');
      parsed.searchParams.delete('index');
      parsed.searchParams.delete('pp');
      parsed.searchParams.delete('si');
      url = parsed.toString();
    } catch (e) {
      // Fallback regex strip
      url = url.replace(/([?&])(list|index|pp|si)=[^&]+(&|$)/g, '$1').replace(/[?&]$/, '');
    }
  }

  return url;
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

  return new Promise((resolve, reject) => {
    console.log(`[Extractor] Starting extraction for [${platform}]: ${url}`);

    const args = [
      '--dump-single-json',
      '--no-playlist',
      '--socket-timeout', '10',
      '--no-warnings',
      '--no-check-certificates',
      '--prefer-free-formats',
      '--geo-bypass',
      '--js-runtimes', `node:${process.execPath}`,
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '--ffmpeg-location', FFMPEG_PATH
    ];

    if (platform === 'youtube') {
      args.push('--extractor-args', 'youtube:player_client=android,web;player_skip=configs');
    }

    args.push(url);

    let stdout = '';
    let stderr = '';
    let hasResolved = false;

    const proc = spawn(YT_DLP_PATH, args, { windowsHide: true });

    // End stdin immediately so child process never waits for input
    if (proc.stdin) {
      proc.stdin.end();
    }

    // Safety timeout: 25 seconds
    const timer = setTimeout(() => {
      if (!hasResolved) {
        hasResolved = true;
        try {
          proc.kill('SIGTERM');
        } catch (e) {}
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

    proc.on('close', (code) => {
      if (hasResolved) return;
      hasResolved = true;
      clearTimeout(timer);

      console.log(`[Extractor] Process exited with code ${code}. Stdout len: ${stdout.length}`);

      if (code !== 0 || !stdout.trim()) {
        const cleanErr = (stderr || '').trim();
        console.error(`[Extractor] Extraction error (code ${code}):`, cleanErr);
        
        let userMessage = 'Unable to extract media from this URL.';
        if (cleanErr.includes('Private video') || cleanErr.includes('Sign in')) {
          userMessage = 'This video is private, age-restricted, or requires login.';
        } else if (cleanErr.includes('blocked from accessing') || cleanErr.includes('HTTP Error 403')) {
          userMessage = 'Platform temporarily rate-limited or blocked direct access. Try another URL or use the Chrome Extension.';
        } else if (cleanErr.includes('Unsupported URL') || cleanErr.includes('is not a valid URL')) {
          userMessage = 'The link provided is not recognized as a supported video URL.';
        } else if (cleanErr) {
          userMessage = cleanErr.split('\n')[0].replace(/^ERROR:\s*/i, '');
        }

        return reject(new Error(userMessage));
      }

      try {
        const data = JSON.parse(stdout);

        // Process available formats
        const rawFormats = data.formats || [];
        const formats = [];

        // Check for common video resolutions
        const targetHeights = [1080, 720, 480, 360];
        const addedHeights = new Set();

        for (const height of targetHeights) {
          const matching = rawFormats.filter(f => f.height === height && f.vcodec !== 'none');
          if (matching.length > 0 && !addedHeights.has(height)) {
            addedHeights.add(height);
            const best = matching[matching.length - 1];
            formats.push({
              formatId: `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`,
              label: `${height}p ${height >= 1080 ? 'Full HD' : (height >= 720 ? 'HD' : 'SD')}`,
              resolution: `${best.width || ''}x${best.height || height}`,
              ext: 'mp4',
              type: 'video',
              estimatedSize: formatBytes(best.filesize || best.filesize_approx),
              rawBytes: best.filesize || best.filesize_approx || 0
            });
          }
        }

        // Add standard "Best available"
        formats.push({
          formatId: 'bestvideo+bestaudio/best',
          label: 'Best Available Quality',
          resolution: data.resolution || 'Auto HD',
          ext: 'mp4',
          type: 'video',
          estimatedSize: formatBytes(data.filesize || data.filesize_approx),
          rawBytes: data.filesize || data.filesize_approx || 0
        });

        // Audio-only options
        formats.push({
          formatId: 'bestaudio/best',
          label: 'Audio Only (MP3 HQ)',
          resolution: '320 kbps',
          ext: 'mp3',
          type: 'audio',
          estimatedSize: formatBytes(Math.round((data.duration || 180) * 40000)),
          rawBytes: Math.round((data.duration || 180) * 40000)
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

    proc.on('error', (err) => {
      if (hasResolved) return;
      hasResolved = true;
      clearTimeout(timer);
      console.error('[Extractor] Process spawn error:', err.message);
      reject(new Error(`Extraction process failed: ${err.message}`));
    });
  });
}

/**
 * Execute download with yt-dlp and report progress
 */
function downloadMedia({ url, formatId, isAudio, outputFilename, onProgress }) {
  const cleanedUrl = cleanUrl(url);
  const platform = identifyPlatform(cleanedUrl);

  return new Promise((resolve, reject) => {
    const finalExt = isAudio ? (formatId && formatId.includes('mp3') ? 'mp3' : 'm4a') : 'mp4';
    const cleanName = (outputFilename || `video_${Date.now()}`)
      .replace(/[/\\?%*:|"<>]/g, '_')
      .slice(0, 80);
    const outputTemplate = path.join(DOWNLOADS_DIR, `${cleanName}_${Date.now()}.${finalExt}`);

    const args = [
      '--no-playlist',
      '--socket-timeout', '15',
      '--no-warnings',
      '--no-check-certificates',
      '--newline',
      '--js-runtimes', `node:${process.execPath}`,
      '--ffmpeg-location', FFMPEG_PATH,
      '-o', outputTemplate
    ];

    if (platform === 'youtube') {
      args.push('--extractor-args', 'youtube:player_client=android,web;player_skip=configs');
    }

    if (isAudio) {
      args.push(
        '-x',
        '--audio-format', finalExt,
        '--audio-quality', '0'
      );
    } else {
      args.push(
        '-f', formatId && formatId !== 'direct' ? formatId : 'bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4'
      );
    }

    args.push(cleanedUrl);

    console.log(`[Downloader] Starting download for: ${cleanedUrl}`);
    const proc = spawn(YT_DLP_PATH, args, { windowsHide: true });
    
    if (proc.stdin) {
      proc.stdin.end();
    }

    let resolvedPath = null;
    let errorOutput = '';

    proc.stdout.on('data', (chunk) => {
      const line = chunk.toString();

      const progressMatch = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/i) ||
                            line.match(/\[download\]\s+([\d.]+)%/i);

      if (progressMatch && onProgress) {
        const percent = parseFloat(progressMatch[1]);
        const size = progressMatch[2] || '';
        const speed = progressMatch[3] || '';
        const eta = progressMatch[4] || '';
        onProgress({ percent, size, speed, eta, status: 'downloading' });
      }

      const destMatch = line.match(/\[(?:download|Merger|ExtractAudio)\] Destination:\s+(.+)$/m) ||
                        line.match(/\[Merger\] Merging formats into "(.+)"/m);
      if (destMatch && destMatch[1]) {
        resolvedPath = destMatch[1].trim();
      }
    });

    proc.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        if (!resolvedPath || !fs.existsSync(resolvedPath)) {
          if (fs.existsSync(outputTemplate)) {
            resolvedPath = outputTemplate;
          } else {
            const files = fs.readdirSync(DOWNLOADS_DIR);
            const found = files.find(f => f.startsWith(cleanName));
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
        console.error('[Downloader] Exit code:', code, errorOutput);
        reject(new Error(errorOutput.split('\n')[0] || `Download failed (exit code ${code})`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = {
  cleanUrl,
  identifyPlatform,
  getVideoInfo,
  downloadMedia,
  formatBytes,
  formatDuration,
  YT_DLP_PATH,
  FFMPEG_PATH,
  DOWNLOADS_DIR
};
