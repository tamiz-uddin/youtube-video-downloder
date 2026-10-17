/**
 * VidLoader - Extension Popup Script
 */

const DEFAULT_BACKEND_URL = 'http://localhost:3333';

async function getBackendUrl() {
  return new Promise((resolve) => {
    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(['backendUrl'], (result) => {
        resolve(result.backendUrl || DEFAULT_BACKEND_URL);
      });
    } else {
      resolve(DEFAULT_BACKEND_URL);
    }
  });
}

let activeTabUrl = '';
let activeTabTitle = '';
let currentVideoData = null;
let selectedType = 'video';
let selectedFormat = 'bestvideo+bestaudio/best';

// DOM Elements
const detectedPlatformText = document.getElementById('detectedPlatformText');
const videoCountBadge = document.getElementById('videoCountBadge');
const popupLoader = document.getElementById('popupLoader');
const videoInfoCard = document.getElementById('videoInfoCard');
const popupThumbnail = document.getElementById('popupThumbnail');
const popupDuration = document.getElementById('popupDuration');
const popupVideoTitle = document.getElementById('popupVideoTitle');
const popupUploader = document.getElementById('popupUploader');
const formatSelectorSection = document.getElementById('formatSelectorSection');
const popupDownloadBtn = document.getElementById('popupDownloadBtn');
const noVideoState = document.getElementById('noVideoState');
const noVideoMsg = document.getElementById('noVideoMsg');
const popupStatusMsg = document.getElementById('popupStatusMsg');
const openWebDashboardBtn = document.getElementById('openWebDashboardBtn');
const pasteCustomUrlBtn = document.getElementById('pasteCustomUrlBtn');

// Format Buttons
document.querySelectorAll('.btn-format-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-format-toggle').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedType = btn.dataset.type;
    selectedFormat = btn.dataset.format;
    popupDownloadBtn.querySelector('span').textContent = 
      selectedType === 'audio' ? 'Download MP3' : 'Download Video';
  });
});

// Open Web Dashboard
async function openDashboard(url = '') {
  const backendBase = await getBackendUrl();
  const targetUrl = url ? `${backendBase}/?url=${encodeURIComponent(url)}` : `${backendBase}/`;
  chrome.tabs.create({ url: targetUrl });
}

openWebDashboardBtn.addEventListener('click', () => openDashboard());
pasteCustomUrlBtn.addEventListener('click', () => openDashboard(activeTabUrl));

// Main Initializer
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) return;

    const currentTab = tabs[0];
    activeTabUrl = currentTab.url || '';
    activeTabTitle = currentTab.title || 'Video';

    const platform = detectPlatform(activeTabUrl);
    if (!platform) {
      // Check if page has HTML5 video element
      checkDOMForVideos(currentTab.id);
      return;
    }

    detectedPlatformText.textContent = `${platform} Detected`;
    videoCountBadge.textContent = '1 Video';

    // Fetch video info
    loadVideoDetails(activeTabUrl);
  } catch (err) {
    showNoVideo('Error inspecting active tab: ' + err.message);
  }
});

// Platform Detector
function detectPlatform(url) {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes('youtube.com/watch') || u.includes('youtu.be/') || u.includes('youtube.com/shorts')) return 'YouTube';
  if (u.includes('tiktok.com')) return 'TikTok';
  if (u.includes('instagram.com/p/') || u.includes('instagram.com/reel')) return 'Instagram';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'Twitter/X';
  if (u.includes('reddit.com/r/')) return 'Reddit';
  return null;
}

// Fetch Video Details
async function loadVideoDetails(url) {
  popupLoader.style.display = 'flex';
  videoInfoCard.style.display = 'none';
  formatSelectorSection.style.display = 'none';
  noVideoState.style.display = 'none';

  try {
    const backendBase = await getBackendUrl();
    const response = await fetch(`${backendBase}/api/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data) {
        displayVideoCard(result.data);
        return;
      }
    }
  } catch (backendErr) {
    console.warn('Backend server not reachable, falling back to direct tab probe...');
  }

  // 2. Fallback: Direct inspection via tab content script
  fallbackDirectInspection();
}

// Fallback direct tab inspection
function fallbackDirectInspection() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return showNoVideo('Could not inspect page.');

    chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_PAGE_VIDEO' }, (response) => {
      popupLoader.style.display = 'none';
      if (chrome.runtime.lastError || !response || !response.found) {
        showNoVideo('Backend server offline & no direct video stream detected on tab.');
        return;
      }

      displayVideoCard({
        title: response.title || activeTabTitle,
        uploader: response.domain || 'Direct Media',
        thumbnail: response.poster || 'icons/icon128.png',
        durationFormatted: response.duration || '00:00',
        directStreamUrl: response.src,
        originalUrl: activeTabUrl
      });
    });
  });
}

// Display Video Info in UI
function displayVideoCard(data) {
  currentVideoData = data;
  popupLoader.style.display = 'none';

  popupThumbnail.src = data.thumbnail || 'icons/icon128.png';
  popupDuration.textContent = data.durationFormatted || '00:00';
  popupVideoTitle.textContent = data.title;
  popupUploader.textContent = data.uploader || 'Creator';

  videoInfoCard.style.display = 'flex';
  formatSelectorSection.style.display = 'block';
}

function showNoVideo(msg) {
  popupLoader.style.display = 'none';
  noVideoState.style.display = 'block';
  noVideoMsg.textContent = msg || 'No downloadable social video found on this page.';
}

// Handle Download
popupDownloadBtn.addEventListener('click', async () => {
  if (!currentVideoData) return;

  popupDownloadBtn.disabled = true;
  showStatus('Preparing download...', 'info');

  const cleanTitle = (currentVideoData.title || 'video')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .slice(0, 50);

  const isAudio = selectedType === 'audio';
  const ext = isAudio ? 'mp3' : 'mp4';
  const filename = `${cleanTitle}.${ext}`;

  // If we have a direct stream URL from direct tab sniff
  if (currentVideoData.directStreamUrl && !isAudio) {
    triggerBrowserDownload(currentVideoData.directStreamUrl, filename);
    return;
  }

  // Trigger through backend stream download
  const backendBase = await getBackendUrl();
  const downloadUrl = `${backendBase}/api/download/stream?url=${encodeURIComponent(activeTabUrl)}&formatId=${encodeURIComponent(selectedFormat)}&audio=${isAudio ? '1' : '0'}&title=${encodeURIComponent(cleanTitle)}`;

  triggerBrowserDownload(downloadUrl, filename);
});

// Trigger Chrome Download API
function triggerBrowserDownload(downloadUrl, filename) {
  chrome.downloads.download({
    url: downloadUrl,
    filename: filename,
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      showStatus('Download failed: ' + chrome.runtime.lastError.message, 'error');
      popupDownloadBtn.disabled = false;
    } else {
      showStatus('Download started! Check browser downloads.', 'success');
      setTimeout(() => window.close(), 2500);
    }
  });
}

function showStatus(msg, type) {
  popupStatusMsg.style.display = 'block';
  popupStatusMsg.textContent = msg;
  if (type === 'error') {
    popupStatusMsg.style.background = 'rgba(239, 68, 68, 0.2)';
    popupStatusMsg.style.color = '#fca5a5';
    popupStatusMsg.style.borderColor = 'rgba(239, 68, 68, 0.4)';
  } else {
    popupStatusMsg.style.background = 'rgba(16, 185, 129, 0.15)';
    popupStatusMsg.style.color = '#6ee7b7';
    popupStatusMsg.style.borderColor = 'rgba(16, 185, 129, 0.3)';
  }
}
