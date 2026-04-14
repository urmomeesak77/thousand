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

  static parseBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => {
        try { resolve(JSON.parse(data || '{}')); }
        catch { reject(new Error('Invalid JSON')); }
      });
      req.on('error', reject);
    });
  }
}

module.exports = HttpUtil;
