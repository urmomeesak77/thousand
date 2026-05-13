'use strict';

class HttpUtil {
  // Normalize an IP read from a Node socket: collapse IPv4-mapped IPv6
  // (::ffff:1.2.3.4) to plain IPv4 so per-IP buckets don't double-count.
  static normalizeIp(ip) {
    if (typeof ip !== 'string') {return 'unknown';}
    return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  }

  static sendJSON(res, status, body) {
    const json = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(json),
    });
    res.end(json);
  }

  static sendError(res, status, code, message) {
    HttpUtil.sendJSON(res, status, { error: code, message });
  }

  static parseBody(req, maxBytes = 65536) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      let isAborted = false;
      req.on('data', (chunk) => {
        if (isAborted) {
          return;
        }
        size += chunk.length;
        if (size > maxBytes) {
          isAborted = true;
          req.destroy();
          reject(new Error('Request body too large'));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (isAborted) {
          return;
        }
        const data = Buffer.concat(chunks).toString('utf8');
        try {
          resolve(JSON.parse(data || '{}'));
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', (err) => {
        if (!isAborted) {
          reject(err);
        }
      });
    });
  }
}

module.exports = HttpUtil;
