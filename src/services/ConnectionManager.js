'use strict';

class ConnectionManager {
  constructor(store) {
    this._store = store;
    this._wsConnectionsByIp = new Map(); // ip -> count
    this._wsMessageCounts = new Map();   // ws -> { count, resetAt }
  }

  // T011 – WebSocket connection handler
  handleConnection(ws) {
    const clientIp = ws._socket?.remoteAddress || 'unknown';
    const currentCount = this._wsConnectionsByIp.get(clientIp) || 0;
    if (currentCount >= 10) {
      ws.close(1008, 'Too many connections from this IP');
      return;
    }

    const { playerId, sessionToken } = this._store.createPlayer(ws, clientIp);
    this._wsConnectionsByIp.set(clientIp, currentCount + 1);

    ws.send(JSON.stringify({ type: 'connected', playerId, sessionToken }));
    ws.send(JSON.stringify({ type: 'lobby_update', games: this._store.getLobbyGames() }));
    ws.on('message', (data) => this._handleMessage(ws, data));
    ws.on('close', () => {
      this._store.handlePlayerDisconnect(playerId);
      this._wsMessageCounts.delete(ws);
      this._decrementIpCount(clientIp);
    });
  }

  _handleMessage(ws, data) {
    // Rate limit: 30 messages per 10 seconds per WebSocket
    const now = Date.now();
    const entry = this._wsMessageCounts.get(ws);
    if (!entry || now > entry.resetAt) {
      this._wsMessageCounts.set(ws, { count: 1, resetAt: now + 10000 });
    } else {
      if (entry.count >= 30) {
        ws.close(1008, 'Message rate limit exceeded');
        return;
      }
      entry.count++;
    }

    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', code: 'invalid_message', message: 'Invalid JSON' }));
      return;
    }
    if (msg.type === 'ping') {
      return;
    }
    ws.send(JSON.stringify({ type: 'error', code: 'invalid_message', message: 'Unrecognized message type' }));
  }

  _decrementIpCount(clientIp) {
    const count = this._wsConnectionsByIp.get(clientIp) || 1;
    if (count <= 1) {
      this._wsConnectionsByIp.delete(clientIp);
    } else {
      this._wsConnectionsByIp.set(clientIp, count - 1);
    }
  }
}

module.exports = ConnectionManager;
