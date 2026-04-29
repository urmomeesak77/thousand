# WS Message Contracts: Persistent Player Identity

Changes to the existing WS protocol. Existing message shapes not listed here are unchanged.

---

## New: Client → Server

### `hello`

First message sent by the client on every WS connection, immediately after `onopen` fires.

```json
{
  "type": "hello",
  "playerId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionToken": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
}
```

**Fields**:

| Field        | Type   | Required | Notes |
|--------------|--------|----------|-------|
| type         | string | yes      | `"hello"` |
| playerId     | string | no       | Omit on first visit; UUID v4 if present |
| sessionToken | string | no       | Omit on first visit; UUID v4 if present |

**Server behavior**:
- Both present, `playerId` found, token matches → restore session → `connected { restored: true }`
- Either absent, `playerId` unknown, or token mismatch → new session → `connected { restored: false }`
- No `hello` within 5 s of connect → server closes with 1008

---

## Modified: Server → Client

### `connected` (extended)

Previously: `{ type, playerId, sessionToken }`.  
Now adds: `restored`, `nickname`.

```json
{
  "type": "connected",
  "playerId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionToken": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "restored": true,
  "nickname": "Alice"
}
```

**Fields**:

| Field        | Type           | Notes |
|--------------|----------------|-------|
| type         | `"connected"`  | |
| playerId     | string         | Stable identity (new or restored) |
| sessionToken | string         | Secret token (new or restored) |
| restored     | boolean        | `true` = prior session restored |
| nickname     | string \| null | Restored nickname; `null` for new sessions |

**Follow-up**: If `restored: true` and player was in a game, the server immediately sends `game_joined` (unchanged shape) to trigger UI restoration.

**Client behavior on `restored: true`**: save to localStorage, restore nickname in UI, skip nickname screen, wait for optional `game_joined`.  
**Client behavior on `restored: false`**: save new identity to localStorage, dismiss overlay, show nickname screen.

---

## New: Server → Client

### `session_replaced`

Sent to the **previously connected** WebSocket when a new connection claims the same identity (last-connect-wins, FR-007).

```json
{
  "type": "session_replaced"
}
```

Server closes the old WebSocket immediately after sending this message.

**Client behavior**: show a brief toast ("Connected from another tab — this session ended."), then do nothing further (the WS is closing).
