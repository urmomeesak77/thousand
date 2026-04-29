'use strict';

const HttpUtil = require('../utils/HttpUtil');

class ConnectionManager {
  constructor(store) {
    this._store = store;
    this._wsConnectionsByIp = new Map(); // ip -> count
    this._wsMessageCounts = new Map();   // ws -> { count, resetAt }
    this._clients = new Set();
    this._heartbeatTimer = null;
  }

  // T011 – WebSocket connection handler
  handleConnection(ws) {
    const clientIp = HttpUtil.normalizeIp(ws._socket?.remoteAddress || 'unknown');
    const currentCount = this._wsConnectionsByIp.get(clientIp) || 0;
    if (currentCount >= 10) {
      ws.close(1008, 'Too many connections from this IP');
      return;
    }

    this._wsConnectionsByIp.set(clientIp, currentCount + 1);
    this._clients.add(ws);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws._helloTimer = setTimeout(() => ws.close(1008, 'Hello timeout'), 5000);

    ws.on('message', (data) => this._handleMessage(ws, data));
    ws.on('close', () => {
      clearTimeout(ws._helloTimer);
      this._store.handlePlayerDisconnect(ws._playerId, ws);
      this._wsMessageCounts.delete(ws);
      this._clients.delete(ws);
      this._decrementIpCount(clientIp);
    });
  }

  // Periodic ping/pong sweep — terminates connections that didn't pong since the last sweep,
  // so handlePlayerDisconnect cleans up zombies whose TCP close never reached us.
  startHeartbeat(intervalMs = 30000) {
    if (this._heartbeatTimer) {
      return;
    }
    this._heartbeatTimer = setInterval(() => {
      for (const ws of this._clients) {
        if (ws.isAlive === false) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch {
          // socket already dead — close handler will clean up
        }
      }
    }, intervalMs);
    if (typeof this._heartbeatTimer.unref === 'function') {
      this._heartbeatTimer.unref();
    }
  }

  stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
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
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
      ws.send(JSON.stringify({ type: 'error', code: 'invalid_message', message: 'Invalid message' }));
      return;
    }
    if (msg.type === 'ping') {
      return;
    }

    if (msg.type === 'hello') {
      if (ws._playerId) {
        return;
      }
      clearTimeout(ws._helloTimer);
      const clientIp = HttpUtil.normalizeIp(ws._socket?.remoteAddress || 'unknown');
      const result = this._store.createOrRestorePlayer(ws, clientIp, msg.playerId, msg.sessionToken);
      ws._playerId = result.playerId;
      if (result.restored) {
        this._store.reconnectPlayer(result.playerId, ws);
      }
      ws.send(JSON.stringify({ type: 'connected', playerId: result.playerId, sessionToken: result.sessionToken, restored: result.restored, nickname: result.nickname }));
      ws.send(JSON.stringify({ type: 'lobby_update', games: this._store.getLobbyGames() }));
      if (result.restored && result.gameId) {
        const game = this._store.games.get(result.gameId);
        if (game) {
          ws.send(JSON.stringify({ type: 'game_joined', gameId: result.gameId, players: this._store.serializePlayers(game), createdAt: game.createdAt }));
        }
      }
      return;
    }

    // Lobby flows are HTTP-driven; gameplay protocol over WS is not implemented yet.
    // Until then, anything other than ping is rejected so a misbehaving client
    // doesn't silently believe it sent a meaningful command.
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
