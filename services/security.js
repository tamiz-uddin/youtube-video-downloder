const path = require('path');
const fs = require('fs');

/**
 * Validates whether a URL is safe to fetch (Blocks SSRF, loopback, private ranges, metadata endpoints)
 */
function isSafeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return { safe: false, reason: 'Empty or invalid URL.' };

  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) {
    return { safe: false, reason: 'URL exceeds maximum allowable length.' };
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

  // SSRF Loopback & Cloud Metadata Blocks
  const blockedHosts = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '169.254.169.254', // AWS/GCP/Azure instance metadata
    'metadata.google.internal',
    'metadata'
  ];

  if (blockedHosts.includes(hostname)) {
    return { safe: false, reason: 'Requests to internal hostnames or metadata services are prohibited.' };
  }

  // Private IPv4 range checks
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);
  if (match) {
    const octets = match.slice(1).map(Number);
    // 10.0.0.0/8
    if (octets[0] === 10) return { safe: false, reason: 'Private IP addresses are not permitted.' };
    // 172.16.0.0/12
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return { safe: false, reason: 'Private IP addresses are not permitted.' };
    // 192.168.0.0/16
    if (octets[0] === 192 && octets[1] === 168) return { safe: false, reason: 'Private IP addresses are not permitted.' };
    // 127.0.0.0/8
    if (octets[0] === 127) return { safe: false, reason: 'Loopback IP addresses are not permitted.' };
    // 169.254.0.0/16 (Link local)
    if (octets[0] === 169 && octets[1] === 254) return { safe: false, reason: 'Link-local addresses are not permitted.' };
  }

  return { safe: true, cleanUrl: parsed.toString() };
}

/**
 * In-memory rate limiter per IP address
 */
const rateLimitMap = new Map();

function rateLimiter(maxRequests = 40, windowMs = 60 * 1000) {
  return (req, res, next) => {
    const rawForwarded = req.headers['x-forwarded-for'];
    const ip = (rawForwarded ? rawForwarded.split(',')[0].trim() : null) ||
               req.ip ||
               (req.socket ? req.socket.remoteAddress : null) ||
               'unknown';
    const now = Date.now();

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
        const fullPath = path.join(downloadsDir, file);
        try {
          const stats = fs.statSync(fullPath);
          if (now - stats.mtimeMs > maxAgeMs) {
            fs.unlinkSync(fullPath);
            console.log(`[Cleaner] Auto-purged expired file: ${file}`);
          }
        } catch (e) {}
      });
    } catch (err) {
      console.error('[Cleaner] Error during disk cleanup:', err.message);
    }
  }, 5 * 60 * 1000); // Check every 5 minutes
}

module.exports = {
  isSafeUrl,
  rateLimiter,
  startDiskCleanup
};
