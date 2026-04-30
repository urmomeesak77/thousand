'use strict';

const crypto = require('crypto');

const WAITING_ROOM_TIMEOUT_MS = 10 * 60 * 1000;

class ThousandStore {
  constructor() {
    this.games = new Map();        // gameId -> Game
    this.players = new Map();      // playerId -> Player
    this.inviteCodes = new Map();  // inviteCode -> gameId
    this._tokenIndex = new Map();  // sessionToken -> playerId
    // A bad env value (e.g. "foo") becomes NaN, and setTimeout(NaN) fires immediately —
    // every disconnect would purge instantly. Reject anything that isn't a positive finite number.
    const parsed = process.env.GRACE_PERIOD_MS ? Number(process.env.GRACE_PERIOD_MS) : null;
    this._gracePeriodMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
  }

  createPlayer(ws, clientIp) {
    const playerId = crypto.randomUUID();
    const sessionToken = crypto.randomUUID();
    this.players.set(playerId, { id: playerId, nickname: null, gameId: null, ws, sessionToken, disconnectedAt: null, graceTimer: null });
    this._tokenIndex.set(sessionToken, playerId);
    ws._clientIp = clientIp;
    ws._playerId = playerId;
    return { playerId, sessionToken };
  }

  createOrRestorePlayer(ws, clientIp, playerId, sessionToken) {
    // crypto.randomUUID() emits 36-char strings (8-4-4-4-12). Reject anything
    // else so probes with malformed ids fall straight through to a fresh identity.
    const validShape = typeof playerId === 'string' && typeof sessionToken === 'string'
      && playerId.length === 36 && sessionToken.length === 36;
    if (!validShape) {
      const result = this.createPlayer(ws, clientIp);
      return { playerId: result.playerId, sessionToken: result.sessionToken, restored: false, nickname: null, gameId: null };
    }
    const player = this.players.get(playerId);
    if (player && player.sessionToken === sessionToken) {
      // Mirror the bookkeeping createPlayer does, so anything that later reads
      // ws._clientIp / ws._playerId (audit logging, abuse detection) sees the
      // same shape on restored sessions.
      ws._clientIp = clientIp;
      ws._playerId = playerId;
      return { playerId, sessionToken, restored: true, nickname: player.nickname, gameId: player.gameId };
    }
    const result = this.createPlayer(ws, clientIp);
    return { playerId: result.playerId, sessionToken: result.sessionToken, restored: false, nickname: null, gameId: null };
  }

  findBySessionToken(token) {
    if (typeof token !== 'string') return null;
    const playerId = this._tokenIndex.get(token);
    if (playerId) {
      const player = this.players.get(playerId);
      if (player && player.sessionToken === token) return player;
    }
    // Fallback for code paths that mutate `players` directly without going
    // through createPlayer (tests, in-memory fixtures). Production traffic
    // always hits the index above.
    for (const [, player] of this.players) {
      if (player.sessionToken === token) return player;
    }
    return null;
  }

  // T026 – invite code generator
  generateInviteCode() {
    let code;
    let attempts = 0;
    do {
      if (++attempts > 1000) {
        throw new Error('Invite code space exhausted');
      }
      code = crypto.randomBytes(3).toString('hex').toUpperCase();
    } while (this.inviteCodes.has(code));
    return code;
  }

  getLobbyGames() {
    const result = [];
    for (const [id, game] of this.games) {
      if (game.type === 'public' && game.status === 'waiting') {
        const host = this.players.get(game.hostId);
        const playerNames = [...game.players]
          .map((pid) => this.players.get(pid)?.nickname)
          .filter(Boolean);
        result.push({
          id,
          playerCount: game.players.size,
          requiredPlayers: game.requiredPlayers,
          owner: host ? host.nickname : null,
          createdAt: game.createdAt,
          players: playerNames,
        });
      }
    }
    return result;
  }

  leaveGame(playerId, gameId) {
    const player = this.players.get(playerId);
    if (!player || player.gameId !== gameId) {
      return false;
    }

    const game = this.games.get(gameId);
    if (!game) {
      return false;
    }

    const { nickname } = player;
    game.players.delete(playerId);
    player.gameId = null;
    this._resolveGameAfterExit(gameId, game, playerId, nickname);
    return true;
  }

  handlePlayerDisconnect(playerId, ws) {
    if (!playerId || !this.players.has(playerId)) {
      return;
    }
    const player = this.players.get(playerId);
    // If a newer ws has replaced this one (last-connect-wins), the old close event
    // is stale — leave the live session alone.
    if (ws && player.ws !== ws) {
      return;
    }
    player.ws = null;
    player.disconnectedAt = Date.now();
    player.graceTimer = setTimeout(() => this._purgePlayer(playerId), this._gracePeriodMs);
  }

  reconnectPlayer(playerId, ws) {
    const player = this.players.get(playerId);
    if (!player) return;
    clearTimeout(player.graceTimer);
    player.graceTimer = null;
    player.disconnectedAt = null;
    if (player.ws && player.ws.readyState === 1 /* OPEN */) {
      player.ws.send(JSON.stringify({ type: 'session_replaced' }));
      player.ws.close();
    }
    player.ws = ws;
    ws._playerId = playerId;
  }

  _purgePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;
    const { gameId, nickname } = player;
    this._tokenIndex.delete(player.sessionToken);
    this.players.delete(playerId);
    if (!gameId) return;
    const game = this.games.get(gameId);
    if (!game) return;
    game.players.delete(playerId);
    this._resolveGameAfterExit(gameId, game, playerId, nickname);
  }

  // T034 – broadcast lobby state to every client whose gameId is null
  broadcastLobbyUpdate() {
    const msg = JSON.stringify({ type: 'lobby_update', games: this.getLobbyGames() });
    for (const [, player] of this.players) {
      if (player.gameId === null && player.ws && player.ws.readyState === 1 /* OPEN */) {
        // readyState can flip between the check and send (socket terminated mid-iteration).
        // Swallow per-recipient errors so one bad ws doesn't abort the broadcast.
        try { player.ws.send(msg); } catch { /* ignore */ }
      }
    }
  }

  sendToPlayer(playerId, payload) {
    const player = this.players.get(playerId);
    if (player && player.ws && player.ws.readyState === 1) {
      try { player.ws.send(JSON.stringify(payload)); } catch { /* ignore */ }
    }
  }

  serializePlayers(game) {
    return [...game.players].map((pid) => {
      const p = this.players.get(pid);
      return p ? { nickname: p.nickname } : null;
    }).filter(Boolean);
  }

  _resolveGameAfterExit(gameId, game, playerId, nickname) {
    if (game.players.size === 0) {
      this._deleteGame(gameId, game);
      return;
    }
    if (game.hostId === playerId && game.status === 'waiting') {
      this._disbandGame(gameId, game);
      return;
    }
    const remaining = this.serializePlayers(game);
    const leftMsg = { type: 'player_left', playerId, nickname, players: remaining };
    for (const pid of game.players) {
      this.sendToPlayer(pid, leftMsg);
    }
    this.broadcastLobbyUpdate();
  }

  _deleteGame(gameId, game) {
    if (game.waitingRoomTimer) {
      clearTimeout(game.waitingRoomTimer);
      game.waitingRoomTimer = null;
    }
    if (game.inviteCode) {
      this.inviteCodes.delete(game.inviteCode);
    }
    this.games.delete(gameId);
    this.broadcastLobbyUpdate();
  }

  _disbandGame(gameId, game, reason = 'host_left') {
    const disbandMsg = { type: 'game_disbanded', reason };
    for (const pid of game.players) {
      const p = this.players.get(pid);
      if (p) {
        p.gameId = null;
      }
      this.sendToPlayer(pid, disbandMsg);
    }
    this._deleteGame(gameId, game);
  }

  scheduleWaitingRoomTimeout(gameId) {
    const game = this.games.get(gameId);
    if (!game) return;
    game.waitingRoomTimer = setTimeout(() => {
      const g = this.games.get(gameId);
      if (!g || g.status !== 'waiting') return;
      this._disbandGame(gameId, g, 'waiting_room_timeout');
    }, WAITING_ROOM_TIMEOUT_MS);
  }
}

module.exports = ThousandStore;
