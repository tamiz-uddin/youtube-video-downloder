/**
 * VidLoader - Background Service Worker (Manifest V3)
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

// Register Context Menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'vidloader-download-context',
    title: 'Download Video with VidLoader',
    contexts: ['page', 'link', 'video']
  });
});

// Context Menu click handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'vidloader-download-context') {
    const targetUrl = info.linkUrl || info.srcUrl || info.pageUrl || (tab && tab.url);
    if (!targetUrl) return;

    const title = (tab && tab.title) ? tab.title.slice(0, 50) : 'video';
    triggerDownload(targetUrl, title);
  }
});

// Message listener from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'DOWNLOAD_URL') {
    triggerDownload(request.url, request.title, request.directSrc);
    sendResponse({ success: true });
  }
  return true;
});

// Perform Download via Chrome Downloads API
async function triggerDownload(url, title, directSrc) {
  const backendBase = await getBackendUrl();
  const cleanTitle = (title || 'video').replace(/[/\\?%*:|"<>]/g, '_').slice(0, 50);

  // If a direct video src exists and backend is optional
  if (directSrc && directSrc.startsWith('http') && !directSrc.includes('blob:')) {
    chrome.downloads.download({
      url: directSrc,
      filename: `${cleanTitle}.mp4`,
      saveAs: false
    });
    return;
  }

  // Otherwise route to the VidLoader stream endpoint
  const streamUrl = `${backendBase}/api/download/stream?url=${encodeURIComponent(url)}&formatId=bestvideo+bestaudio/best&audio=0&title=${encodeURIComponent(cleanTitle)}`;

  chrome.downloads.download({
    url: streamUrl,
    filename: `${cleanTitle}.mp4`,
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.warn('Chrome download error:', chrome.runtime.lastError.message);
      // Fallback: open web app dashboard
      chrome.tabs.create({ url: `${backendBase}/?url=${encodeURIComponent(url)}` });
    }
  });
}
