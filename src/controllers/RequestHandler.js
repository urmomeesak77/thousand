'use strict';

const crypto = require('crypto');
const HttpUtil = require('../utils/HttpUtil');
const StaticServer = require('../utils/StaticServer');
const RateLimiter = require('../utils/RateLimiter');

class RequestHandler {
  constructor(store) {
    this.store = store;
    this._httpLimiter = new RateLimiter(60000, 60); // 60 requests per minute per IP
    this._createLimiter = new RateLimiter(60000, 5); // 5 creates per minute per IP
  }

  cleanupRateLimiters() {
    this._httpLimiter.cleanup();
    this._createLimiter.cleanup();
  }

  // T039 – nickname validation
  static _validateNickname(nickname) {
    if (!nickname || typeof nickname !== 'string') {
      return false;
    }
    const trimmed = nickname.trim();
    if (trimmed.length < 3 || trimmed.length > 20) {
      return false;
    }
    // Reject control characters, zero-width chars, bidirectional overrides
    // eslint-disable-next-line no-control-regex
    const BAD_CHARS = /[\u0000-\u001F\u007F\u200B-\u200D\uFEFF\u202A-\u202E\u2028\u2029]/;
    return !BAD_CHARS.test(trimmed);
  }

  // Authenticate via Authorization header
  _authenticateRequest(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return null;
    }
    return this.store.findBySessionToken(auth.slice(7));
  }

  // Returns true if another connected player already holds this nickname
  _isNicknameTaken(nick, excludePlayerId) {
    const lower = nick.toLowerCase();
    for (const [pid, player] of this.store.players) {
      if (pid === excludePlayerId) {
        continue;
      }
      if (player.nickname && player.nickname.toLowerCase() === lower) {
        return true;
      }
    }
    return false;
  }

  // Shared join preconditions for public join + invite-code join.
  // Caller must have located the game and validated nickname format already
  // (so 400/404 responses keep their original ordering).
  // Returns [status, code, message] on failure, or null when checks pass.
  // Treat the returned tuple → admission path as a critical section: do NOT
  // introduce an `await` between this check and `_admitPlayerToGame`, or two
  // concurrent joiners can both pass the capacity check before either is admitted.
  _validateJoinPreconditions(game, player, nickname) {
    if (game.status !== 'waiting' || game.players.size >= game.maxPlayers) {
      return [409, 'game_full', 'Game is full'];
    }
    if (player.gameId !== null) {
      return [409, 'already_in_game', 'Leave your current game first'];
    }
    if (game.players.has(player.id)) {
      return [409, 'already_in_game', 'Already in this game'];
    }
    if (this._isNicknameTaken(nickname.trim(), player.id)) {
      return [409, 'duplicate_nickname', 'That nickname is already taken'];
    }
    return null;
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
      createdAt: game.createdAt,
    });

    // T042 – player_joined to existing players
    const newPlayer = this.store.players.get(playerId);
    const allPlayers = this.store.serializePlayers(game);
    for (const pid of game.players) {
      if (pid !== playerId) {
        this.store.sendToPlayer(pid, {
          type: 'player_joined',
          player: { nickname: newPlayer.nickname },
          players: allPlayers,
        });
      }
    }
  }

  // POST /api/nickname — claim a unique nickname before entering the lobby
  async handleClaimNickname(req, res) {
    const player = this._authenticateRequest(req);
    if (!player) {
      HttpUtil.sendError(res, 401, 'unauthorized', 'Session required');
      return;
    }

    let body;
    try {
      body = await HttpUtil.parseBody(req);
    } catch {
      HttpUtil.sendError(res, 400, 'invalid_request', 'Invalid JSON body');
      return;
    }

    const { nickname } = body;

    if (!RequestHandler._validateNickname(nickname)) {
      HttpUtil.sendError(res, 400, 'invalid_request', 'Nickname must be 3–20 characters and contain no control characters');
      return;
    }

    const nick = nickname.trim();

    if (this._isNicknameTaken(nick, player.id)) {
      HttpUtil.sendError(res, 409, 'duplicate_nickname', 'That nickname is already taken');
      return;
    }

    player.nickname = nick;
    HttpUtil.sendJSON(res, 200, { nickname: nick });
  }

  // T017 – GET /api/games
  handleGetGames(req, res) {
    HttpUtil.sendJSON(res, 200, { games: this.store.getLobbyGames() });
  }

  // T027 – POST /api/games  (create)
  async handleCreateGame(req, res) {
    const player = this._authenticateRequest(req);
    if (!player) {
      HttpUtil.sendError(res, 401, 'unauthorized', 'Session required');
      return;
    }

    const ip = req.socket.remoteAddress;
    if (!this._createLimiter.isAllowed(ip)) {
      HttpUtil.sendError(res, 429, 'rate_limited', 'Too many game creations');
      return;
    }

    let body;
    try {
      body = await HttpUtil.parseBody(req);
    } catch {
      HttpUtil.sendError(res, 400, 'invalid_request', 'Invalid JSON body');
      return;
    }

    const { type, nickname } = body;

    if (!RequestHandler._validateNickname(nickname)) {
      HttpUtil.sendError(res, 400, 'invalid_request', 'nickname must be 3–20 characters and contain no control characters');
      return;
    }
    if (type !== 'public' && type !== 'private') {
      HttpUtil.sendError(res, 400, 'invalid_request', 'type must be "public" or "private"');
      return;
    }

    const nick = nickname.trim();
    const playerId = player.id;

    if (this._isNicknameTaken(nick, playerId)) {
      HttpUtil.sendError(res, 409, 'duplicate_nickname', 'That nickname is already taken');
      return;
    }

    player.nickname = nick;

    const gameId = crypto.randomBytes(3).toString('hex');
    const inviteCode = type === 'private' ? this.store.generateInviteCode() : null;

    const game = {
      id: gameId, type, hostId: playerId,
      players: new Set([playerId]), maxPlayers: 4,
      status: 'waiting', inviteCode,
      createdAt: Date.now(),
    };

    this.store.games.set(gameId, game);
    if (inviteCode) {
      this.store.inviteCodes.set(inviteCode, gameId);
    }

    // T035, T041 – broadcast and notify host
    this._admitPlayerToGame(game, gameId, playerId);

    HttpUtil.sendJSON(res, 201, { gameId, inviteCode });
  }

  // T018 – POST /api/games/:id/join  (join public game)
  async handleJoinGame(req, res, gameId) {
    const player = this._authenticateRequest(req);
    if (!player) {
      HttpUtil.sendError(res, 401, 'unauthorized', 'Session required');
      return;
    }

    let body;
    try {
      body = await HttpUtil.parseBody(req);
    } catch {
      HttpUtil.sendError(res, 400, 'invalid_request', 'Invalid JSON body');
      return;
    }

    const { nickname } = body;

    if (!RequestHandler._validateNickname(nickname)) {
      HttpUtil.sendError(res, 400, 'invalid_request', 'nickname must be 3–20 characters and contain no control characters');
      return;
    }

    const game = this.store.games.get(gameId);

    if (!game || game.type !== 'public') {
      HttpUtil.sendError(res, 404, 'not_found', 'Game not found');
      return;
    }

    // T040 – race-condition guard. Critical section starts here — see
    // _validateJoinPreconditions for why no `await` may slip in below.
    const failure = this._validateJoinPreconditions(game, player, nickname);
    if (failure) {
      HttpUtil.sendError(res, ...failure);
      return;
    }

    player.nickname = nickname.trim();
    this._admitPlayerToGame(game, gameId, player.id);

    HttpUtil.sendJSON(res, 200, { gameId });
  }

  // T028 – POST /api/games/join-invite
  async handleJoinInvite(req, res) {
    const player = this._authenticateRequest(req);
    if (!player) {
      HttpUtil.sendError(res, 401, 'unauthorized', 'Session required');
      return;
    }

    let body;
    try {
      body = await HttpUtil.parseBody(req);
    } catch {
      HttpUtil.sendError(res, 400, 'invalid_request', 'Invalid JSON body');
      return;
    }

    const { code, nickname } = body;

    if (!RequestHandler._validateNickname(nickname)) {
      HttpUtil.sendError(res, 400, 'invalid_request', 'nickname must be 3–20 characters and contain no control characters');
      return;
    }

    if (!/^[A-F0-9]{6}$/.test(code)) {
      HttpUtil.sendError(res, 404, 'not_found', 'Invalid invite code');
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

    // T040 – race-condition guard. Critical section starts here — see
    // _validateJoinPreconditions for why no `await` may slip in below.
    const failure = this._validateJoinPreconditions(game, player, nickname);
    if (failure) {
      HttpUtil.sendError(res, ...failure);
      return;
    }

    player.nickname = nickname.trim();
    this._admitPlayerToGame(game, gameId, player.id);

    HttpUtil.sendJSON(res, 200, { gameId });
  }

  // POST /api/games/:id/leave
  async handleLeaveGame(req, res, gameId) {
    const player = this._authenticateRequest(req);
    if (!player) {
      HttpUtil.sendError(res, 401, 'unauthorized', 'Session required');
      return;
    }

    try {
      await HttpUtil.parseBody(req);
    } catch {
      HttpUtil.sendError(res, 400, 'invalid_request', 'Invalid JSON body');
      return;
    }

    const ok = this.store.leaveGame(player.id, gameId);
    if (!ok) {
      HttpUtil.sendError(res, 404, 'not_found', 'Game or player not found');
      return;
    }
    HttpUtil.sendJSON(res, 200, {});
  }

  async handleRequest(req, res) {
    const ip = req.socket.remoteAddress;
    if (!this._httpLimiter.isAllowed(ip)) {
      HttpUtil.sendError(res, 429, 'rate_limited', 'Too many requests');
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;

    if (req.method === 'POST' && pathname === '/api/nickname') {
      return this.handleClaimNickname(req, res);
    }
    if (req.method === 'GET' && pathname === '/api/games') {
      return this.handleGetGames(req, res);
    }
    if (req.method === 'POST' && pathname === '/api/games') {
      return this.handleCreateGame(req, res);
    }
    // Must match before /:id/join
    if (req.method === 'POST' && pathname === '/api/games/join-invite') {
      return this.handleJoinInvite(req, res);
    }

    const leaveMatch = pathname.match(/^\/api\/games\/([0-9a-f]{6})\/leave$/);
    if (req.method === 'POST' && leaveMatch) {
      return this.handleLeaveGame(req, res, leaveMatch[1]);
    }

    const joinMatch = pathname.match(/^\/api\/games\/([0-9a-f]{6})\/join$/);
    if (req.method === 'POST' && joinMatch) {
      return this.handleJoinGame(req, res, joinMatch[1]);
    }

    StaticServer.serve(req, res);
  }
}

module.exports = RequestHandler;
