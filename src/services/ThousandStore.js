'use strict';

const crypto = require('crypto');

class ThousandStore {
  constructor() {
    this.games = new Map();       // gameId -> Game
    this.players = new Map();     // playerId -> Player
    this.inviteCodes = new Map(); // inviteCode -> gameId
  }

  // T026 – invite code generator
  generateInviteCode() {
    let code;
    do {
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
      return p ? { id: pid, nickname: p.nickname } : null;
    }).filter(Boolean);
  }

  // T011 – WebSocket connection handler
  handleConnection(ws) {
    const playerId = crypto.randomUUID();
    this.players.set(playerId, { id: playerId, nickname: null, gameId: null, ws });
    ws.send(JSON.stringify({ type: 'connected', playerId }));
    ws.send(JSON.stringify({ type: 'lobby_update', games: this.getLobbyGames() }));
    ws.on('message', (data) => this._handleMessage(ws, data));
    ws.on('close', () => this._handleDisconnect(playerId));
  }

  _handleMessage(ws, data) {
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

  // Shared exit logic: called after a player has been removed from game.players
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

  _handleDisconnect(playerId) {
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
}

module.exports = ThousandStore;
