/**
 * OmniDownloader - Content Script
 * Injects sleek floating download triggers over social media video elements
 */

const BACKEND_BASE = 'http://localhost:3000';

function formatDurationSec(sec) {
  if (!sec || isNaN(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Sniff for current video metadata on page
function detectActiveVideo() {
  const videos = Array.from(document.querySelectorAll('video'));
  const validVideos = videos.filter(v => v.src || (v.querySelector('source') && v.querySelector('source').src));

  if (validVideos.length > 0) {
    const v = validVideos[0];
    const src = v.src || (v.querySelector('source') ? v.querySelector('source').src : '');
    return {
      found: true,
      src,
      poster: v.poster || '',
      duration: formatDurationSec(v.duration),
      title: document.title,
      domain: window.location.hostname
    };
  }

  // YouTube Specific Check
  if (window.location.hostname.includes('youtube.com')) {
    const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1');
    return {
      found: true,
      title: titleEl ? titleEl.textContent.trim() : document.title,
      domain: 'YouTube',
      url: window.location.href
    };
  }

  // TikTok Specific Check
  if (window.location.hostname.includes('tiktok.com')) {
    return {
      found: true,
      title: document.title,
      domain: 'TikTok',
      url: window.location.href
    };
  }

  // Reddit Specific Check
  if (window.location.hostname.includes('reddit.com')) {
    return {
      found: true,
      title: document.title,
      domain: 'Reddit',
      url: window.location.href
    };
  }

  return { found: false };
}

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_PAGE_VIDEO') {
    const details = detectActiveVideo();
    sendResponse(details);
  }
  return true;
});

// Inject Quick Action floating badges over videos
function injectDownloadBadges() {
  const videos = document.querySelectorAll('video');

  videos.forEach((video) => {
    // Avoid double injection
    if (video.dataset.omniInjected === 'true') return;
    video.dataset.omniInjected = 'true';

    const container = video.parentElement;
    if (!container) return;

    // Ensure relative positioning
    const computedStyle = window.getComputedStyle(container);
    if (computedStyle.position === 'static') {
      container.style.position = 'relative';
    }

    const btn = document.createElement('button');
    btn.className = 'omni-floating-btn';
    btn.title = 'Download Video with VidLoader';
    btn.innerHTML = `
      <svg class="omni-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
      <span>Download</span>
    `;

    // Click handler
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const pageUrl = window.location.href;
      const cleanTitle = (document.title || 'video').replace(/[/\\?%*:|"<>]/g, '_').slice(0, 50);

      // Tell background service worker to trigger download
      chrome.runtime.sendMessage({
        action: 'DOWNLOAD_URL',
        url: pageUrl,
        title: cleanTitle,
        directSrc: video.src || ''
      });

      // Quick visual feedback
      btn.style.background = '#10b981';
      btn.querySelector('span').textContent = 'Starting...';
      setTimeout(() => {
        btn.style.background = '';
        btn.querySelector('span').textContent = 'Download';
      }, 2500);
    });

    container.appendChild(btn);
  });
}

// Run initial badge injection and observe DOM for dynamic SPA page loads
injectDownloadBadges();

const observer = new MutationObserver(() => {
  injectDownloadBadges();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
