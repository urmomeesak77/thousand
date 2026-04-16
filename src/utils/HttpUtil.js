'use strict';

class HttpUtil {
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
      let data = '';
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size <= maxBytes) {
          data += chunk;
        }
      });
      req.on('end', () => {
        if (size > maxBytes) { reject(new Error('Request body too large')); return; }
        try { resolve(JSON.parse(data || '{}')); }
        catch { reject(new Error('Invalid JSON')); }
      });
      req.on('error', reject);
    });
  }
}

module.exports = HttpUtil;
