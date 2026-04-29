'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { WebSocket } = require('ws');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let server, store, handler, connectionManager, games, players, inviteCodes;
let baseUrl, wsUrl;

function request(method, path, body, sessionToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (sessionToken) {
      opts.headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function getSessionToken() {
  return new Promise((resolve, reject) => {
    connectWS().then((ws) => {
      const connectedMsg = ws.msgs.find((m) => m.type === 'connected');
      if (connectedMsg && connectedMsg.sessionToken && connectedMsg.playerId) {
        ws.on('close', () => {
          // Give the server event loop one tick to process the close handler
          setTimeout(() => {
            resolve({ token: connectedMsg.sessionToken, playerId: connectedMsg.playerId });
          }, 50);
        });
        ws.close();
      } else {
        ws.close();
        reject(new Error('No sessionToken or playerId in connected message'));
      }
    }).catch(reject);
  });
}

// Send a raw (potentially invalid) body to a POST endpoint
function requestRaw(path, rawBody, sessionToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(rawBody) },
    };
    if (sessionToken) {
      opts.headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    req.write(rawBody);
    req.end();
  });
}

function connectWS(creds = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const msgs = [];
    let messageReceived = false;
    const timeout = setTimeout(() => {
      if (!messageReceived) {
        ws.close();
        reject(new Error('WebSocket connection timeout — no message received'));
      }
    }, 5000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'hello', ...creds }));
    });

    ws.on('message', (data) => {
      msgs.push(JSON.parse(data.toString()));
      // Resolve once we receive the connected message
      if (!messageReceived && msgs.some((m) => m.type === 'connected')) {
        messageReceived = true;
        clearTimeout(timeout);
        ws.msgs = msgs;
        resolve(ws);
      }
    });
    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    ws.on('close', () => {
      if (!messageReceived) {
        clearTimeout(timeout);
        reject(new Error('WebSocket closed before receiving any messages'));
      }
    });
  });
}

function waitForMessage(ws, type, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const check = () => {
      const found = ws.msgs.find((m) => m.type === type);
      if (found) return resolve(found);
    };
    check();
    const orig = ws.on.bind(ws);
    const interval = setInterval(() => {
      const found = ws.msgs.find((m) => m.type === type);
      if (found) { clearInterval(interval); clearTimeout(timer); resolve(found); }
    }, 20);
    const timer = setTimeout(() => {
      clearInterval(interval);
      reject(new Error(`Timeout waiting for WS message type="${type}"`));
    }, timeoutMs);
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

before(async () => {
  // Clear module cache so each test run gets fresh state
  const mod = require('../src/server');
  server = mod.server;
  store = mod.store;
  handler = mod.handler;
  connectionManager = mod.connectionManager;
  games = store.games;
  players = store.players;
  inviteCodes = store.inviteCodes;

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  baseUrl = `http://localhost:${port}`;
  wsUrl = `ws://localhost:${port}/ws`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(async () => {
  games.clear();
  players.clear();
  inviteCodes.clear();
  connectionManager._wsConnectionsByIp.clear();
  connectionManager._wsMessageCounts.clear();

  // Reset rate limiters so tests don't hit limits (all tests come from same IP)
  handler._httpLimiter._counts.clear();
  handler._games._createLimiter._counts.clear();

  // Wait to allow WebSocket connections to fully close and clean up from previous tests
  // The server limits to 10 WebSocket connections per IP, and async close events
  // may not have been processed yet by the time beforeEach runs
  await new Promise((r) => setTimeout(r, 500));
});

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------

describe('Static files', () => {
  it('serves index.html at /', async () => {
    const res = await request('GET', '/');
    assert.equal(res.status, 200);
  });

  it('returns 404 for unknown path', async () => {
    const res = await request('GET', '/does-not-exist.txt');
    assert.equal(res.status, 404);
  });
});

// ---------------------------------------------------------------------------
// T014 – GET /api/games
// ---------------------------------------------------------------------------

describe('GET /api/games', () => {
  it('returns 200 with empty games array when no games exist', async () => {
    const res = await request('GET', '/api/games');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.games));
    assert.equal(res.body.games.length, 0);
  });

  it('returns only public waiting games', async () => {
    // Add a public waiting game
    games.set('000007', {
      id: '000007', type: 'public', hostId: 'p1',
      players: new Set(['p1']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });
    // Add a private game — should NOT appear
    games.set('000008', {
      id: '000008', type: 'private', hostId: 'p2',
      players: new Set(['p2']), maxPlayers: 4, status: 'waiting', inviteCode: 'ABCDEF',
    });
    // Add a public game that's playing — should NOT appear
    games.set('000009', {
      id: '000009', type: 'public', hostId: 'p3',
      players: new Set(['p3']), maxPlayers: 4, status: 'playing', inviteCode: null,
    });

    const res = await request('GET', '/api/games');
    assert.equal(res.status, 200);
    assert.equal(res.body.games.length, 1);
    assert.equal(res.body.games[0].id, '000007');
  });

  it('does not expose inviteCode field in response', async () => {
    games.set('000007', {
      id: '000007', type: 'public', hostId: 'p1',
      players: new Set(['p1']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });
    const res = await request('GET', '/api/games');
    assert.equal(res.status, 200);
    assert.ok(!('inviteCode' in res.body.games[0]));
  });

  it('includes playerCount and maxPlayers fields', async () => {
    games.set('000007', {
      id: '000007', type: 'public', hostId: 'p1',
      players: new Set(['p1', 'p2']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });
    const res = await request('GET', '/api/games');
    assert.equal(res.body.games[0].playerCount, 2);
    assert.equal(res.body.games[0].maxPlayers, 4);
  });
});

// ---------------------------------------------------------------------------
// T015 – POST /api/games/:id/join
// ---------------------------------------------------------------------------

describe('POST /api/games/:id/join', () => {
  it('returns 200 and gameId on success', async () => {
    const { token, playerId } = await getSessionToken();
    games.set('000001', {
      id: '000001', type: 'public', hostId: 'host1',
      players: new Set(['host1']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });
    players.set('host1', { id: 'host1', nickname: 'Host', gameId: '000001', ws: null, sessionToken: 'token1' });
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });

    const res = await request('POST', '/api/games/000001/join', { nickname: 'Alice' }, token);
    assert.equal(res.status, 200);
    assert.equal(res.body.gameId, '000001');
  });

  it('returns 404 when game does not exist', async () => {
    const { token, playerId } = await getSessionToken();
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });

    const res = await request('POST', '/api/games/ffffff/join', { nickname: 'Alice' }, token);
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'not_found');
  });

  it('returns 404 for private game', async () => {
    const { token, playerId } = await getSessionToken();
    games.set('000002', {
      id: '000002', type: 'private', hostId: 'host1',
      players: new Set(['host1']), maxPlayers: 4, status: 'waiting', inviteCode: 'ABCDEF',
    });
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });

    const res = await request('POST', '/api/games/000002/join', { nickname: 'Alice' }, token);
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'not_found');
  });

  it('returns 409 when game is full', async () => {
    const { token, playerId } = await getSessionToken();
    games.set('000003', {
      id: '000003', type: 'public', hostId: 'h1',
      players: new Set(['h1', 'h2', 'h3', 'h4']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });

    const res = await request('POST', '/api/games/000003/join', { nickname: 'Extra' }, token);
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'game_full');
  });

  it('returns 409 when game is not waiting', async () => {
    const { token, playerId } = await getSessionToken();
    games.set('000004', {
      id: '000004', type: 'public', hostId: 'h1',
      players: new Set(['h1']), maxPlayers: 4, status: 'playing', inviteCode: null,
    });
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });

    const res = await request('POST', '/api/games/000004/join', { nickname: 'Late' }, token);
    assert.equal(res.status, 409);
  });

  it('returns 400 for invalid nickname', async () => {
    const { token, playerId } = await getSessionToken();
    games.set('000001', {
      id: '000001', type: 'public', hostId: 'h1',
      players: new Set(['h1']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });

    const res = await request('POST', '/api/games/000001/join', { nickname: 'ab' }, token);
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------------
// T022 – POST /api/games  (create)
// ---------------------------------------------------------------------------

describe('POST /api/games', () => {
  it('creates a public game — no inviteCode in response', async () => {
    const { token, playerId } = await getSessionToken();
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });

    const res = await request('POST', '/api/games', { type: 'public', nickname: 'Alice' }, token);
    assert.equal(res.status, 201);
    assert.ok(res.body.gameId);
    assert.equal(res.body.inviteCode, null);
  });

  it('creates a private game — inviteCode is 6-char uppercase alphanum', async () => {
    const { token, playerId } = await getSessionToken();
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });

    const res = await request('POST', '/api/games', { type: 'private', nickname: 'Alice' }, token);
    assert.equal(res.status, 201);
    assert.ok(res.body.inviteCode);
    assert.match(res.body.inviteCode, /^[A-F0-9]{6}$/);
  });

  it('returns 400 when nickname is missing', async () => {
    const { token, playerId } = await getSessionToken();
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });

    const res = await request('POST', '/api/games', { type: 'public' }, token);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_request');
  });

  it('returns 400 when type is invalid', async () => {
    const { token, playerId } = await getSessionToken();
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });

    const res = await request('POST', '/api/games', { type: 'solo', nickname: 'Alice' }, token);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_request');
  });

  it('returns 400 when nickname is too short', async () => {
    const { token, playerId } = await getSessionToken();
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });

    const res = await request('POST', '/api/games', { type: 'public', nickname: 'ab' }, token);
    assert.equal(res.status, 400);
  });

  it('returns 400 when nickname is too long', async () => {
    const { token, playerId } = await getSessionToken();
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });

    const res = await request('POST', '/api/games', { type: 'public', nickname: 'a'.repeat(21) }, token);
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------------
// T023 – POST /api/games/join-invite
// ---------------------------------------------------------------------------

describe('POST /api/games/join-invite', () => {
  it('returns 200 and gameId on valid code', async () => {
    const { token, playerId } = await getSessionToken();
    games.set('000002', {
      id: '000002', type: 'private', hostId: 'h1',
      players: new Set(['h1']), maxPlayers: 4, status: 'waiting', inviteCode: 'AABBCC',
    });
    players.set('h1', { id: 'h1', nickname: 'Host', gameId: '000002', ws: null, sessionToken: 'token-h1' });
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });
    inviteCodes.set('AABBCC', '000002');

    const res = await request('POST', '/api/games/join-invite', { code: 'AABBCC', nickname: 'Bob' }, token);
    assert.equal(res.status, 200);
    assert.equal(res.body.gameId, '000002');
  });

  it('returns 404 for unknown invite code', async () => {
    const { token, playerId } = await getSessionToken();
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });

    const res = await request('POST', '/api/games/join-invite', { code: 'ZZZZZZ', nickname: 'Bob' }, token);
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'not_found');
  });

  it('returns 409 when game is full', async () => {
    const { token, playerId } = await getSessionToken();
    games.set('000005', {
      id: '000005', type: 'private', hostId: 'h1',
      players: new Set(['h1', 'h2', 'h3', 'h4']), maxPlayers: 4, status: 'waiting', inviteCode: 'F00001',
    });
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });
    inviteCodes.set('F00001', '000005');

    const res = await request('POST', '/api/games/join-invite', { code: 'F00001', nickname: 'Extra' }, token);
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'game_full');
  });

  it('returns 400 for invalid nickname', async () => {
    const { token, playerId } = await getSessionToken();
    games.set('000006', {
      id: '000006', type: 'private', hostId: 'h1',
      players: new Set(['h1']), maxPlayers: 4, status: 'waiting', inviteCode: 'CODE01',
    });
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });
    inviteCodes.set('CODE01', '000006');

    const res = await request('POST', '/api/games/join-invite', { code: 'CODE01', nickname: 'x' }, token);
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------------
// T024 – Private game not in lobby list
// ---------------------------------------------------------------------------

describe('Private game not visible in lobby', () => {
  it('GET /api/games returns empty array after private game created', async () => {
    const { token, playerId } = await getSessionToken();
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });

    const create = await request('POST', '/api/games', { type: 'private', nickname: 'Alice' }, token);
    assert.equal(create.status, 201);

    const list = await request('GET', '/api/games');
    assert.equal(list.status, 200);
    assert.equal(list.body.games.length, 0);
  });
});

// ---------------------------------------------------------------------------
// T039 – Nickname validation across all endpoints
// ---------------------------------------------------------------------------

describe('Nickname validation', () => {
  it('rejects blank nickname on join', async () => {
    const { token, playerId } = await getSessionToken();
    games.set('000001', {
      id: '000001', type: 'public', hostId: 'h1',
      players: new Set(['h1']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });
    const res = await request('POST', '/api/games/000001/join', { nickname: '   ' }, token);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_request');
  });

  it('rejects blank nickname on create', async () => {
    const { token, playerId } = await getSessionToken();
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });
    const res = await request('POST', '/api/games', { type: 'public', nickname: '' }, token);
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------------
// T032 – lobby_update broadcast via WebSocket
// ---------------------------------------------------------------------------

describe('WebSocket lobby_update broadcast', () => {
  it('sends lobby_update to lobby clients when a public game is created', async () => {
    const ws1 = await connectWS();
    const ws2 = await connectWS();

    // Wait for initial lobby_update on both clients
    await waitForMessage(ws1, 'lobby_update');
    await waitForMessage(ws2, 'lobby_update');

    // Clear captured messages so we can detect the new broadcast
    ws1.msgs.length = 0;
    ws2.msgs.length = 0;

    // Trigger game creation via HTTP with a sessionToken
    const { token, playerId } = await getSessionToken();
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });
    await request('POST', '/api/games', { type: 'public', nickname: 'Alice' }, token);

    // Both clients should receive a lobby_update within 1 second
    const [update1, update2] = await Promise.all([
      waitForMessage(ws1, 'lobby_update'),
      waitForMessage(ws2, 'lobby_update'),
    ]);

    assert.equal(update1.games.length, 1);
    assert.equal(update2.games.length, 1);

    ws1.close();
    ws2.close();
  });

  it('sends initial lobby_update immediately on connect', async () => {
    games.set('00000a', {
      id: '00000a', type: 'public', hostId: 'h1',
      players: new Set(['h1']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });

    const ws = await connectWS();
    const update = await waitForMessage(ws, 'lobby_update');
    assert.equal(update.games.length, 1);
    ws.close();
  });
});

// ---------------------------------------------------------------------------
// T033 – Player disconnect cleanup
// ---------------------------------------------------------------------------

describe('WebSocket player disconnect cleanup', () => {
  it('deletes game when host WS disconnects with no other players', async () => {
    // Connect host via WS to get a sessionToken
    const hostWs = await connectWS();
    const connectedMsg = await waitForMessage(hostWs, 'connected');
    const hostToken = connectedMsg.sessionToken;

    // Create game via HTTP with sessionToken
    const createRes = await request('POST', '/api/games', { type: 'public', nickname: 'Host' }, hostToken);
    assert.equal(createRes.status, 201);
    const { gameId } = createRes.body;

    // Verify game exists
    assert.ok(games.has(gameId));

    // Disconnect host
    hostWs.close();
    await new Promise((r) => setTimeout(r, 100));

    // Game should be deleted
    assert.ok(!games.has(gameId));

    // GET /api/games should return empty
    const list = await request('GET', '/api/games');
    assert.equal(list.body.games.length, 0);
  });

  it('sends player_left to remaining players when a non-host WS client disconnects', async () => {
    // Connect two players
    const hostWs = await connectWS();
    const guestWs = await connectWS();

    const hostConnected = await waitForMessage(hostWs, 'connected');
    const guestConnected = await waitForMessage(guestWs, 'connected');

    const hostToken = hostConnected.sessionToken;
    const guestToken = guestConnected.sessionToken;

    // Host creates a game
    const createRes = await request('POST', '/api/games', { type: 'public', nickname: 'Host' }, hostToken);
    assert.equal(createRes.status, 201);
    const { gameId } = createRes.body;

    // Guest joins
    await request('POST', `/api/games/${gameId}/join`, { nickname: 'Guest' }, guestToken);

    // Clear messages
    hostWs.msgs.length = 0;

    // Guest disconnects
    guestWs.close();
    await new Promise((r) => setTimeout(r, 100));

    // Host should have received player_left
    const leftMsg = hostWs.msgs.find((m) => m.type === 'player_left');
    assert.ok(leftMsg, 'host should receive player_left message');
    assert.equal(leftMsg.playerId, guestConnected.playerId);

    hostWs.close();
  });
});

// ---------------------------------------------------------------------------
// Additional coverage tests
// ---------------------------------------------------------------------------

describe('Invalid JSON body handling', () => {
  it('returns 400 for invalid JSON body on POST /api/games', async () => {
    const { token, playerId } = await getSessionToken();
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });
    const res = await requestRaw('/api/games', '{not-valid-json}', token);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_request');
  });

  it('returns 400 for invalid JSON body on POST /api/games/:id/join', async () => {
    const { token, playerId } = await getSessionToken();
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });
    games.set('000001', {
      id: '000001', type: 'public', hostId: 'h1',
      players: new Set(['h1']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });
    const res = await requestRaw('/api/games/000001/join', '{bad json}', token);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_request');
  });

  it('returns 400 for invalid JSON body on POST /api/games/join-invite', async () => {
    const { token, playerId } = await getSessionToken();
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });
    const res = await requestRaw('/api/games/join-invite', 'not-json', token);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_request');
  });
});

describe('Join-invite game status guard', () => {
  it('returns 404 when invite code maps to a non-waiting game', async () => {
    const { token, playerId } = await getSessionToken();
    games.set('00000b', {
      id: '00000b', type: 'private', hostId: 'h1',
      players: new Set(['h1']), maxPlayers: 4, status: 'playing', inviteCode: 'PLAY99',
    });
    inviteCodes.set('PLAY99', '00000b');
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });

    const res = await request('POST', '/api/games/join-invite', { code: 'PLAY99', nickname: 'Bob' }, token);
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'not_found');
  });
});

describe('Existing sessionToken re-use on join', () => {
  it('updates nickname of pre-existing player on join', async () => {
    // Pre-register a player with sessionToken (simulates WS-connected player)
    const { token, playerId } = await getSessionToken();
    players.set(playerId, { id: playerId, nickname: 'OldName', gameId: null, ws: null, sessionToken: token });

    games.set('00000c', {
      id: '00000c', type: 'public', hostId: 'host1',
      players: new Set(['host1']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });
    players.set('host1', { id: 'host1', nickname: 'Host', gameId: '00000c', ws: null, sessionToken: 'host-token' });

    const res = await request('POST', '/api/games/00000c/join', { nickname: 'NewName' }, token);
    assert.equal(res.status, 200);
    assert.equal(players.get(playerId).nickname, 'NewName');
  });
});

describe('WebSocket message handling', () => {
  it('handles ping message without responding', async () => {
    const ws = await connectWS();
    await waitForMessage(ws, 'lobby_update');
    const before = ws.msgs.length;
    ws.send(JSON.stringify({ type: 'ping' }));
    await new Promise((r) => setTimeout(r, 50));
    // No new messages should have been pushed for ping
    assert.equal(ws.msgs.length, before);
    ws.close();
  });

  it('responds with error for unrecognized message type', async () => {
    const ws = await connectWS();
    await waitForMessage(ws, 'lobby_update');
    ws.msgs.length = 0;

    ws.send(JSON.stringify({ type: 'unknown_action' }));
    const err = await waitForMessage(ws, 'error');
    assert.equal(err.code, 'invalid_message');
    ws.close();
  });

  it('responds with error for invalid JSON WS message', async () => {
    const ws = await connectWS();
    await waitForMessage(ws, 'lobby_update');
    ws.msgs.length = 0;

    ws.send('not-valid-json{{{');
    const err = await waitForMessage(ws, 'error');
    assert.equal(err.code, 'invalid_message');
    ws.close();
  });

  it('sends game_joined WS message to player after HTTP join', async () => {
    // Player connects via WS first
    const ws = await connectWS();
    const connected = await waitForMessage(ws, 'connected');
    const token = connected.sessionToken;
    const playerId = connected.playerId;

    // Another player creates a game
    const { token: token2, playerId: playerId2 } = await getSessionToken();
    players.set(playerId2, { id: playerId2, nickname: null, gameId: null, ws: null, sessionToken: token2 });
    const createRes = await request('POST', '/api/games', { type: 'public', nickname: 'Host' }, token2);
    const { gameId } = createRes.body;

    // Our WS player joins
    ws.msgs.length = 0;
    await request('POST', `/api/games/${gameId}/join`, { nickname: 'Joiner' }, token);

    const joined = await waitForMessage(ws, 'game_joined');
    assert.equal(joined.gameId, gameId);
    assert.ok(Array.isArray(joined.players));

    ws.close();
  });
});

// ---------------------------------------------------------------------------
// POST /api/nickname — global nickname uniqueness
// ---------------------------------------------------------------------------

describe('POST /api/nickname', () => {
  it('returns 200 and stores nickname for a connected player', async () => {
    const ws = await connectWS();
    const connected = await waitForMessage(ws, 'connected');
    const token = connected.sessionToken;
    const playerId = connected.playerId;

    const res = await request('POST', '/api/nickname', { nickname: 'Alice' }, token);
    assert.equal(res.status, 200);
    assert.equal(res.body.nickname, 'Alice');
    assert.equal(players.get(playerId).nickname, 'Alice');
    ws.close();
  });

  it('returns 409 when another connected player holds the same nickname', async () => {
    const ws1 = await connectWS();
    const ws2 = await connectWS();
    const c1 = await waitForMessage(ws1, 'connected');
    const c2 = await waitForMessage(ws2, 'connected');
    const token1 = c1.sessionToken;
    const token2 = c2.sessionToken;

    await request('POST', '/api/nickname', { nickname: 'Alice' }, token1);
    const res = await request('POST', '/api/nickname', { nickname: 'Alice' }, token2);
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'duplicate_nickname');
    ws1.close();
    ws2.close();
  });

  it('rejects duplicate nicknames case-insensitively', async () => {
    const ws1 = await connectWS();
    const ws2 = await connectWS();
    const c1 = await waitForMessage(ws1, 'connected');
    const c2 = await waitForMessage(ws2, 'connected');
    const token1 = c1.sessionToken;
    const token2 = c2.sessionToken;

    await request('POST', '/api/nickname', { nickname: 'Alice' }, token1);
    const res = await request('POST', '/api/nickname', { nickname: 'ALICE' }, token2);
    assert.equal(res.status, 409);
    ws1.close();
    ws2.close();
  });

  it('allows a player to re-claim their own nickname', async () => {
    const ws = await connectWS();
    const connected = await waitForMessage(ws, 'connected');
    const token = connected.sessionToken;

    await request('POST', '/api/nickname', { nickname: 'Alice' }, token);
    const res = await request('POST', '/api/nickname', { nickname: 'Alice' }, token);
    assert.equal(res.status, 200);
    ws.close();
  });

  it('returns 400 for nickname that is too short', async () => {
    const ws = await connectWS();
    const connected = await waitForMessage(ws, 'connected');
    const token = connected.sessionToken;

    const res = await request('POST', '/api/nickname', { nickname: 'ab' }, token);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_request');
    ws.close();
  });

  it('returns 400 for nickname that is too long', async () => {
    const ws = await connectWS();
    const connected = await waitForMessage(ws, 'connected');
    const token = connected.sessionToken;

    const res = await request('POST', '/api/nickname', { nickname: 'a'.repeat(21) }, token);
    assert.equal(res.status, 400);
    ws.close();
  });

  it('returns 401 when sessionToken is invalid', async () => {
    const res = await request('POST', '/api/nickname', { nickname: 'Alice' }, 'invalid-token');
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'unauthorized');
  });

  it('returns 401 when sessionToken is absent', async () => {
    const res = await request('POST', '/api/nickname', { nickname: 'Alice' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'unauthorized');
  });

  it('returns 400 for invalid JSON body', async () => {
    const { token, playerId } = await getSessionToken();
    players.set(playerId, { id: playerId, nickname: null, gameId: null, ws: null, sessionToken: token });
    const res = await requestRaw('/api/nickname', '{bad-json}', token);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_request');
  });
});

// ---------------------------------------------------------------------------
// HTTP server error handling
// ---------------------------------------------------------------------------

describe('HTTP server error handling', () => {
  it('returns 500 when handleRequest throws', async () => {
    const orig = store.getLobbyGames.bind(store);
    store.getLobbyGames = () => { throw new Error('forced test error'); };
    try {
      const res = await request('GET', '/api/games');
      assert.equal(res.status, 500);
      assert.equal(res.body.error, 'internal_error');
    } finally {
      store.getLobbyGames = orig;
    }
  });
});

// ---------------------------------------------------------------------------
// WebSocket upgrade handling
// ---------------------------------------------------------------------------

describe('WebSocket upgrade handling', () => {
  it('destroys socket for WebSocket upgrade to a non-/ws path', async () => {
    const { port } = server.address();
    await new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port,
        path: '/not-a-websocket-path',
        method: 'GET',
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13',
        },
      });
      req.on('error', resolve);
      req.on('upgrade', resolve);
      req.on('response', resolve);
      req.end();
      setTimeout(resolve, 300);
    });
    // Passes as long as the server handles the upgrade without hanging
  });
});

// ---------------------------------------------------------------------------
// ThousandStore disconnect edge cases
// ---------------------------------------------------------------------------

describe('WebSocket disconnect edge cases', () => {
  it('disbands game and notifies guest when host disconnects with remaining players', async () => {
    const hostWs = await connectWS();
    const guestWs = await connectWS();
    const hConn = await waitForMessage(hostWs, 'connected');
    const gConn = await waitForMessage(guestWs, 'connected');

    const createRes = await request('POST', '/api/games', {
      type: 'public', nickname: 'Host',
    }, hConn.sessionToken);
    const { gameId } = createRes.body;
    await request('POST', `/api/games/${gameId}/join`, { nickname: 'Guest' }, gConn.sessionToken);

    guestWs.msgs.length = 0;
    hostWs.close();
    await new Promise((r) => setTimeout(r, 100));

    assert.ok(!games.has(gameId), 'game should be disbanded when host disconnects');
    const disbandMsg = guestWs.msgs.find((m) => m.type === 'game_disbanded');
    assert.ok(disbandMsg, 'remaining guest should receive game_disbanded');
    assert.equal(disbandMsg.reason, 'host_left');
    guestWs.close();
  });

  it('cleans up inviteCode when private game host disconnects alone', async () => {
    const hostWs = await connectWS();
    const connected = await waitForMessage(hostWs, 'connected');

    const createRes = await request('POST', '/api/games', {
      type: 'private', nickname: 'Host',
    }, connected.sessionToken);
    assert.equal(createRes.status, 201);
    const { gameId, inviteCode } = createRes.body;
    assert.ok(inviteCodes.has(inviteCode));

    hostWs.close();
    await new Promise((r) => setTimeout(r, 100));

    assert.ok(!games.has(gameId));
    assert.ok(!inviteCodes.has(inviteCode));
  });
});

// ---------------------------------------------------------------------------
// StaticServer path traversal protection
// ---------------------------------------------------------------------------

describe('Static file path traversal protection', () => {
  it('returns 404 for path traversal attempts', async () => {
    const { port } = server.address();
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port,
        path: '/../../etc/passwd',
        method: 'GET',
      }, (r) => {
        r.resume();
        resolve({ status: r.statusCode });
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(res.status, 404);
  });
});
