# Data Model: Persistent Player Identity

## Server: PlayerRecord

The existing player object in `ThousandStore.players` (`Map<playerId, PlayerRecord>`) gains disconnect-tracking fields.

```js
{
  id: string,                        // crypto.randomUUID() — opaque, stable across sessions
  sessionToken: string,              // crypto.randomUUID() — secret, validated on reconnect
  nickname: string | null,
  gameId: string | null,
  ws: WebSocket | null,              // null during grace period
  disconnectedAt: number | null,     // Date.now() at WS close; null when connected
  graceTimer: NodeJS.Timeout | null, // setTimeout handle; null when connected
}
```

### State machine

```
[not_exists]   --hello(no creds / unknown id / bad token)-->  [connected]    (new identity created)
[connected]    --ws.close-->                                   [grace_period] (timer started)
[grace_period] --hello(valid playerId + matching token)-->     [connected]    (timer cancelled, ws restored)
[grace_period] --timer expires-->                              [purged]       (record deleted, game seat freed)
[connected]    --hello(valid, player already connected)-->     [connected]    (old ws gets session_replaced + close, new ws attached)
```

### Field invariants

| Field | When connected | During grace period | After purge |
|-------|---------------|--------------------|----|
| `ws` | WebSocket instance | `null` | (record gone) |
| `disconnectedAt` | `null` | timestamp | (record gone) |
| `graceTimer` | `null` | timer handle | (record gone) |

---

## Client: ClientIdentity (localStorage)

Stored at key `thousand_identity` as a JSON string.

```js
{
  playerId: string,        // mirrors PlayerRecord.id
  sessionToken: string,    // mirrors PlayerRecord.sessionToken
  nickname: string | null, // cached for immediate display; server is source of truth
}
```

### Lifecycle

| Event | Action |
|-------|--------|
| `connected` message received | Write full identity to `thousand_identity` |
| Page load | Read `thousand_identity`; if present → show overlay, send hello with creds |
| `connected { restored: false }` | Overwrite `thousand_identity` with fresh identity |
| localStorage cleared externally | Next load: no creds → new identity, no overlay |

---

## Validation rules

- `playerId` validated by Map lookup — unknown id → new session (no error)
- `sessionToken` must exactly match stored token for the given `playerId` — mismatch → new session (no error)
- Missing or non-string `playerId` / `sessionToken` in `hello` → treated as no-creds → new session
- `hello` must arrive within 5 seconds of WS connect, else server closes with 1008

---

## Access patterns

| Operation | How | Complexity |
|-----------|-----|------------|
| Reconnect validation | `players.get(playerId)` then token compare | O(1) |
| Find by session token | Linear scan `players.values()` (existing `findBySessionToken`) | O(n) — acceptable |
| Grace timer cancel | `clearTimeout(player.graceTimer)` | O(1) |
| Lobby broadcast | Iterate `players` for `gameId === null && ws.readyState === OPEN` | O(n) — unchanged |
