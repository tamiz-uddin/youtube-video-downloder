/**
 * OmniDownloader — Obsidian Studio Client Controller
 * Refined human-crafted interactions, platform morphing, and segmented format selection
 */

// State
let currentVideoData = null;
let currentTabMode = 'video'; // 'video' | 'audio'
let selectedFormat = null;
let currentEventSource = null;
let statusMessageInterval = null;

// Platform Brand SVG Icons for Morphing
const PLATFORM_ICONS = {
  youtube: `<svg viewBox="0 0 24 24" fill="currentColor" color="#ef4444"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24" fill="currentColor" color="#06b6d4"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" fill="currentColor" color="#ec4899"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073z"/></svg>`,
  twitter: `<svg viewBox="0 0 24 24" fill="currentColor" color="#f8fafc"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  reddit: `<svg viewBox="0 0 24 24" fill="currentColor" color="#f97316"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.702z"/></svg>`,
  default: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`
};

// DOM References
const videoUrlInput = document.getElementById('videoUrlInput');
const commandBarBox = document.getElementById('commandBarBox');
const platformIndicatorIcon = document.getElementById('platformIndicatorIcon');
const clearInputBtn = document.getElementById('clearInputBtn');
const fetchBtn = document.getElementById('fetchBtn');
const quickDownloadBtn = document.getElementById('quickDownloadBtn');
const quickAudioBtn = document.getElementById('quickAudioBtn');
const downloadForm = document.getElementById('downloadForm');

const liveStatusBar = document.getElementById('liveStatusBar');
const liveStatusText = document.getElementById('liveStatusText');
const errorAlert = document.getElementById('errorAlert');
const errorTitle = document.getElementById('errorTitle');
const errorMessage = document.getElementById('errorMessage');

const videoResultCard = document.getElementById('videoResultCard');
const resultThumbnail = document.getElementById('resultThumbnail');
const resultDuration = document.getElementById('resultDuration');
const resultPlatformTag = document.getElementById('resultPlatformTag');
const resultTitle = document.getElementById('resultTitle');
const resultUploader = document.getElementById('resultUploader');
const resultViews = document.getElementById('resultViews');
const playPreviewBtn = document.getElementById('playPreviewBtn');

const quickDirectVideoBtn = document.getElementById('quickDirectVideoBtn');
const quickDirectAudioBtn = document.getElementById('quickDirectAudioBtn');

const tabVideoFormats = document.getElementById('tabVideoFormats');
const tabAudioFormats = document.getElementById('tabAudioFormats');
const qualityChipsContainer = document.getElementById('qualityChipsContainer');

const startDownloadBtn = document.getElementById('startDownloadBtn');
const downloadBtnText = document.getElementById('downloadBtnText');
const directStreamBtn = document.getElementById('directStreamBtn');

const progressCard = document.getElementById('progressCard');
const progressTrackFill = document.getElementById('progressTrackFill');
const progressPercentage = document.getElementById('progressPercentage');
const progressStatusLabel = document.getElementById('progressStatusLabel');
const progressSpeed = document.getElementById('progressSpeed');
const progressEta = document.getElementById('progressEta');

const readyDownloadBanner = document.getElementById('readyDownloadBanner');
const readyDownloadLink = document.getElementById('readyDownloadLink');
const readyFileNameText = document.getElementById('readyFileNameText');

const videoModal = document.getElementById('videoModal');
const previewVideoPlayer = document.getElementById('previewVideoPlayer');
const closeVideoModalBtn = document.getElementById('closeVideoModalBtn');

const extensionGuideModal = document.getElementById('extensionGuideModal');
const openExtensionGuideBtn = document.getElementById('openExtensionGuideBtn');
const closeExtensionModalBtn = document.getElementById('closeExtensionModalBtn');
const copyExtensionsUrlBtn = document.getElementById('copyExtensionsUrlBtn');

// Detect platform from string
function detectPlatformKey(url) {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
  if (u.includes('reddit.com')) return 'reddit';
  return null;
}

// Update left indicator icon based on input
function updatePlatformIcon(url) {
  const platform = detectPlatformKey(url);
  if (platform && PLATFORM_ICONS[platform]) {
    platformIndicatorIcon.innerHTML = PLATFORM_ICONS[platform];
  } else {
    platformIndicatorIcon.innerHTML = PLATFORM_ICONS.default;
  }

  // Clear button visibility
  if (url && url.length > 0) {
    clearInputBtn.style.display = 'inline-flex';
  } else {
    clearInputBtn.style.display = 'none';
  }
}

// Live typing input listener
videoUrlInput.addEventListener('input', () => {
  const val = videoUrlInput.value.trim();
  updatePlatformIcon(val);
  hideError();
});

// Clear input button
clearInputBtn.addEventListener('click', () => {
  videoUrlInput.value = '';
  updatePlatformIcon('');
  videoUrlInput.focus();
  hideError();
});

// Auto-trigger on paste (Ctrl+V or Right-click paste)
videoUrlInput.addEventListener('paste', () => {
  setTimeout(() => {
    const val = videoUrlInput.value.trim();
    if (val && (val.startsWith('http://') || val.startsWith('https://') || val.includes('.com') || val.includes('.be'))) {
      updatePlatformIcon(val);
      fetchVideoMetadata(val);
    }
  }, 100);
});

// Form submit on Enter key
if (downloadForm) {
  downloadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = videoUrlInput.value.trim();
    if (!val) {
      videoUrlInput.focus();
      return;
    }
    fetchVideoMetadata(val);
  });
}

// Fetch button click
if (fetchBtn) {
  fetchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const val = videoUrlInput.value.trim();
    if (!val) {
      videoUrlInput.focus();
      return;
    }
    fetchVideoMetadata(val);
  });
}

// Direct 1-Click Video / Audio from Command Bar
async function triggerDirectDownload(url, isAudio = false) {
  if (!url) return;
  setLoadingState(true);
  hideError();
  resetProgressCard(isAudio);

  if (quickDownloadBtn) quickDownloadBtn.disabled = true;
  if (quickAudioBtn) quickAudioBtn.disabled = true;
  if (fetchBtn) fetchBtn.disabled = true;

  try {
    const infoRes = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const infoJson = await infoRes.json();
    const title = (infoJson.data && infoJson.data.title) ? infoJson.data.title : 'video';
    const thumbnail = (infoJson.data && infoJson.data.thumbnail) ? infoJson.data.thumbnail : null;
    const platform = (infoJson.data && infoJson.data.platform) ? infoJson.data.platform : 'video';

    const formatId = isAudio ? 'bestaudio/best' : 'bestvideo+bestaudio/best';

    const startRes = await fetch('/api/download/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        formatId,
        title,
        isAudio,
        thumbnail,
        platform
      })
    });
    const startJson = await startRes.json();
    if (!startRes.ok || !startJson.success) {
      throw new Error(startJson.error || 'Failed to start direct download.');
    }

    listenToProgress(startJson.jobId);
  } catch (err) {
    showError('Download Notice', err.message);
  } finally {
    setLoadingState(false);
    if (quickDownloadBtn) quickDownloadBtn.disabled = false;
    if (quickAudioBtn) quickAudioBtn.disabled = false;
    if (fetchBtn) fetchBtn.disabled = false;
  }
}

if (quickDownloadBtn) {
  quickDownloadBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const val = videoUrlInput.value.trim();
    if (!val) {
      videoUrlInput.focus();
      return;
    }
    triggerDirectDownload(val, false);
  });
}

if (quickAudioBtn) {
  quickAudioBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const val = videoUrlInput.value.trim();
    if (!val) {
      videoUrlInput.focus();
      return;
    }
    triggerDirectDownload(val, true);
  });
}

// Start & Stop Loading Feedback
function setLoadingState(isLoading) {
  if (isLoading) {
    commandBarBox.classList.add('is-loading');
    liveStatusBar.style.display = 'flex';
    fetchBtn.disabled = true;

    const messages = [
      'Connecting to stream extractor...',
      'Resolving video tracks & formats...',
      'Extracting 1080p stream metadata...',
      'Finalizing format table...'
    ];
    let idx = 0;
    liveStatusText.textContent = messages[0];
    if (statusMessageInterval) clearInterval(statusMessageInterval);
    statusMessageInterval = setInterval(() => {
      idx = (idx + 1) % messages.length;
      liveStatusText.textContent = messages[idx];
    }, 2800);
  } else {
    commandBarBox.classList.remove('is-loading');
    liveStatusBar.style.display = 'none';
    fetchBtn.disabled = false;
    if (statusMessageInterval) {
      clearInterval(statusMessageInterval);
      statusMessageInterval = null;
    }
  }
}

// Fetch Video Info API
async function fetchVideoMetadata(url) {
  if (!url) return;

  setLoadingState(true);
  hideError();
  videoResultCard.style.display = 'none';
  progressCard.style.display = 'none';
  if (currentEventSource) currentEventSource.close();

  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), 26000);

  try {
    const res = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal
    });

    clearTimeout(timeoutTimer);
    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result.error || result.details || 'Unable to extract video details.');
    }

    renderResultCard(result.data);
  } catch (err) {
    clearTimeout(timeoutTimer);
    let msg = err.message;
    if (err.name === 'AbortError') {
      msg = 'Extraction timed out after 26 seconds. The video may be private or temporarily restricted.';
    }
    showError('Extraction Notice', msg);
  } finally {
    setLoadingState(false);
  }
}

// Render Result Card
function renderResultCard(data) {
  currentVideoData = data;
  currentTabMode = 'video';

  resultThumbnail.src = data.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80';
  resultDuration.textContent = data.durationFormatted || '00:00';
  resultPlatformTag.textContent = (data.platform || 'video').toUpperCase();
  resultTitle.textContent = data.title;
  resultUploader.textContent = data.uploader;
  resultViews.textContent = data.views ? `• ${data.views} views` : '';

  // Direct preview link
  if (data.previewUrl) {
    directStreamBtn.style.display = 'inline-flex';
    directStreamBtn.onclick = () => window.open(data.previewUrl, '_blank');
    playPreviewBtn.style.display = 'flex';
    playPreviewBtn.onclick = () => openPreviewModal(data.previewUrl);
  } else {
    directStreamBtn.style.display = 'none';
    playPreviewBtn.style.display = 'none';
  }

  // Set default tabs
  tabVideoFormats.classList.add('active');
  tabAudioFormats.classList.remove('active');

  renderQualityChips('video');

  videoResultCard.style.display = 'block';
  videoResultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Render Quality Chips based on selected tab mode ('video' | 'audio')
function renderQualityChips(mode) {
  currentTabMode = mode;
  qualityChipsContainer.innerHTML = '';

  if (!currentVideoData || !currentVideoData.formats) return;

  const filtered = currentVideoData.formats.filter(f => f.type === mode);
  const listToRender = filtered.length > 0 ? filtered : currentVideoData.formats;

  listToRender.forEach((fmt, index) => {
    const chip = document.createElement('div');
    chip.className = `quality-chip ${index === 0 ? 'selected' : ''}`;
    chip.innerHTML = `
      <span class="chip-label">${fmt.label}</span>
      <span class="chip-size">${fmt.estimatedSize}</span>
    `;

    chip.addEventListener('click', () => {
      document.querySelectorAll('.quality-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      selectedFormat = fmt;
      updateDownloadButtonLabel(fmt);
    });

    qualityChipsContainer.appendChild(chip);

    if (index === 0) {
      selectedFormat = fmt;
      updateDownloadButtonLabel(fmt);
    }
  });
}

function updateDownloadButtonLabel(fmt) {
  if (!fmt) return;
  const typeText = fmt.type === 'audio' ? 'MP3' : 'MP4';
  downloadBtnText.textContent = `Download ${fmt.label} • ${typeText} (${fmt.estimatedSize})`;
}

// Tab Switchers
tabVideoFormats.addEventListener('click', () => {
  tabVideoFormats.classList.add('active');
  tabAudioFormats.classList.remove('active');
  renderQualityChips('video');
});

tabAudioFormats.addEventListener('click', () => {
  tabAudioFormats.classList.add('active');
  tabVideoFormats.classList.remove('active');
  renderQualityChips('audio');
});

// Direct 1-Click Action Buttons from Result Card
async function startDirectDownloadJob(formatId, isAudio) {
  if (!currentVideoData) return;
  resetProgressCard(isAudio);
  if (startDownloadBtn) startDownloadBtn.disabled = true;
  if (quickDirectVideoBtn) quickDirectVideoBtn.disabled = true;
  if (quickDirectAudioBtn) quickDirectAudioBtn.disabled = true;

  try {
    const res = await fetch('/api/download/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: currentVideoData.originalUrl,
        formatId,
        title: currentVideoData.title,
        isAudio,
        thumbnail: currentVideoData.thumbnail,
        platform: currentVideoData.platform
      })
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to start direct download.');
    }

    listenToProgress(json.jobId);
  } catch (err) {
    showError('Download Notice', err.message);
  } finally {
    if (startDownloadBtn) startDownloadBtn.disabled = false;
    if (quickDirectVideoBtn) quickDirectVideoBtn.disabled = false;
    if (quickDirectAudioBtn) quickDirectAudioBtn.disabled = false;
  }
}

if (quickDirectVideoBtn) {
  quickDirectVideoBtn.addEventListener('click', () => {
    startDirectDownloadJob('bestvideo+bestaudio/best', false);
  });
}

if (quickDirectAudioBtn) {
  quickDirectAudioBtn.addEventListener('click', () => {
    startDirectDownloadJob('bestaudio/best', true);
  });
}

// Trigger Custom Format Download
startDownloadBtn.addEventListener('click', async () => {
  if (!currentVideoData || !selectedFormat) return;

  const isAudio = selectedFormat.type === 'audio';
  resetProgressCard(isAudio);
  startDownloadBtn.disabled = true;

  try {
    const isAudio = selectedFormat.type === 'audio';
    const res = await fetch('/api/download/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: currentVideoData.originalUrl,
        formatId: selectedFormat.formatId,
        title: currentVideoData.title,
        isAudio,
        thumbnail: currentVideoData.thumbnail,
        platform: currentVideoData.platform
      })
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to start download job.');
    }

    listenToProgress(json.jobId);
  } catch (err) {
    showError('Download Notice', err.message);
    startDownloadBtn.disabled = false;
  }
});

// Studio Progress Dashboard State Management
function updateProgressUI({ percent, phase, phaseLabel, statusLabel, subLabel, speed, eta, transferred }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
  
  if (progressTrackFill) {
    progressTrackFill.style.width = `${pct}%`;
  }
  
  const pctNumEl = document.getElementById('progressPercentageNumber');
  if (pctNumEl) {
    pctNumEl.textContent = pct;
  } else if (progressPercentage) {
    progressPercentage.textContent = `${pct}%`;
  }

  if (progressStatusLabel && statusLabel) {
    progressStatusLabel.textContent = statusLabel;
  }
  
  const subLabelEl = document.getElementById('progressSubLabel');
  if (subLabelEl && subLabel) {
    subLabelEl.textContent = subLabel;
  }

  const transferredEl = document.getElementById('progressTransferred');
  if (transferredEl && transferred) {
    transferredEl.textContent = transferred;
  }

  if (progressSpeed && speed) {
    progressSpeed.textContent = speed.startsWith('⚡') ? speed : `⚡ ${speed}`;
  }

  if (progressEta && eta) {
    progressEta.textContent = eta.startsWith('⏱️') ? eta : `⏱️ ${eta}`;
  }

  const phaseBadgeEl = document.getElementById('progressPhaseBadge');
  if (phaseBadgeEl && phaseLabel) {
    phaseBadgeEl.textContent = phaseLabel;
  }

  // Stepper pill updates
  const stageVideo = document.getElementById('stageVideo');
  const stageAudio = document.getElementById('stageAudio');
  const stageMux = document.getElementById('stageMux');

  if (stageVideo && stageAudio && stageMux) {
    if (phase === 'muxing') {
      stageVideo.className = 'progress-step-pill completed';
      stageAudio.className = 'progress-step-pill completed';
      stageMux.className = 'progress-step-pill active';
      progressCard.classList.add('is-muxing');
    } else if (phase === 'audio') {
      stageVideo.className = 'progress-step-pill completed';
      stageAudio.className = 'progress-step-pill active';
      stageMux.className = 'progress-step-pill';
      progressCard.classList.remove('is-muxing');
    } else if (phase === 'completed') {
      stageVideo.className = 'progress-step-pill completed';
      stageAudio.className = 'progress-step-pill completed';
      stageMux.className = 'progress-step-pill completed';
      progressCard.classList.remove('is-muxing');
    } else {
      // Default: video phase
      stageVideo.className = 'progress-step-pill active';
      stageAudio.className = 'progress-step-pill';
      stageMux.className = 'progress-step-pill';
      progressCard.classList.remove('is-muxing');
    }
  }
}

function resetProgressCard(isAudio = false) {
  progressCard.style.display = 'block';
  progressCard.classList.remove('is-muxing');
  if (readyDownloadBanner) readyDownloadBanner.style.display = 'none';

  updateProgressUI({
    percent: 0,
    phase: isAudio ? 'audio' : 'video',
    phaseLabel: isAudio ? 'Audio Stream' : 'Video Track',
    statusLabel: isAudio ? 'Extracting High-Bitrate Audio Stream...' : 'Connecting to Stream Delivery Network...',
    subLabel: 'Allocating high-speed buffer & initializing stream capture',
    speed: 'Initializing...',
    eta: 'Estimating...',
    transferred: '0.0 MB / Allocating'
  });

  const stageVideo = document.getElementById('stageVideo');
  if (stageVideo && isAudio) {
    stageVideo.style.display = 'none';
  } else if (stageVideo) {
    stageVideo.style.display = 'inline-flex';
  }
}

// SSE Download Progress
function listenToProgress(jobId) {
  if (currentEventSource) currentEventSource.close();

  currentEventSource = new EventSource(`/api/progress/${jobId}`);

  currentEventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.status === 'queued') {
      updateProgressUI({
        percent: 8,
        phase: 'queued',
        phaseLabel: `Queue #${data.queuePosition || 1}`,
        statusLabel: 'Server Buffer Full — Queued in Line',
        subLabel: data.message || `Position #${data.queuePosition || 1} in queue. Download will commence automatically.`,
        speed: 'In Queue',
        eta: 'Waiting Slot',
        transferred: 'Standby'
      });
    } else if (data.status === 'downloading') {
      const pct = Math.round(data.percent || 0);
      updateProgressUI({
        percent: pct,
        phase: data.phase || 'video',
        phaseLabel: data.phaseLabel || (data.phase === 'audio' ? 'Audio Stream' : 'Video Track'),
        statusLabel: data.phase === 'audio' ? 'Downloading Audio Stream' : 'Downloading Video Stream',
        subLabel: `Receiving media packets (${data.transferred || data.size || 'In Progress'})`,
        speed: data.speed || 'Analyzing...',
        eta: data.eta || 'Estimating...',
        transferred: data.transferred || (data.size ? data.size : 'In progress')
      });
    } else if (data.status === 'processing') {
      updateProgressUI({
        percent: Math.max(96, Math.round(data.percent || 96)),
        phase: 'muxing',
        phaseLabel: 'FFmpeg Muxing',
        statusLabel: '⚡ Assembling & Merging Media Container',
        subLabel: 'Muxing high-definition video track with lossless audio into standard MP4',
        speed: 'Processing',
        eta: 'Finalizing',
        transferred: data.transferred || 'Finalizing Container'
      });
    } else if (data.status === 'completed') {
      updateProgressUI({
        percent: 100,
        phase: 'completed',
        phaseLabel: 'Finished ✓',
        statusLabel: '✓ Stream Assembled & Ready!',
        subLabel: 'Delivering file directly to your browser download manager',
        speed: 'Complete',
        eta: 'Done',
        transferred: '100% Ready'
      });
      startDownloadBtn.disabled = false;

      const targetFileName = data.fileName;
      if (targetFileName) {
        try {
          currentEventSource.close();
        } catch (e) {}

        // 1. Guaranteed fallback direct download button on the card
        if (readyDownloadBanner) {
          readyDownloadBanner.style.display = 'block';
          if (readyFileNameText) readyFileNameText.textContent = targetFileName;
          if (readyDownloadLink) {
            readyDownloadLink.href = `/files/${encodeURIComponent(targetFileName)}`;
            readyDownloadLink.download = targetFileName;
          }
        }

        // 2. Automatic browser download trigger
        try {
          const downloadUrl = `/files/${encodeURIComponent(targetFileName)}`;
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = targetFileName;
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            try { document.body.removeChild(link); } catch (e) {}
          }, 1000);
        } catch (downloadErr) {
          console.warn('[Download] Auto trigger failed:', downloadErr);
        }
      }
    } else if (data.status === 'error') {
      updateProgressUI({
        percent: 0,
        phase: 'error',
        phaseLabel: 'Error',
        statusLabel: 'Stream Extraction Failed',
        subLabel: data.error || 'The remote media server rejected the stream request.',
        speed: 'Halted',
        eta: 'Failed',
        transferred: 'Error'
      });
      showError('Download Notice', data.error || 'Failed during audio/video stream muxing.');
      startDownloadBtn.disabled = false;
      currentEventSource.close();
    }
  };

  currentEventSource.onerror = () => {
    currentEventSource.close();
    startDownloadBtn.disabled = false;
  };
}

// Video Modal Player
function openPreviewModal(streamUrl) {
  previewVideoPlayer.src = streamUrl;
  videoModal.style.display = 'flex';
  previewVideoPlayer.play().catch(e => console.log('Autoplay prevented:', e));
}

closeVideoModalBtn.addEventListener('click', () => {
  previewVideoPlayer.pause();
  previewVideoPlayer.src = '';
  videoModal.style.display = 'none';
});

// Extension Guide Modal
openExtensionGuideBtn.addEventListener('click', () => {
  extensionGuideModal.style.display = 'flex';
});

closeExtensionModalBtn.addEventListener('click', () => {
  extensionGuideModal.style.display = 'none';
});

if (copyExtensionsUrlBtn) {
  copyExtensionsUrlBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('chrome://extensions');
      const span = copyExtensionsUrlBtn.querySelector('span');
      if (span) span.textContent = 'Copied!';
      setTimeout(() => {
        if (span) span.textContent = 'Copy URL';
      }, 2000);
    } catch (e) {
      window.prompt('Copy this URL:', 'chrome://extensions');
    }
  });
}

window.addEventListener('click', (e) => {
  if (e.target === videoModal) {
    previewVideoPlayer.pause();
    previewVideoPlayer.src = '';
    videoModal.style.display = 'none';
  }
  if (e.target === extensionGuideModal) {
    extensionGuideModal.style.display = 'none';
  }
});

// Error Alerts
function showError(title, msg) {
  errorAlert.style.display = 'flex';
  errorAlert.classList.add('active');
  errorTitle.textContent = title;
  errorMessage.textContent = msg;
}

function hideError() {
  errorAlert.style.display = 'none';
  errorAlert.classList.remove('active');
}

// ==========================================================================
// Mobile Touch Paste Button
// ==========================================================================
const pasteTouchBtn = document.getElementById('pasteTouchBtn');
if (pasteTouchBtn) {
  pasteTouchBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        videoUrlInput.value = text.trim();
        updatePlatformIcon(text.trim());
        fetchVideoMetadata(text.trim());
      }
    } catch (err) {
      videoUrlInput.focus();
    }
  });
}

// Dock pill tap helper
document.querySelectorAll('.dock-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    videoUrlInput.focus();
  });
});

// ==========================================================================
// Progressive Web App (PWA) — Service Worker & Install Prompt
// ==========================================================================
let deferredInstallPrompt = null;
const btnPwaInstall = document.getElementById('btnPwaInstall');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (btnPwaInstall) {
    btnPwaInstall.style.display = 'inline-flex';
  }
});

if (btnPwaInstall) {
  btnPwaInstall.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    console.log('[PWA] User response to install prompt:', outcome);
    deferredInstallPrompt = null;
    btnPwaInstall.style.display = 'none';
  });
}

window.addEventListener('appinstalled', () => {
  console.log('[PWA] OmniDownloader installed successfully');
  if (btnPwaInstall) btnPwaInstall.style.display = 'none';
});

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      console.log('[PWA] Service Worker registered with scope:', registration.scope);
    }).catch((err) => {
      console.warn('[PWA] Service Worker registration failed:', err);
    });
  });
}

// Check URL query parameters (Bookmarklet / External direct trigger)
const urlParams = new URLSearchParams(window.location.search);
const targetQueryUrl = urlParams.get('url');
const autoTrigger = urlParams.get('auto') === '1' || urlParams.get('download') === '1';

if (targetQueryUrl) {
  videoUrlInput.value = targetQueryUrl;
  updatePlatformIcon(targetQueryUrl);
  if (autoTrigger) {
    triggerDirectDownload(targetQueryUrl);
  } else {
    fetchVideoMetadata(targetQueryUrl);
  }
}
