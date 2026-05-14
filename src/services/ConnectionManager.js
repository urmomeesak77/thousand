'use strict';

const HttpUtil = require('../utils/HttpUtil');
const RoundActionHandler = require('../controllers/RoundActionHandler');

const MAX_CONNECTIONS_PER_IP = 10;
const HELLO_TIMEOUT_MS = 5000;
const MESSAGE_RATE_LIMIT = 30;
const MESSAGE_RATE_WINDOW_MS = 10000;

const ACTION_DISPATCH = {
  bid:         (h, pid, m) => h.handleBid(pid, m.amount),
  pass:        (h, pid)    => h.handlePass(pid),
  sell_start:  (h, pid)    => h.handleSellStart(pid),
  sell_select: (h, pid, m) => h.handleSellSelect(pid, m.cardIds),
  sell_cancel: (h, pid)    => h.handleSellCancel(pid),
  sell_bid:    (h, pid, m) => h.handleSellBid(pid, m.amount),
  sell_pass:   (h, pid)    => h.handleSellPass(pid),
  start_game:  (h, pid)    => h.handleStartGame(pid),
};

class ConnectionManager {
  constructor(store) {
    this._store = store;
    this._wsConnectionsByIp = new Map(); // ip -> count
    this._wsMessageCounts = new Map();   // ws -> { count, resetAt }
    this._clients = new Set();
    this._heartbeatTimer = null;
    this._roundActionHandler = new RoundActionHandler({ store });
  }

  // T011 – WebSocket connection handler
  handleConnection(ws) {
    const clientIp = HttpUtil.normalizeIp(ws._socket?.remoteAddress || 'unknown');
    const currentCount = this._wsConnectionsByIp.get(clientIp) || 0;
    if (currentCount >= MAX_CONNECTIONS_PER_IP) {
      ws.close(1008, 'Too many connections from this IP');
      return;
    }

    this._wsConnectionsByIp.set(clientIp, currentCount + 1);
    this._clients.add(ws);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws._helloTimer = setTimeout(() => ws.close(1008, 'Hello timeout'), HELLO_TIMEOUT_MS);

    ws.on('message', (data) => this._handleMessage(ws, data));
    ws.on('close', () => {
      // try/finally so an unexpected throw in disconnect handling doesn't leak
      // the IP-bucket slot (which would eventually deny legitimate users).
      try {
        clearTimeout(ws._helloTimer);
        this._store.handlePlayerDisconnect(ws._playerId, ws);
        this._wsMessageCounts.delete(ws);
        this._clients.delete(ws);
      } finally {
        this._decrementIpCount(clientIp);
      }
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
    if (this._enforceRateLimit(ws)) {return;}
    const msg = this._parseMessage(ws, data);
    if (!msg) {return;}
    if (msg.type === 'ping') {return;}
    if (msg.type === 'hello') {
      this._handleHello(ws, msg);
      return;
    }
    if (ws._playerId && this._handleAuthedMessage(ws, msg)) {return;}
    ws.send(JSON.stringify({ type: 'error', code: 'invalid_message', message: 'Unrecognized message type' }));
  }

  // Returns true if this message should be dropped (rate-limit exceeded — connection closed).
  _enforceRateLimit(ws) {
    const now = Date.now();
    const entry = this._wsMessageCounts.get(ws);
    if (!entry || now > entry.resetAt) {
      this._wsMessageCounts.set(ws, { count: 1, resetAt: now + MESSAGE_RATE_WINDOW_MS });
      return false;
    }
    if (entry.count >= MESSAGE_RATE_LIMIT) {
      ws.close(1008, 'Message rate limit exceeded');
      return true;
    }
    entry.count++;
    return false;
  }

  // Returns parsed message or null if invalid (error already sent to client).
  _parseMessage(ws, data) {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', code: 'invalid_message', message: 'Invalid JSON' }));
      return null;
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
      ws.send(JSON.stringify({ type: 'error', code: 'invalid_message', message: 'Invalid message' }));
      return null;
    }
    return msg;
  }

  _handleHello(ws, msg) {
    if (ws._playerId) {return;}
    clearTimeout(ws._helloTimer);
    const clientIp = HttpUtil.normalizeIp(ws._socket?.remoteAddress || 'unknown');
    const result = this._store.createOrRestorePlayer(ws, clientIp, msg.playerId, msg.sessionToken);
    ws._playerId = result.playerId;
    if (result.restored) {
      this._store.reconnectPlayer(result.playerId, ws);
    }
    ws.send(JSON.stringify({ type: 'connected', playerId: result.playerId, sessionToken: result.sessionToken, restored: result.restored, nickname: result.nickname, gameId: result.gameId }));
    ws.send(JSON.stringify({ type: 'lobby_update', games: this._store.getLobbyGames() }));
    if (result.restored && result.gameId) {
      this._sendRestoredGameState(ws, result);
    }
  }

  _sendRestoredGameState(ws, result) {
    const game = this._store.games.get(result.gameId);
    if (!game) {return;}
    if (game.status === 'in-progress') {
      const seat = game.round.seatByPlayer.get(result.playerId);
      const snapshot = game.round.getSnapshotFor(seat);
      if (snapshot) {ws.send(JSON.stringify(snapshot));}
    } else {
      ws.send(JSON.stringify({ type: 'game_joined', gameId: result.gameId, players: this._store.serializePlayers(game), createdAt: game.createdAt, inviteCode: game.inviteCode ?? null, requiredPlayers: game.requiredPlayers }));
    }
  }

  // Returns true if the message was handled (known authed action), false to let caller send the unrecognized-type error.
  _handleAuthedMessage(ws, msg) {
    const action = ACTION_DISPATCH[msg.type];
    if (!action) {return false;}
    action(this._roundActionHandler, ws._playerId, msg);
    return true;
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
