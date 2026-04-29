'use strict';

const HttpUtil = require('../utils/HttpUtil');
const StaticServer = require('../utils/StaticServer');
const RateLimiter = require('../utils/RateLimiter');
const GameController = require('./GameController');

class RequestHandler {
  constructor(store) {
    this.store = store;
    this._httpLimiter = new RateLimiter(60000, 60); // 60 requests per minute per IP
    this._games = new GameController(store);
  }

  cleanupRateLimiters() {
    this._httpLimiter.cleanup();
    this._games.cleanupRateLimiter();
  }

  _authenticateRequest(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    return this.store.findBySessionToken(auth.slice(7));
  }

  // Returns authenticated player or sends 401 and returns null.
  _requireAuth(req, res) {
    const player = this._authenticateRequest(req);
    if (!player) HttpUtil.sendError(res, 401, 'unauthorized', 'Session required');
    return player;
  }

  async handleRequest(req, res) {
    const ip = HttpUtil.normalizeIp(req.socket.remoteAddress);
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;

    if (pathname.startsWith('/api/')) {
      if (!this._httpLimiter.isAllowed(ip)) {
        HttpUtil.sendError(res, 429, 'rate_limited', 'Too many requests');
        return;
      }
    }

    if (req.method === 'POST' && pathname === '/api/nickname') {
      const player = this._requireAuth(req, res);
      if (!player) return;
      return this._games.handleClaimNickname(req, res, player);
    }
    if (req.method === 'GET' && pathname === '/api/games') {
      return this._games.handleGetGames(req, res);
    }
    if (req.method === 'POST' && pathname === '/api/games') {
      const player = this._requireAuth(req, res);
      if (!player) return;
      return this._games.handleCreateGame(req, res, player, ip);
    }
    // Must match before /:id/join
    if (req.method === 'POST' && pathname === '/api/games/join-invite') {
      const player = this._requireAuth(req, res);
      if (!player) return;
      return this._games.handleJoinInvite(req, res, player);
    }

    const leaveMatch = pathname.match(/^\/api\/games\/([0-9a-f]{6})\/leave$/);
    if (req.method === 'POST' && leaveMatch) {
      const player = this._requireAuth(req, res);
      if (!player) return;
      return this._games.handleLeaveGame(req, res, player, leaveMatch[1]);
    }

    const joinMatch = pathname.match(/^\/api\/games\/([0-9a-f]{6})\/join$/);
    if (req.method === 'POST' && joinMatch) {
      const player = this._requireAuth(req, res);
      if (!player) return;
      return this._games.handleJoinGame(req, res, player, joinMatch[1]);
    }

    StaticServer.serve(req, res);
  }
}

module.exports = RequestHandler;
