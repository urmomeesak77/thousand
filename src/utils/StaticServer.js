'use strict';

const path = require('path');
const fs = require('fs');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

class StaticServer {
  static serve(req, res) {
    const publicDir = path.join(__dirname, '..', 'public');
    let urlPath;
    try {
      urlPath = decodeURIComponent(req.url === '/' ? '/index.html' : req.url.split('?')[0]);
    } catch {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    const filePath = path.resolve(publicDir, urlPath.replace(/^\//, ''));

    const publicDirWithSep = publicDir + path.sep;
    if (!filePath.startsWith(publicDirWithSep)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const contentType = MIME[path.extname(filePath)] || 'text/plain';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  }
}

module.exports = StaticServer;
