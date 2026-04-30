'use strict';

const path = require('path');
const fs = require('fs');

class StaticServer {
  static get MIME() {
    return {
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
  }

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

    // Check that resolved path is within publicDir
    const publicDirWithSep = publicDir + path.sep;
    const isValid = filePath.startsWith(publicDirWithSep) || filePath === path.join(publicDir, 'index.html');
    if (!isValid) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const contentType = StaticServer.MIME[path.extname(filePath)] || 'text/plain';

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
