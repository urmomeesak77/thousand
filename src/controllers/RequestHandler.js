'use strict';

const crypto = require('crypto');
const HttpUtil = require('../utils/HttpUtil');
const StaticServer = require('../utils/StaticServer');

class RequestHandler {
  constructor(store) {
    this.store = store;
  }

  // T039 – nickname validation
  static _validateNickname(nickname) {
    if (!nickname || typeof nickname !== 'string') return false;
    const trimmed = nickname.trim();
    return trimmed.length >= 3 && trimmed.length <= 20;
  }

  // Resolves an existing player or creates a new one; returns playerId
  _resolveOrCreatePlayer(clientPlayerId, nick) {
    const playerId = clientPlayerId && this.store.players.has(clientPlayerId)
      ? clientPlayerId
      : crypto.randomUUID();
    if (!this.store.players.has(playerId)) {
      this.store.players.set(playerId, { id: playerId, nickname: nick, gameId: null, ws: null });
    } else {
      this.store.players.get(playerId).nickname = nick;
    }
    return playerId;
  }

  // Adds player to game, updates player record, and fires WS notifications
  _admitPlayerToGame(game, gameId, playerId) {
    game.players.add(playerId);
    this.store.players.get(playerId).gameId = gameId;
    this.store.broadcastLobbyUpdate();

    // T041 – game_joined to the admitted player
    this.store.sendToPlayer(playerId, {
      type: 'game_joined',
      gameId,
      players: this.store.serializePlayers(game),
    });

    // T042 – player_joined to existing players
    const newPlayer = this.store.players.get(playerId);
    const allPlayers = this.store.serializePlayers(game);
    for (const pid of game.players) {
      if (pid !== playerId) {
        this.store.sendToPlayer(pid, {
          type: 'player_joined',
          player: { id: playerId, nickname: newPlayer.nickname },
          players: allPlayers,
        });
      }
    }
  }

  // T017 – GET /api/games
  handleGetGames(req, res) {
    HttpUtil.sendJSON(res, 200, { games: this.store.getLobbyGames() });
  }

  // T027 – POST /api/games  (create)
  async handleCreateGame(req, res) {
    let body;
    try { body = await HttpUtil.parseBody(req); } catch {
      HttpUtil.sendError(res, 400, 'invalid_request', 'Invalid JSON body');
      return;
    }

    const { type, nickname, playerId: clientPlayerId } = body;

    if (!RequestHandler._validateNickname(nickname)) {
      HttpUtil.sendError(res, 400, 'invalid_request', 'nickname must be 3–20 characters');
      return;
    }
    if (type !== 'public' && type !== 'private') {
      HttpUtil.sendError(res, 400, 'invalid_request', 'type must be "public" or "private"');
      return;
    }

    const nick = nickname.trim();
    const playerId = this._resolveOrCreatePlayer(clientPlayerId, nick);

    const gameId = crypto.randomBytes(3).toString('hex');
    const inviteCode = type === 'private' ? this.store.generateInviteCode() : null;

    const game = {
      id: gameId, type, hostId: playerId,
      players: new Set([playerId]), maxPlayers: 4,
      status: 'waiting', inviteCode,
    };

    this.store.games.set(gameId, game);
    if (inviteCode) this.store.inviteCodes.set(inviteCode, gameId);

    // T035, T041 – broadcast and notify host
    this._admitPlayerToGame(game, gameId, playerId);

    HttpUtil.sendJSON(res, 201, { gameId, inviteCode, playerId });
  }

  // T018 – POST /api/games/:id/join  (join public game)
  async handleJoinGame(req, res, gameId) {
    let body;
    try { body = await HttpUtil.parseBody(req); } catch {
      HttpUtil.sendError(res, 400, 'invalid_request', 'Invalid JSON body');
      return;
    }

    const { nickname, playerId: clientPlayerId } = body;

    if (!RequestHandler._validateNickname(nickname)) {
      HttpUtil.sendError(res, 400, 'invalid_request', 'nickname must be 3–20 characters');
      return;
    }

    const game = this.store.games.get(gameId);

    // T040 – race-condition guard
    if (!game || game.type !== 'public') {
      HttpUtil.sendError(res, 404, 'not_found', 'Game not found');
      return;
    }
    if (game.status !== 'waiting' || game.players.size >= game.maxPlayers) {
      HttpUtil.sendError(res, 409, 'game_full', 'Game is full');
      return;
    }

    const nick = nickname.trim();
    const playerId = this._resolveOrCreatePlayer(clientPlayerId, nick);
    this._admitPlayerToGame(game, gameId, playerId);

    HttpUtil.sendJSON(res, 200, { gameId });
  }

  // T028 – POST /api/games/join-invite
  async handleJoinInvite(req, res) {
    let body;
    try { body = await HttpUtil.parseBody(req); } catch {
      HttpUtil.sendError(res, 400, 'invalid_request', 'Invalid JSON body');
      return;
    }

    const { code, nickname, playerId: clientPlayerId } = body;

    if (!RequestHandler._validateNickname(nickname)) {
      HttpUtil.sendError(res, 400, 'invalid_request', 'nickname must be 3–20 characters');
      return;
    }

    const gameId = this.store.inviteCodes.get(code);
    if (!gameId) {
      HttpUtil.sendError(res, 404, 'not_found', 'Invalid invite code');
      return;
    }

    const game = this.store.games.get(gameId);
    if (!game || game.status !== 'waiting') {
      HttpUtil.sendError(res, 404, 'not_found', 'Invalid invite code');
      return;
    }

    // T040 – race-condition guard
    if (game.players.size >= game.maxPlayers) {
      HttpUtil.sendError(res, 409, 'game_full', 'Game is full');
      return;
    }

    const nick = nickname.trim();
    const playerId = this._resolveOrCreatePlayer(clientPlayerId, nick);
    this._admitPlayerToGame(game, gameId, playerId);

    HttpUtil.sendJSON(res, 200, { gameId });
  }

  async handleRequest(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;

    if (req.method === 'GET' && pathname === '/api/games') return this.handleGetGames(req, res);
    if (req.method === 'POST' && pathname === '/api/games') return this.handleCreateGame(req, res);
    // Must match before /:id/join
    if (req.method === 'POST' && pathname === '/api/games/join-invite') return this.handleJoinInvite(req, res);

    const joinMatch = pathname.match(/^\/api\/games\/([^/]+)\/join$/);
    if (req.method === 'POST' && joinMatch) return this.handleJoinGame(req, res, joinMatch[1]);

    StaticServer.serve(req, res);
  }
}

module.exports = RequestHandler;
