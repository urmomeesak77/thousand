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

// T011 – WebSocket server
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => connectionManager.handleConnection(ws));

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = { server, store, handler, connectionManager };
