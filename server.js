'use strict';

const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Pure utilities  (no shared state — remain as standalone functions)
// ---------------------------------------------------------------------------

function sendJSON(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function sendError(res, status, code, message) {
  sendJSON(res, status, { error: code, message });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// T039 – nickname validation
function validateNickname(nickname) {
  if (!nickname || typeof nickname !== 'string') return false;
  const trimmed = nickname.trim();
  return trimmed.length >= 3 && trimmed.length <= 20;
}

// T009 – static file server
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

function serveStatic(req, res) {
  const filePath = req.url === '/'
    ? path.join(__dirname, 'public', 'lobby.html')
    : path.join(__dirname, 'public', req.url.split('?')[0]);

  // Prevent path traversal
  const publicDir = path.join(__dirname, 'public');
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(404); res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// LobbyStore  (T010) — owns all mutable state and domain logic
// ---------------------------------------------------------------------------

class LobbyStore {
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
        result.push({ id, playerCount: game.players.size, maxPlayers: game.maxPlayers });
      }
    }
    return result;
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

    // T037 – send initial lobby update on connect
    ws.send(JSON.stringify({ type: 'connected', playerId }));
    ws.send(JSON.stringify({ type: 'lobby_update', games: this.getLobbyGames() }));

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', code: 'invalid_message', message: 'Invalid JSON' }));
        return;
      }

      if (msg.type === 'ping') return; // keepalive — no response needed

      ws.send(JSON.stringify({ type: 'error', code: 'invalid_message', message: 'Unrecognized message type' }));
    });

    // T036 – disconnect cleanup
    ws.on('close', () => {
      const player = this.players.get(playerId);
      if (!player) return;

      const { gameId } = player;
      this.players.delete(playerId);

      if (!gameId) return; // was in lobby — nothing else to clean up

      const game = this.games.get(gameId);
      if (!game) return;

      game.players.delete(playerId);

      const isHost = game.hostId === playerId;
      const noPlayersLeft = game.players.size === 0;

      if (isHost && game.status === 'waiting' && noPlayersLeft) {
        // T036 – host leaves empty waiting game → delete
        if (game.inviteCode) this.inviteCodes.delete(game.inviteCode);
        this.games.delete(gameId);
        this.broadcastLobbyUpdate();
      } else if (game.players.size > 0) {
        // Notify remaining players
        const remaining = this.serializePlayers(game);
        const leftMsg = JSON.stringify({ type: 'player_left', playerId, players: remaining });
        for (const pid of game.players) {
          this.sendToPlayer(pid, JSON.parse(leftMsg));
        }
        this.broadcastLobbyUpdate();
      }
    });
  }
}

// ---------------------------------------------------------------------------
// RequestHandler — owns HTTP routing and request/response logic
// ---------------------------------------------------------------------------

class RequestHandler {
  constructor(store) {
    this.store = store;
  }

  // T017 – GET /api/games
  handleGetGames(req, res) {
    sendJSON(res, 200, { games: this.store.getLobbyGames() });
  }

  // T027 – POST /api/games  (create)
  async handleCreateGame(req, res) {
    let body;
    try { body = await parseBody(req); } catch {
      sendError(res, 400, 'invalid_request', 'Invalid JSON body');
      return;
    }

    const { type, nickname, playerId: clientPlayerId } = body;

    if (!validateNickname(nickname)) {
      sendError(res, 400, 'invalid_request', 'nickname must be 3–20 characters');
      return;
    }
    if (type !== 'public' && type !== 'private') {
      sendError(res, 400, 'invalid_request', 'type must be "public" or "private"');
      return;
    }

    const nick = nickname.trim();
    let playerId = clientPlayerId && this.store.players.has(clientPlayerId) ? clientPlayerId : crypto.randomUUID();
    if (!this.store.players.has(playerId)) {
      this.store.players.set(playerId, { id: playerId, nickname: nick, gameId: null, ws: null });
    } else {
      this.store.players.get(playerId).nickname = nick;
    }

    const gameId = crypto.randomBytes(3).toString('hex');
    const inviteCode = type === 'private' ? this.store.generateInviteCode() : null;

    const game = {
      id: gameId,
      type,
      hostId: playerId,
      players: new Set([playerId]),
      maxPlayers: 4,
      status: 'waiting',
      inviteCode,
    };

    this.store.games.set(gameId, game);
    if (inviteCode) this.store.inviteCodes.set(inviteCode, gameId);

    this.store.players.get(playerId).gameId = gameId;

    // T035 – broadcast after game created
    this.store.broadcastLobbyUpdate();

    // T041 – send game_joined to the creating player via WS (if connected)
    this.store.sendToPlayer(playerId, {
      type: 'game_joined',
      gameId,
      players: this.store.serializePlayers(game),
    });

    sendJSON(res, 201, { gameId, inviteCode, playerId });
  }

  // T018 – POST /api/games/:id/join  (join public game)
  async handleJoinGame(req, res, gameId) {
    let body;
    try { body = await parseBody(req); } catch {
      sendError(res, 400, 'invalid_request', 'Invalid JSON body');
      return;
    }

    const { nickname, playerId: clientPlayerId } = body;

    if (!validateNickname(nickname)) {
      sendError(res, 400, 'invalid_request', 'nickname must be 3–20 characters');
      return;
    }

    const game = this.store.games.get(gameId);

    // T040 – race-condition guard: re-check inside handler
    if (!game || game.type !== 'public') {
      sendError(res, 404, 'not_found', 'Game not found');
      return;
    }
    if (game.status !== 'waiting' || game.players.size >= game.maxPlayers) {
      sendError(res, 409, 'game_full', 'Game is full');
      return;
    }

    const nick = nickname.trim();
    let playerId = clientPlayerId && this.store.players.has(clientPlayerId) ? clientPlayerId : crypto.randomUUID();
    if (!this.store.players.has(playerId)) {
      this.store.players.set(playerId, { id: playerId, nickname: nick, gameId: null, ws: null });
    } else {
      this.store.players.get(playerId).nickname = nick;
    }

    game.players.add(playerId);
    this.store.players.get(playerId).gameId = gameId;

    // T035 – broadcast after player joins
    this.store.broadcastLobbyUpdate();

    // T041 – game_joined to joining player
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

    sendJSON(res, 200, { gameId });
  }

  // T028 – POST /api/games/join-invite
  async handleJoinInvite(req, res) {
    let body;
    try { body = await parseBody(req); } catch {
      sendError(res, 400, 'invalid_request', 'Invalid JSON body');
      return;
    }

    const { code, nickname, playerId: clientPlayerId } = body;

    if (!validateNickname(nickname)) {
      sendError(res, 400, 'invalid_request', 'nickname must be 3–20 characters');
      return;
    }

    const gameId = this.store.inviteCodes.get(code);
    if (!gameId) {
      sendError(res, 404, 'not_found', 'Invalid invite code');
      return;
    }

    const game = this.store.games.get(gameId);
    if (!game || game.status !== 'waiting') {
      sendError(res, 404, 'not_found', 'Invalid invite code');
      return;
    }

    // T040 – race-condition guard
    if (game.players.size >= game.maxPlayers) {
      sendError(res, 409, 'game_full', 'Game is full');
      return;
    }

    const nick = nickname.trim();
    let playerId = clientPlayerId && this.store.players.has(clientPlayerId) ? clientPlayerId : crypto.randomUUID();
    if (!this.store.players.has(playerId)) {
      this.store.players.set(playerId, { id: playerId, nickname: nick, gameId: null, ws: null });
    } else {
      this.store.players.get(playerId).nickname = nick;
    }

    game.players.add(playerId);
    this.store.players.get(playerId).gameId = gameId;

    // T035 – broadcast after invite join
    this.store.broadcastLobbyUpdate();

    // T041 – game_joined to joining player
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

    sendJSON(res, 200, { gameId });
  }

  async handleRequest(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;

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

    const joinMatch = pathname.match(/^\/api\/games\/([^/]+)\/join$/);
    if (req.method === 'POST' && joinMatch) {
      return this.handleJoinGame(req, res, joinMatch[1]);
    }

    serveStatic(req, res);
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

const store = new LobbyStore();
const handler = new RequestHandler(store);

// T009 – HTTP server
const server = http.createServer((req, res) => {
  handler.handleRequest(req, res).catch((err) => {
    console.error('Unhandled error:', err);
    if (!res.headersSent) sendError(res, 500, 'internal_error', 'Internal server error');
  });
});

// T011 – WebSocket server
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => store.handleConnection(ws));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = { server, store };
