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
    };
  }

  static serve(req, res) {
    const publicDir = path.join(__dirname, '..', 'public');
    const filePath = req.url === '/'
      ? path.join(publicDir, 'lobby.html')
      : path.join(publicDir, req.url.split('?')[0]);

    if (!filePath.startsWith(publicDir)) {
      res.writeHead(404); res.end('Not Found');
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
