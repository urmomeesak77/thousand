'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { WebSocket } = require('ws');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let server, store, games, players, inviteCodes;
let baseUrl, wsUrl;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
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

// Send a raw (potentially invalid) body to a POST endpoint
function requestRaw(path, rawBody) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(rawBody) },
    };
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

function connectWS() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const msgs = [];
    let resolveConnected;
    const connectedP = new Promise((r) => { resolveConnected = r; });

    ws.on('open', () => resolveConnected(ws));
    ws.on('message', (data) => msgs.push(JSON.parse(data.toString())));
    ws.on('error', reject);

    connectedP.then((w) => {
      w.msgs = msgs;
      resolve(w);
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
  const mod = require('../server');
  server = mod.server;
  store = mod.store;
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

beforeEach(() => {
  games.clear();
  players.clear();
  inviteCodes.clear();
});

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------

describe('Static files', () => {
  it('serves lobby.html at /', async () => {
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
    games.set('pub001', {
      id: 'pub001', type: 'public', hostId: 'p1',
      players: new Set(['p1']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });
    // Add a private game — should NOT appear
    games.set('prv001', {
      id: 'prv001', type: 'private', hostId: 'p2',
      players: new Set(['p2']), maxPlayers: 4, status: 'waiting', inviteCode: 'ABCDEF',
    });
    // Add a public game that's playing — should NOT appear
    games.set('pub002', {
      id: 'pub002', type: 'public', hostId: 'p3',
      players: new Set(['p3']), maxPlayers: 4, status: 'playing', inviteCode: null,
    });

    const res = await request('GET', '/api/games');
    assert.equal(res.status, 200);
    assert.equal(res.body.games.length, 1);
    assert.equal(res.body.games[0].id, 'pub001');
  });

  it('does not expose inviteCode field in response', async () => {
    games.set('pub001', {
      id: 'pub001', type: 'public', hostId: 'p1',
      players: new Set(['p1']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });
    const res = await request('GET', '/api/games');
    assert.equal(res.status, 200);
    assert.ok(!('inviteCode' in res.body.games[0]));
  });

  it('includes playerCount and maxPlayers fields', async () => {
    games.set('pub001', {
      id: 'pub001', type: 'public', hostId: 'p1',
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
    games.set('g1', {
      id: 'g1', type: 'public', hostId: 'host1',
      players: new Set(['host1']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });
    players.set('host1', { id: 'host1', nickname: 'Host', gameId: 'g1', ws: null });

    const res = await request('POST', '/api/games/g1/join', { nickname: 'Alice' });
    assert.equal(res.status, 200);
    assert.equal(res.body.gameId, 'g1');
  });

  it('returns 404 when game does not exist', async () => {
    const res = await request('POST', '/api/games/missing/join', { nickname: 'Alice' });
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'not_found');
  });

  it('returns 404 for private game', async () => {
    games.set('prv1', {
      id: 'prv1', type: 'private', hostId: 'host1',
      players: new Set(['host1']), maxPlayers: 4, status: 'waiting', inviteCode: 'XYZ123',
    });
    const res = await request('POST', '/api/games/prv1/join', { nickname: 'Alice' });
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'not_found');
  });

  it('returns 409 when game is full', async () => {
    games.set('full1', {
      id: 'full1', type: 'public', hostId: 'h1',
      players: new Set(['h1', 'h2', 'h3', 'h4']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });
    const res = await request('POST', '/api/games/full1/join', { nickname: 'Extra' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'game_full');
  });

  it('returns 409 when game is not waiting', async () => {
    games.set('playing1', {
      id: 'playing1', type: 'public', hostId: 'h1',
      players: new Set(['h1']), maxPlayers: 4, status: 'playing', inviteCode: null,
    });
    const res = await request('POST', '/api/games/playing1/join', { nickname: 'Late' });
    assert.equal(res.status, 409);
  });

  it('returns 400 for invalid nickname', async () => {
    games.set('g1', {
      id: 'g1', type: 'public', hostId: 'h1',
      players: new Set(['h1']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });
    const res = await request('POST', '/api/games/g1/join', { nickname: 'ab' });
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------------
// T022 – POST /api/games  (create)
// ---------------------------------------------------------------------------

describe('POST /api/games', () => {
  it('creates a public game — no inviteCode in response', async () => {
    const res = await request('POST', '/api/games', { type: 'public', nickname: 'Alice' });
    assert.equal(res.status, 201);
    assert.ok(res.body.gameId);
    assert.equal(res.body.inviteCode, null);
  });

  it('creates a private game — inviteCode is 6-char uppercase alphanum', async () => {
    const res = await request('POST', '/api/games', { type: 'private', nickname: 'Alice' });
    assert.equal(res.status, 201);
    assert.ok(res.body.inviteCode);
    assert.match(res.body.inviteCode, /^[A-F0-9]{6}$/);
  });

  it('returns 400 when nickname is missing', async () => {
    const res = await request('POST', '/api/games', { type: 'public' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_request');
  });

  it('returns 400 when type is invalid', async () => {
    const res = await request('POST', '/api/games', { type: 'solo', nickname: 'Alice' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_request');
  });

  it('returns 400 when nickname is too short', async () => {
    const res = await request('POST', '/api/games', { type: 'public', nickname: 'ab' });
    assert.equal(res.status, 400);
  });

  it('returns 400 when nickname is too long', async () => {
    const res = await request('POST', '/api/games', { type: 'public', nickname: 'a'.repeat(21) });
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------------
// T023 – POST /api/games/join-invite
// ---------------------------------------------------------------------------

describe('POST /api/games/join-invite', () => {
  it('returns 200 and gameId on valid code', async () => {
    games.set('prv1', {
      id: 'prv1', type: 'private', hostId: 'h1',
      players: new Set(['h1']), maxPlayers: 4, status: 'waiting', inviteCode: 'AABBCC',
    });
    players.set('h1', { id: 'h1', nickname: 'Host', gameId: 'prv1', ws: null });
    inviteCodes.set('AABBCC', 'prv1');

    const res = await request('POST', '/api/games/join-invite', { code: 'AABBCC', nickname: 'Bob' });
    assert.equal(res.status, 200);
    assert.equal(res.body.gameId, 'prv1');
  });

  it('returns 404 for unknown invite code', async () => {
    const res = await request('POST', '/api/games/join-invite', { code: 'ZZZZZZ', nickname: 'Bob' });
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'not_found');
  });

  it('returns 409 when game is full', async () => {
    games.set('prv2', {
      id: 'prv2', type: 'private', hostId: 'h1',
      players: new Set(['h1', 'h2', 'h3', 'h4']), maxPlayers: 4, status: 'waiting', inviteCode: 'FULL01',
    });
    inviteCodes.set('FULL01', 'prv2');

    const res = await request('POST', '/api/games/join-invite', { code: 'FULL01', nickname: 'Extra' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'game_full');
  });

  it('returns 400 for invalid nickname', async () => {
    games.set('prv3', {
      id: 'prv3', type: 'private', hostId: 'h1',
      players: new Set(['h1']), maxPlayers: 4, status: 'waiting', inviteCode: 'CODE01',
    });
    inviteCodes.set('CODE01', 'prv3');

    const res = await request('POST', '/api/games/join-invite', { code: 'CODE01', nickname: 'x' });
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------------
// T024 – Private game not in lobby list
// ---------------------------------------------------------------------------

describe('Private game not visible in lobby', () => {
  it('GET /api/games returns empty array after private game created', async () => {
    const create = await request('POST', '/api/games', { type: 'private', nickname: 'Alice' });
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
    games.set('g1', {
      id: 'g1', type: 'public', hostId: 'h1',
      players: new Set(['h1']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });
    const res = await request('POST', '/api/games/g1/join', { nickname: '   ' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_request');
  });

  it('rejects blank nickname on create', async () => {
    const res = await request('POST', '/api/games', { type: 'public', nickname: '' });
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

    // Trigger game creation via HTTP
    await request('POST', '/api/games', { type: 'public', nickname: 'Alice' });

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
    games.set('pub1', {
      id: 'pub1', type: 'public', hostId: 'h1',
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
    // Connect host via WS to get a playerId
    const hostWs = await connectWS();
    await waitForMessage(hostWs, 'connected');
    const playerId = hostWs.msgs.find((m) => m.type === 'connected').playerId;

    // Create game via HTTP linking to the WS player
    const createRes = await request('POST', '/api/games', { type: 'public', nickname: 'Host', playerId });
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

    await waitForMessage(hostWs, 'connected');
    await waitForMessage(guestWs, 'connected');

    const hostId = hostWs.msgs.find((m) => m.type === 'connected').playerId;
    const guestId = guestWs.msgs.find((m) => m.type === 'connected').playerId;

    // Host creates a game
    const createRes = await request('POST', '/api/games', { type: 'public', nickname: 'Host', playerId: hostId });
    assert.equal(createRes.status, 201);
    const { gameId } = createRes.body;

    // Guest joins
    await request('POST', `/api/games/${gameId}/join`, { nickname: 'Guest', playerId: guestId });

    // Clear messages
    hostWs.msgs.length = 0;

    // Guest disconnects
    guestWs.close();
    await new Promise((r) => setTimeout(r, 100));

    // Host should have received player_left
    const leftMsg = hostWs.msgs.find((m) => m.type === 'player_left');
    assert.ok(leftMsg, 'host should receive player_left message');
    assert.equal(leftMsg.playerId, guestId);

    hostWs.close();
  });
});

// ---------------------------------------------------------------------------
// Additional coverage tests
// ---------------------------------------------------------------------------

describe('Invalid JSON body handling', () => {
  it('returns 400 for invalid JSON body on POST /api/games', async () => {
    const res = await requestRaw('/api/games', '{not-valid-json}');
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_request');
  });

  it('returns 400 for invalid JSON body on POST /api/games/:id/join', async () => {
    games.set('g1', {
      id: 'g1', type: 'public', hostId: 'h1',
      players: new Set(['h1']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });
    const res = await requestRaw('/api/games/g1/join', '{bad json}');
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_request');
  });

  it('returns 400 for invalid JSON body on POST /api/games/join-invite', async () => {
    const res = await requestRaw('/api/games/join-invite', 'not-json');
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_request');
  });
});

describe('Join-invite game status guard', () => {
  it('returns 404 when invite code maps to a non-waiting game', async () => {
    games.set('prv9', {
      id: 'prv9', type: 'private', hostId: 'h1',
      players: new Set(['h1']), maxPlayers: 4, status: 'playing', inviteCode: 'PLAY99',
    });
    inviteCodes.set('PLAY99', 'prv9');

    const res = await request('POST', '/api/games/join-invite', { code: 'PLAY99', nickname: 'Bob' });
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'not_found');
  });
});

describe('Existing playerId re-use on join', () => {
  it('updates nickname of pre-existing player on join', async () => {
    // Pre-register a player (simulates WS-connected player)
    const pid = 'existing-pid-001';
    players.set(pid, { id: pid, nickname: 'OldName', gameId: null, ws: null });

    games.set('gx', {
      id: 'gx', type: 'public', hostId: 'host1',
      players: new Set(['host1']), maxPlayers: 4, status: 'waiting', inviteCode: null,
    });
    players.set('host1', { id: 'host1', nickname: 'Host', gameId: 'gx', ws: null });

    const res = await request('POST', '/api/games/gx/join', { nickname: 'NewName', playerId: pid });
    assert.equal(res.status, 200);
    assert.equal(players.get(pid).nickname, 'NewName');
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
    await waitForMessage(ws, 'connected');
    const playerId = ws.msgs.find((m) => m.type === 'connected').playerId;

    // Another player creates a game
    const createRes = await request('POST', '/api/games', { type: 'public', nickname: 'Host' });
    const { gameId } = createRes.body;

    // Our WS player joins
    ws.msgs.length = 0;
    await request('POST', `/api/games/${gameId}/join`, { nickname: 'Joiner', playerId });

    const joined = await waitForMessage(ws, 'game_joined');
    assert.equal(joined.gameId, gameId);
    assert.ok(Array.isArray(joined.players));

    ws.close();
  });
});
