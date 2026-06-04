'use strict';

const crypto = require('crypto');

const UUID_LENGTH = 36;
const WS_OPEN = 1;

// Length-prefixed constant-time string compare so a partial-match doesn't leak via
// the linear fallback scan in findBySessionToken.
function safeTokenEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {return false;}
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return crypto.timingSafeEqual(ab, bb);
}

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
      sockets: new Set([ws]),
      sessionToken,
      disconnectedAt: null,
      graceTimer: null,
    });
    this._tokenIndex.set(sessionToken, playerId);
    ws._clientIp = clientIp;
    ws._playerId = playerId;
    return { playerId, sessionToken };
  }

  // A bot is an ordinary seated player with no socket and no session token, so every
  // broadcast (sendToPlayer) silently no-ops and the disconnect/grace lifecycle never
  // touches it. `aggressiveness` (FR-016) is drawn once and persists for the game.
  createBot(nickname) {
    const playerId = crypto.randomUUID();
    this.players.set(playerId, {
      id: playerId,
      nickname,
      gameId: null,
      sockets: new Set(),
      sessionToken: null,
      disconnectedAt: null,
      graceTimer: null,
      isBot: true,
      aggressiveness: Math.random(),
    });
    return { playerId };
  }

  createOrRestore(ws, clientIp, playerId, sessionToken) {
    const isValidShape = typeof playerId === 'string' && typeof sessionToken === 'string'
      && playerId.length === UUID_LENGTH && sessionToken.length === UUID_LENGTH;
    if (!isValidShape) {
      const result = this.create(ws, clientIp);
      return {
        playerId: result.playerId, sessionToken: result.sessionToken,
        restored: false, nickname: null, gameId: null,
      };
    }
    const player = this.players.get(playerId);
    if (player && safeTokenEqual(player.sessionToken, sessionToken)) {
      // Mirror the bookkeeping create() does, so anything that later reads
      // ws._clientIp / ws._playerId (audit logging, abuse detection) sees the
      // same shape on restored sessions.
      ws._clientIp = clientIp;
      ws._playerId = playerId;
      return { playerId, sessionToken, restored: true, nickname: player.nickname, gameId: player.gameId };
    }
    const result = this.create(ws, clientIp);
    return {
      playerId: result.playerId, sessionToken: result.sessionToken,
      restored: false, nickname: null, gameId: null,
    };
  }

  findBySessionToken(token) {
    if (typeof token !== 'string') {return null;}
    const playerId = this._tokenIndex.get(token);
    if (playerId) {
      const player = this.players.get(playerId);
      if (player && safeTokenEqual(player.sessionToken, token)) {return player;}
    }
    // Fallback for code paths that mutate `players` directly without going
    // through create (tests, in-memory fixtures). Production traffic always
    // hits the index above, so the O(n) timing-safe scan is skipped there —
    // otherwise an unauthenticated bad token would force a full per-player scan.
    if (process.env.NODE_ENV !== 'production') {
      for (const [, player] of this.players) {
        if (safeTokenEqual(player.sessionToken, token)) {return player;}
      }
    }
    return null;
  }

  sendToPlayer(playerId, payload) {
    const player = this.players.get(playerId);
    if (!player || !player.sockets) {return;}
    const data = JSON.stringify(payload);
    for (const ws of player.sockets) {
      if (ws.readyState !== WS_OPEN) {continue;}
      // readyState can flip between the check and send; swallow per-socket
      // errors so one dead tab doesn't starve the others.
      try { ws.send(data); } catch { /* ignore */ }
    }
  }

  serializePlayers(game) {
    return [...game.players].map((pid) => {
      const p = this.players.get(pid);
      // A bot's id is exposed so the host can target it for removal (FR-002); it is
      // a server-generated UUID, not a session token. Human ids are never exposed.
      if (!p) {return null;}
      return p.isBot ? { nickname: p.nickname, isBot: true, id: pid } : { nickname: p.nickname, isBot: false };
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
