# Quickstart: Persistent Player Identity

## What changed

Every browser tab gets a persistent identity stored in `localStorage` under `thousand_identity`. On page load the client reads stored credentials and sends them to the server in a `hello` handshake. If the server recognises the player (within the grace period), nickname and game membership are restored and the UI transitions directly to the lobby or game screen. If not, a fresh identity is issued and the nickname screen is shown as before.

## New files

| File | Purpose |
|------|---------|
| `src/public/js/IdentityStore.js` | Reads/writes/clears the `thousand_identity` localStorage entry |
| `src/public/js/ReconnectOverlay.js` | Shows/hides the "Reconnecting…" overlay |
| `tests/ThousandStore.reconnect.test.js` | Backend: grace period, reconnect, expiry, last-connect-wins |
| `tests/ConnectionManager.hello.test.js` | Backend: hello handshake — new / restore / reject |
| `tests/IdentityStore.test.js` | Frontend: localStorage wrapper (jsdom) |

## Modified files

| File | Change |
|------|--------|
| `src/services/ThousandStore.js` | `createOrRestorePlayer`, `reconnectPlayer`, grace period in `handlePlayerDisconnect` |
| `src/services/ConnectionManager.js` | Deferred identity: waits for `hello` before issuing `connected`; 5 s timeout |
| `src/public/js/ThousandSocket.js` | Sends `{ type: 'hello', ...IdentityStore.load() }` on `ws.onopen` |
| `src/public/js/ThousandApp.js` | Handles `restored` flag, saves identity, shows/hides overlay |
| `src/public/index.html` | Adds reconnecting overlay element |
| `src/public/css/index.css` | Reconnecting overlay styles |

## Backend integration

```js
// Old — ConnectionManager.handleConnection
const { playerId, sessionToken } = this._store.createPlayer(ws, clientIp);
ws.send(JSON.stringify({ type: 'connected', playerId, sessionToken }));

// New — wait for hello, then:
const result = this._store.createOrRestorePlayer(ws, clientIp, playerId, sessionToken);
ws.send(JSON.stringify({ type: 'connected', ...result }));
// If result.restored && result.gameId → also send game_joined
```

## Frontend integration

```js
// IdentityStore.load() returns { playerId?, sessionToken?, nickname? }
// ThousandSocket.connect()
ws.onopen = () => {
  const creds = IdentityStore.load();
  ws.send(JSON.stringify({ type: 'hello', ...creds }));
};

// ThousandApp._handleMessage('connected')
if (msg.restored) {
  this._nickname = msg.nickname;
  IdentityStore.save(msg.playerId, msg.sessionToken, msg.nickname);
  // game_joined will arrive next if in a game; otherwise show lobby
} else {
  IdentityStore.save(msg.playerId, msg.sessionToken, null);
  // show nickname screen
}
this._reconnectOverlay.hide();
```

## Config

`GRACE_PERIOD_MS` defaults to `30_000` (30 s). Override with the `GRACE_PERIOD_MS` environment variable.

## Running tests

```bash
npm test
# or filter to reconnect tests only:
node --test tests/ThousandStore.reconnect.test.js tests/ConnectionManager.hello.test.js tests/IdentityStore.test.js
```
