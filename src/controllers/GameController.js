'use strict';

const crypto = require('crypto');
const HttpUtil = require('../utils/HttpUtil');
const RateLimiter = require('../utils/RateLimiter');
const { validateNickname, validateRequiredPlayers } = require('./validators');

class GameController {
  constructor(store) {
    this.store = store;
    this._createLimiter = new RateLimiter(60000, 5); // 5 creates per minute per IP
  }

  cleanupRateLimiter() {
    this._createLimiter.cleanup();
  }

  _isNicknameTaken(nick, excludePlayerId) {
    const lower = nick.toLowerCase();
    for (const [pid, player] of this.store.players) {
      if (pid === excludePlayerId) {continue;}
      if (player.nickname && player.nickname.toLowerCase() === lower) {return true;}
    }
    return false;
  }

  // Shared join preconditions for public join + invite-code join.
  // Returns [status, code, message] on failure, or null when checks pass.
  // Treat the returned tuple → admission path as a critical section: do NOT
  // introduce an `await` between this check and `_admitPlayerToGame`, or two
  // concurrent joiners can both pass the capacity check before either is admitted.
  _validateJoinPreconditions(game, player, nickname) {
    // Identity checks come first so a duplicate request from someone already in
    // the (full) game gets `already_in_game` instead of a misleading `game_full`.
    if (player.gameId !== null) {
      return [409, 'already_in_game', 'Leave your current game first'];
    }
    if (game.players.has(player.id)) {
      return [409, 'already_in_game', 'Already in this game'];
    }
    if (game.status !== 'waiting' || game.players.size >= game.requiredPlayers) {
      return [409, 'game_full', 'Game is full'];
    }
    // Skip the duplicate check for already-named players — body.nickname is
    // informational on join, and the server-side name was vetted at claim time.
    if (!player.nickname && this._isNicknameTaken(nickname.trim(), player.id)) {
      return [409, 'duplicate_nickname', 'That nickname is already taken'];
    }
    return null;
  }

  _admitPlayerToGame(game, gameId, playerId) {
    if (game.status !== 'waiting') {
      this.store.sendToPlayer(playerId, { type: 'game_join_failed', reason: 'Game is already in progress' });
      return;
    }

    game.players.add(playerId);
    this.store.players.get(playerId).gameId = gameId;
    this.store.broadcastLobbyUpdate();

    // T041 – game_joined to the admitted player
    this.store.sendToPlayer(playerId, {
      type: 'game_joined',
      gameId,
      players: this.store.serializePlayers(game),
      createdAt: game.createdAt,
      inviteCode: game.inviteCode ?? null,
      requiredPlayers: game.requiredPlayers,
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

    if (game.players.size === game.requiredPlayers) {
      this.store.startRound(game.id);
    }
  }

  // POST /api/nickname
  async handleClaimNickname(req, res, player) {
    let body;
    try {
      body = await HttpUtil.parseBody(req);
    } catch {
      HttpUtil.sendError(res, 400, 'invalid_request', 'Invalid JSON body');
      return;
    }

    const { nickname } = body;
    if (!validateNickname(nickname)) {
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

  // T027 – POST /api/games
  async handleCreateGame(req, res, player, ip) {
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

    const { type, nickname, requiredPlayers: rawRequired = 3 } = body;

    if (!validateNickname(nickname)) {
      HttpUtil.sendError(res, 400, 'invalid_request', 'nickname must be 3–20 characters and contain no control characters');
      return;
    }
    if (type !== 'public' && type !== 'private') {
      HttpUtil.sendError(res, 400, 'invalid_request', 'type must be "public" or "private"');
      return;
    }
    const requiredPlayersErr = validateRequiredPlayers(rawRequired);
    if (requiredPlayersErr) {
      HttpUtil.sendError(res, 400, 'invalid_request', requiredPlayersErr);
      return;
    }
    const requiredPlayers = Number(rawRequired);

    const nick = nickname.trim();
    const playerId = player.id;

    // Honor a previously-claimed nickname. The body field is required by the API
    // (so old/new clients all send it), but it's informational once the player
    // has a server-side identity — silently renaming on every create was a footgun.
    if (!player.nickname) {
      if (this._isNicknameTaken(nick, playerId)) {
        HttpUtil.sendError(res, 409, 'duplicate_nickname', 'That nickname is already taken');
        return;
      }
      player.nickname = nick;
    }

    const gameId = crypto.randomBytes(3).toString('hex');
    const inviteCode = type === 'private' ? this.store.generateInviteCode() : null;

    const game = {
      id: gameId, type, hostId: playerId,
      players: new Set([playerId]), requiredPlayers,
      status: 'waiting', inviteCode,
      createdAt: Date.now(), round: null,
    };

    this.store.games.set(gameId, game);
    if (inviteCode) {
      this.store.inviteCodes.set(inviteCode, gameId);
    }
    this.store.scheduleWaitingRoomTimeout(gameId);

    // T035, T041 – broadcast and notify host
    this._admitPlayerToGame(game, gameId, playerId);

    HttpUtil.sendJSON(res, 201, { gameId, inviteCode });
  }

  // T018 – POST /api/games/:id/join
  async handleJoinGame(req, res, player, gameId) {
    let body;
    try {
      body = await HttpUtil.parseBody(req);
    } catch {
      HttpUtil.sendError(res, 400, 'invalid_request', 'Invalid JSON body');
      return;
    }

    const { nickname } = body;
    if (!validateNickname(nickname)) {
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

    if (!player.nickname) {
      player.nickname = nickname.trim();
    }
    this._admitPlayerToGame(game, gameId, player.id);

    HttpUtil.sendJSON(res, 200, { gameId });
  }

  // T028 – POST /api/games/join-invite
  async handleJoinInvite(req, res, player) {
    let body;
    try {
      body = await HttpUtil.parseBody(req);
    } catch {
      HttpUtil.sendError(res, 400, 'invalid_request', 'Invalid JSON body');
      return;
    }

    const { code, nickname } = body;

    if (!validateNickname(nickname)) {
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

    if (!player.nickname) {
      player.nickname = nickname.trim();
    }
    this._admitPlayerToGame(game, gameId, player.id);

    HttpUtil.sendJSON(res, 200, { gameId });
  }

  // POST /api/games/:id/leave
  async handleLeaveGame(req, res, player, gameId) {
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
}

module.exports = GameController;
