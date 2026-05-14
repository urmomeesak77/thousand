'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');

const ThousandStore = require('./services/ThousandStore');
const ConnectionManager = require('./services/ConnectionManager');
const RequestHandler = require('./controllers/RequestHandler');

const PORT = process.env.PORT || 3000;

const store = new ThousandStore();
const connectionManager = new ConnectionManager(store);
const handler = new RequestHandler(store);

// T009 – HTTP server
const server = http.createServer((req, res) => {
  handler.handleRequest(req, res).catch((err) => {
    console.error('Unhandled error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal_error', message: 'Internal server error' }));
    }
  });
});

// T011 – WebSocket server. maxPayload matches HttpUtil.parseBody's 64 KiB cap;
// without it the `ws` default of ~100 MiB lets a single frame force-allocate huge buffers.
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

// Empty ALLOWED_ORIGINS disables the origin check (useful for tests / Postman / curl).
// Comma-separated list, e.g. ALLOWED_ORIGINS=https://thousand.example,https://www.thousand.example
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isOriginAllowed(origin) {
  if (ALLOWED_ORIGINS.length === 0) {return true;}
  if (!origin) {return false;}
  return ALLOWED_ORIGINS.includes(origin);
}

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') {
    socket.destroy();
    return;
  }
  if (!isOriginAllowed(req.headers.origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => connectionManager.handleConnection(ws));

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });

  const rateLimiterCleanupTimer = setInterval(() => handler.cleanupRateLimiters(), 60000);
  rateLimiterCleanupTimer.unref();
  connectionManager.startHeartbeat();
}

module.exports = { server, wss, store, handler, connectionManager };
