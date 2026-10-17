const path = require('path');
const fs = require('fs');
const dns = require('dns').promises;

// Known allowed social media & media host domains and subdomains
const ALLOWED_PLATFORM_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'reddit.com',
  'redd.it',
  'facebook.com',
  'fb.watch',
  'threads.net',
  'pinterest.com',
  'pin.it',
  'vimeo.com',
  'soundcloud.com',
  'twitch.tv',
  'dailymotion.com',
  'bilibili.com',
  'vk.com',
  'linkedin.com'
];

/**
 * Checks if an IPv4 or IPv6 address belongs to private/loopback/cloud-metadata ranges
 */
function isPrivateIp(ip) {
  if (!ip) return true;

  // Normalize IPv4-mapped IPv6
  const cleanIp = ip.startsWith('::ffff:') ? ip.replace('::ffff:', '') : ip;

  // IPv4 Checks
  const ipv4Match = cleanIp.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a, b, c, d] = ipv4Match.slice(1).map(Number);
    if ([a, b, c, d].some(octet => octet < 0 || octet > 255)) return true;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (Private)
    if (a === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link-local / Cloud Metadata: 169.254.169.254)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Private)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (a === 192 && b === 168) return true;
    // 100.64.0.0/10 (Shared / Carrier-grade NAT: 100.64.0.0 - 100.127.255.255)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (a >= 224) return true;

    return false;
  }

  // IPv6 Checks
  const lower = cleanIp.toLowerCase();
  if (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fe80:') || // link-local
    lower.startsWith('fc00:') || // unique local
    lower.startsWith('fd00:')    // unique local
  ) {
    return true;
  }

  return false;
}

/**
 * Validates whether a URL is safe to fetch (Blocks SSRF, loopback, private ranges, metadata endpoints)
 * Resolves DNS to protect against DNS rebinding attacks.
 */
async function isSafeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { safe: false, reason: 'Empty or invalid URL.' };
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) {
    return { safe: false, reason: 'URL exceeds maximum allowable length.' };
  }

  // Prevent option injection into CLI
  if (trimmed.startsWith('-')) {
    return { safe: false, reason: 'Invalid URL format.' };
  }

  let parsed;
  try {
    const toParse = (trimmed.startsWith('http://') || trimmed.startsWith('https://'))
      ? trimmed
      : 'https://' + trimmed;
    parsed = new URL(toParse);
  } catch (err) {
    return { safe: false, reason: 'Malformed URL syntax.' };
  }

  // Protocol check (Only http and https allowed)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: 'Only HTTP and HTTPS protocols are permitted.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block explicit internal names & metadata hosts
  const blockedHosts = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '169.254.169.254',
    '100.100.100.200', // Alibaba Cloud metadata
    'metadata.google.internal',
    'metadata'
  ];

  if (blockedHosts.includes(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return { safe: false, reason: 'Requests to internal hostnames or metadata services are prohibited.' };
  }

  // Raw IP in hostname check
  if (isPrivateIp(hostname)) {
    return { safe: false, reason: 'Private or loopback IP addresses are not permitted.' };
  }

  // DNS Rebinding Guard: Resolve hostname to IP and verify it is not in private range
  try {
    const records = await dns.lookup(hostname, { all: true });
    for (const record of records) {
      if (isPrivateIp(record.address)) {
        return { safe: false, reason: 'Target host resolves to a prohibited internal IP address.' };
      }
    }
  } catch (dnsErr) {
    // If domain cannot be resolved via DNS, reject
    return { safe: false, reason: 'Target host could not be resolved or does not exist.' };
  }

  return { safe: true, cleanUrl: parsed.toString() };
}

/**
 * In-memory rate limiter per IP address with automated TTL eviction and max entry capacity
 */
const rateLimitMap = new Map();
const MAX_RATE_LIMIT_ENTRIES = 10000;

// Periodic cleanup every 60 seconds to purge expired entries and prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 60 * 1000).unref();

function rateLimiter(maxRequests = 40, windowMs = 60 * 1000) {
  return (req, res, next) => {
    // Rely on Express's proxy-aware IP calculation
    const ip = req.ip ||
               (req.socket ? req.socket.remoteAddress : null) ||
               'unknown';
    const now = Date.now();

    // Prevent Map explosion under high-variety IP flooding
    if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
      for (const [k, v] of rateLimitMap.entries()) {
        if (now > v.resetTime) rateLimitMap.delete(k);
      }
      if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
        // Clear oldest 20% if still exceeding cap
        let count = 0;
        for (const k of rateLimitMap.keys()) {
          rateLimitMap.delete(k);
          if (++count > 2000) break;
        }
      }
    }

    const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count++;
    }

    rateLimitMap.set(ip, record);

    if (record.count > maxRequests) {
      const waitSeconds = Math.ceil((record.resetTime - now) / 1000);
      return res.status(429).json({
        error: `Rate limit exceeded. Please wait ${waitSeconds}s before requesting again.`,
        retryAfter: waitSeconds
      });
    }

    next();
  };
}

/**
 * Periodically cleans up temporary downloaded media files to prevent disk fill-up
 */
function startDiskCleanup(downloadsDir, maxAgeMs = 15 * 60 * 1000) {
  setInterval(() => {
    try {
      if (!fs.existsSync(downloadsDir)) return;
      const files = fs.readdirSync(downloadsDir);
      const now = Date.now();

      files.forEach((file) => {
        // Never delete hidden files like .gitignore or .gitkeep
        if (file.startsWith('.')) return;

        const fullPath = path.join(downloadsDir, file);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isFile() && (now - stats.mtimeMs > maxAgeMs)) {
            fs.unlinkSync(fullPath);
            console.log(`[Cleaner] 🧹 Auto-purged expired file: ${file}`);
          }
        } catch (e) {}
      });
    } catch (err) {
      console.error('[Cleaner] Error during disk cleanup:', err.message);
    }
  }, 5 * 60 * 1000).unref();
}

module.exports = {
  isSafeUrl,
  isPrivateIp,
  rateLimiter,
  startDiskCleanup
};
