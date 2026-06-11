# Contract: Structured Codes on Server-Sent User-Visible Text

**Feature**: 013-multilanguage-support
**Scope**: extends *existing* WebSocket/HTTP payloads — no new message types, no removed fields. Backward compatible: clients that ignore `code` behave exactly as today.

## Why

Action-rejection reasons and join failures are the only user-visible *gameplay* prose the server emits (everything else ships as structured facts worded client-side). To render them in the viewer's language without making the server language-aware (the preference is per-browser and never sent to the server, FR-006), each such payload gains a stable `code` + `params`; the client words it via `i18n.t(code, params)` and falls back to the unchanged English text (FR-009).

Infrastructure/exception messages are **exempt** (clarified 2026-06-11): they stay English and gain no codes.

## Extended payloads

### `action_rejected` (WS, per-player)

```jsonc
{
  "type": "action_rejected",
  "action": "place_bid",
  "reason": "Bid must be at least 110",     // UNCHANGED — English prose, fallback + logs/tests
  "code": "reject.bidBelowMin",             // NEW — stable catalog key
  "params": { "min": 110 }                  // NEW — primitives only; omitted when empty
}
```

### `game_join_failed` (WS)

```jsonc
{ "type": "game_join_failed", "reason": "Game is already in progress", "code": "reject.gameInProgress" }
```

### `round_aborted`

Already structured (`reason: 'player_grace_expired'` is a code, and the client words it). It joins the same convention: catalog key `reject.playerGraceExpired`, `params: { name: disconnectedNickname }`.

## Code rules

1. **Origin**: each `{ rejected: true, reason }` return site in `Round.js`, `TrickPlay.js`, `ThousandStore.js`, and the controllers gains a sibling `code` (and `params` when the prose interpolates values). The English `reason` string itself is not modified. The `error` message type (`ConnectionManager`) is **not** part of this contract — infrastructure messages stay as they are.
2. **Naming**: `reject.<camelCaseSlug>` describing the *cause*, not the phase — e.g. `reject.notYourTurn`, `reject.notInBiddingPhase`, `reject.roundPaused`, `reject.bidNotMultiple` (`{ step }`), `reject.bidAboveMax` (`{ max }`), `reject.bidBelowMin` (`{ min }`), `reject.barrelBidFloor` (`{ floor }`), `reject.mustBidCannotPass` (`{ floor }`), `reject.cardNotInHand`, `reject.mustFollowSuit`, `reject.ackFourNinesFirst`, `reject.holdAceCannotCrawl`. Identical causes in different methods reuse the same code.
3. **Registry**: the authoritative list of codes **is** the `reject.*` key set of `catalogs/en.js`. `tests/rejection-codes.test.js` asserts (a) every server-emitted code exists in the English catalog, and (b) codes are stable strings with primitive-only params.
4. **Params**: primitives only (string/number/boolean). Player-entered values (nicknames) ride in params and are interpolated verbatim, never translated (FR-012).

## Client obligation (`ThousandMessageRouter`)

```text
action_rejected / game_join_failed:
  display = code resolvable in catalog → i18n.t(code, params)
            otherwise                  → reason (English, FR-009)
error (infrastructure):
  display = message verbatim (exempt from translation)
```

Toasts produced this way are transient: an already-visible toast is not retro-translated on language switch; the next one appears in the new language (spec edge case).

## Out of scope

- Snapshot/view-model content (`gameStatus`, `actionHistory`, seats, scores) — already structured facts, worded client-side.
- The `error` WS message type (invalid JSON, unrecognized message type, server error) and HTTP 500 bodies — infrastructure/exception messages, exempt from translation per the 2026-06-11 clarification; payloads untouched.
- Server logs and test fixtures — remain English.
