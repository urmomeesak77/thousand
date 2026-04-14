'use strict';

const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// In-memory state  (T010)
// ---------------------------------------------------------------------------

const games = new Map();       // gameId -> Game
const players = new Map();     // playerId -> Player
const inviteCodes = new Map(); // inviteCode -> gameId

// ---------------------------------------------------------------------------
// Response helpers  (T013)
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

// ---------------------------------------------------------------------------
// Body parser  (T012)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Domain helpers
// ---------------------------------------------------------------------------

// T039 – nickname validation
function validateNickname(nickname) {
  if (!nickname || typeof nickname !== 'string') return false;
  const trimmed = nickname.trim();
  return trimmed.length >= 3 && trimmed.length <= 20;
}

// T026 – invite code generator
function generateInviteCode() {
  let code;
  do {
    code = crypto.randomBytes(3).toString('hex').toUpperCase();
  } while (inviteCodes.has(code));
  return code;
}

// Returns the serialisable list of public waiting games
function getLobbyGames() {
  const result = [];
  for (const [id, game] of games) {
    if (game.type === 'public' && game.status === 'waiting') {
      result.push({ id, playerCount: game.players.size, maxPlayers: game.maxPlayers });
    }
  }
  return result;
}

// T034 – broadcast lobby state to every client whose gameId is null
function broadcastLobbyUpdate() {
  const msg = JSON.stringify({ type: 'lobby_update', games: getLobbyGames() });
  for (const [, player] of players) {
    if (player.gameId === null && player.ws && player.ws.readyState === 1 /* OPEN */) {
      player.ws.send(msg);
    }
  }
}

// Send a message to the WS connection of a specific player (if connected)
function sendToPlayer(playerId, payload) {
  const player = players.get(playerId);
  if (player && player.ws && player.ws.readyState === 1) {
    player.ws.send(JSON.stringify(payload));
  }
}

// Serialize a game's player list for WS messages
function serializePlayers(game) {
  return [...game.players].map((pid) => {
    const p = players.get(pid);
    return p ? { id: pid, nickname: p.nickname } : null;
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Static file server  (T009)
// ---------------------------------------------------------------------------

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
// HTTP route handlers
// ---------------------------------------------------------------------------

// T017 – GET /api/games
function handleGetGames(req, res) {
  sendJSON(res, 200, { games: getLobbyGames() });
}

// T027 – POST /api/games  (create)
async function handleCreateGame(req, res) {
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

  // Resolve or create the player record
  const nick = nickname.trim();
  let playerId = clientPlayerId && players.has(clientPlayerId) ? clientPlayerId : crypto.randomUUID();
  if (!players.has(playerId)) {
    players.set(playerId, { id: playerId, nickname: nick, gameId: null, ws: null });
  } else {
    players.get(playerId).nickname = nick;
  }

  const gameId = crypto.randomBytes(3).toString('hex');
  const inviteCode = type === 'private' ? generateInviteCode() : null;

  const game = {
    id: gameId,
    type,
    hostId: playerId,
    players: new Set([playerId]),
    maxPlayers: 4,
    status: 'waiting',
    inviteCode,
  };

  games.set(gameId, game);
  if (inviteCode) inviteCodes.set(inviteCode, gameId);

  players.get(playerId).gameId = gameId;

  // T035 – broadcast after game created
  broadcastLobbyUpdate();

  // T041 – send game_joined to the creating player via WS (if connected)
  sendToPlayer(playerId, {
    type: 'game_joined',
    gameId,
    players: serializePlayers(game),
  });

  sendJSON(res, 201, { gameId, inviteCode, playerId });
}

// T018 – POST /api/games/:id/join  (join public game)
async function handleJoinGame(req, res, gameId) {
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

  const game = games.get(gameId);

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
  let playerId = clientPlayerId && players.has(clientPlayerId) ? clientPlayerId : crypto.randomUUID();
  if (!players.has(playerId)) {
    players.set(playerId, { id: playerId, nickname: nick, gameId: null, ws: null });
  } else {
    players.get(playerId).nickname = nick;
  }

  game.players.add(playerId);
  players.get(playerId).gameId = gameId;

  // T035 – broadcast after player joins
  broadcastLobbyUpdate();

  // T041 – game_joined to joining player
  sendToPlayer(playerId, {
    type: 'game_joined',
    gameId,
    players: serializePlayers(game),
  });

  // T042 – player_joined to existing players
  const newPlayer = players.get(playerId);
  const allPlayers = serializePlayers(game);
  for (const pid of game.players) {
    if (pid !== playerId) {
      sendToPlayer(pid, {
        type: 'player_joined',
        player: { id: playerId, nickname: newPlayer.nickname },
        players: allPlayers,
      });
    }
  }

  sendJSON(res, 200, { gameId });
}

// T028 – POST /api/games/join-invite
async function handleJoinInvite(req, res) {
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

  const gameId = inviteCodes.get(code);
  if (!gameId) {
    sendError(res, 404, 'not_found', 'Invalid invite code');
    return;
  }

  const game = games.get(gameId);
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
  let playerId = clientPlayerId && players.has(clientPlayerId) ? clientPlayerId : crypto.randomUUID();
  if (!players.has(playerId)) {
    players.set(playerId, { id: playerId, nickname: nick, gameId: null, ws: null });
  } else {
    players.get(playerId).nickname = nick;
  }

  game.players.add(playerId);
  players.get(playerId).gameId = gameId;

  // T035 – broadcast after invite join (private game won't appear in list, but cleans up if needed)
  broadcastLobbyUpdate();

  // T041 – game_joined to joining player
  sendToPlayer(playerId, {
    type: 'game_joined',
    gameId,
    players: serializePlayers(game),
  });

  // T042 – player_joined to existing players
  const newPlayer = players.get(playerId);
  const allPlayers = serializePlayers(game);
  for (const pid of game.players) {
    if (pid !== playerId) {
      sendToPlayer(pid, {
        type: 'player_joined',
        player: { id: playerId, nickname: newPlayer.nickname },
        players: allPlayers,
      });
    }
  }

  sendJSON(res, 200, { gameId });
}

// ---------------------------------------------------------------------------
// Main HTTP request handler
// ---------------------------------------------------------------------------

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;

  if (req.method === 'GET' && pathname === '/api/games') {
    return handleGetGames(req, res);
  }

  if (req.method === 'POST' && pathname === '/api/games') {
    return handleCreateGame(req, res);
  }

  // Must match before /:id/join
  if (req.method === 'POST' && pathname === '/api/games/join-invite') {
    return handleJoinInvite(req, res);
  }

  const joinMatch = pathname.match(/^\/api\/games\/([^/]+)\/join$/);
  if (req.method === 'POST' && joinMatch) {
    return handleJoinGame(req, res, joinMatch[1]);
  }

  serveStatic(req, res);
}

// ---------------------------------------------------------------------------
// HTTP server  (T009)
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('Unhandled error:', err);
    if (!res.headersSent) sendError(res, 500, 'internal_error', 'Internal server error');
  });
});

// ---------------------------------------------------------------------------
// WebSocket server  (T011)
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  const playerId = crypto.randomUUID();

  players.set(playerId, { id: playerId, nickname: null, gameId: null, ws });

  // T037 – send initial lobby update on connect
  ws.send(JSON.stringify({ type: 'connected', playerId }));
  ws.send(JSON.stringify({ type: 'lobby_update', games: getLobbyGames() }));

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
    const player = players.get(playerId);
    if (!player) return;

    const { gameId } = player;
    players.delete(playerId);

    if (!gameId) return; // was in lobby — nothing else to clean up

    const game = games.get(gameId);
    if (!game) return;

    game.players.delete(playerId);

    const isHost = game.hostId === playerId;
    const noPlayersLeft = game.players.size === 0;

    if (isHost && game.status === 'waiting' && noPlayersLeft) {
      // T036 – host leaves empty waiting game → delete
      if (game.inviteCode) inviteCodes.delete(game.inviteCode);
      games.delete(gameId);
      broadcastLobbyUpdate();
    } else if (game.players.size > 0) {
      // Notify remaining players
      const remaining = serializePlayers(game);
      const msg = JSON.stringify({ type: 'player_left', playerId, players: remaining });
      for (const pid of game.players) {
        sendToPlayer(pid, JSON.parse(msg));
      }
      broadcastLobbyUpdate();
    }
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = { server, games, players, inviteCodes, broadcastLobbyUpdate, getLobbyGames };
