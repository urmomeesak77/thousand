'use strict';

const crypto = require('crypto');

const UUID_LENGTH = 36;
const WS_OPEN = 1;

class PlayerRegistry {
  constructor() {
    this.players = new Map();      // playerId -> Player
    this._tokenIndex = new Map();  // sessionToken -> playerId
  }

  create(ws, clientIp) {
    const playerId = crypto.randomUUID();
    const sessionToken = crypto.randomUUID();
    this.players.set(playerId, {
      id: playerId,
      nickname: null,
      gameId: null,
      ws,
      sessionToken,
      disconnectedAt: null,
      graceTimer: null,
    });
    this._tokenIndex.set(sessionToken, playerId);
    ws._clientIp = clientIp;
    ws._playerId = playerId;
    return { playerId, sessionToken };
  }

  createOrRestore(ws, clientIp, playerId, sessionToken) {
    const isValidShape = typeof playerId === 'string' && typeof sessionToken === 'string'
      && playerId.length === UUID_LENGTH && sessionToken.length === UUID_LENGTH;
    if (!isValidShape) {
      const result = this.create(ws, clientIp);
      return { playerId: result.playerId, sessionToken: result.sessionToken, restored: false, nickname: null, gameId: null };
    }
    const player = this.players.get(playerId);
    if (player && player.sessionToken === sessionToken) {
      // Mirror the bookkeeping create() does, so anything that later reads
      // ws._clientIp / ws._playerId (audit logging, abuse detection) sees the
      // same shape on restored sessions.
      ws._clientIp = clientIp;
      ws._playerId = playerId;
      return { playerId, sessionToken, restored: true, nickname: player.nickname, gameId: player.gameId };
    }
    const result = this.create(ws, clientIp);
    return { playerId: result.playerId, sessionToken: result.sessionToken, restored: false, nickname: null, gameId: null };
  }

  findBySessionToken(token) {
    if (typeof token !== 'string') {return null;}
    const playerId = this._tokenIndex.get(token);
    if (playerId) {
      const player = this.players.get(playerId);
      if (player && player.sessionToken === token) {return player;}
    }
    // Fallback for code paths that mutate `players` directly without going
    // through create (tests, in-memory fixtures). Production traffic always
    // hits the index above.
    for (const [, player] of this.players) {
      if (player.sessionToken === token) {return player;}
    }
    return null;
  }

  sendToPlayer(playerId, payload) {
    const player = this.players.get(playerId);
    if (player && player.ws && player.ws.readyState === WS_OPEN) {
      try { player.ws.send(JSON.stringify(payload)); } catch { /* ignore */ }
    }
  }

  serializePlayers(game) {
    return [...game.players].map((pid) => {
      const p = this.players.get(pid);
      return p ? { nickname: p.nickname } : null;
    }).filter(Boolean);
  }

  remove(playerId) {
    const player = this.players.get(playerId);
    if (!player) {return null;}
    this._tokenIndex.delete(player.sessionToken);
    this.players.delete(playerId);
    return player;
  }
}

module.exports = PlayerRegistry;
