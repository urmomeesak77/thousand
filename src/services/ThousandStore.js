'use strict';

const crypto = require('crypto');

class ThousandStore {
  constructor() {
    this.games = new Map();       // gameId -> Game
    this.players = new Map();     // playerId -> Player
    this.inviteCodes = new Map(); // inviteCode -> gameId
  }

  createPlayer(ws, clientIp) {
    const playerId = crypto.randomUUID();
    const sessionToken = crypto.randomUUID();
    this.players.set(playerId, { id: playerId, nickname: null, gameId: null, ws, sessionToken, disconnectedAt: null, graceTimer: null });
    ws._clientIp = clientIp;
    ws._playerId = playerId;
    return { playerId, sessionToken };
  }

  createOrRestorePlayer(ws, clientIp, playerId, sessionToken) {
    const player = this.players.get(playerId);
    if (player && player.sessionToken === sessionToken) {
      return { playerId, sessionToken, restored: true, nickname: player.nickname, gameId: player.gameId };
    }
    const result = this.createPlayer(ws, clientIp);
    return { playerId: result.playerId, sessionToken: result.sessionToken, restored: false, nickname: null, gameId: null };
  }

  findBySessionToken(token) {
    for (const [, player] of this.players) {
      if (player.sessionToken === token) {
        return player;
      }
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
          maxPlayers: game.maxPlayers,
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

  handlePlayerDisconnect(playerId) {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }

    const { gameId, nickname } = player;
    this.players.delete(playerId);
    if (!gameId) {
      return;
    }

    const game = this.games.get(gameId);
    if (!game) {
      return;
    }

    game.players.delete(playerId);
    this._resolveGameAfterExit(gameId, game, playerId, nickname);
  }

  // T034 – broadcast lobby state to every client whose gameId is null
  broadcastLobbyUpdate() {
    const msg = JSON.stringify({ type: 'lobby_update', games: this.getLobbyGames() });
    for (const [, player] of this.players) {
      if (player.gameId === null && player.ws && player.ws.readyState === 1 /* OPEN */) {
        player.ws.send(msg);
      }
    }
  }

  sendToPlayer(playerId, payload) {
    const player = this.players.get(playerId);
    if (player && player.ws && player.ws.readyState === 1) {
      player.ws.send(JSON.stringify(payload));
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
    if (game.inviteCode) {
      this.inviteCodes.delete(game.inviteCode);
    }
    this.games.delete(gameId);
    this.broadcastLobbyUpdate();
  }

  _disbandGame(gameId, game) {
    const disbandMsg = { type: 'game_disbanded', reason: 'host_left' };
    for (const pid of game.players) {
      const p = this.players.get(pid);
      if (p) {
        p.gameId = null;
      }
      this.sendToPlayer(pid, disbandMsg);
    }
    this._deleteGame(gameId, game);
  }
}

module.exports = ThousandStore;
