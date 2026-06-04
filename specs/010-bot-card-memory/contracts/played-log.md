# Contract: Played-card log on TrickPlay / Round

A new append-only field exposing the authoritative "cards already gone" timeline. No
WebSocket or HTTP contract changes — this is engine-internal state consumed only by bots.

## `TrickPlay.playedLog: Array<{ cardId: number, trickNumber: number }>`

- Initialised `[]` in the `TrickPlay` constructor (per round / per trick-play entry).
- **Appended at exactly the two points a card leaves a hand**:
  - `playCard(...)` — after `hands[seat] = hands[seat].filter(...)`, push
    `{ cardId, trickNumber: this.trickNumber }`.
  - `commitCrawlCard(...)` — after the hand filter, push
    `{ cardId, trickNumber: this.trickNumber }` (crawl ⇒ `trickNumber === 1`).
- **Not** appended again when crawl commits funnel into `currentTrick` (they already
  logged at commit time) — guarantees no duplicates.

**Guarantees**:
- P1. One entry per card played this round, in play order.
- P2. `trickNumber` is the trick during which the card was played (1–8).
- P3. Length equals total cards played so far (`Σ collectedTrickCounts × playerCount`
  + cards in the current unresolved trick).

## `Round.playedLog` (mirror)

`Round` mirrors trick-play state onto itself; `playedLog` joins that pattern:
- Initialised `[]` in the `Round` constructor (next to `this.collectedTricks`).
- In the trick-play **rehydrate** block (where `this._trickPlay.collectedTricks =
  this.collectedTricks` etc.): `this._trickPlay.playedLog = this.playedLog;`
- In the **sync-back-after-action** block (where `this.collectedTricks =
  this._trickPlay.collectedTricks` etc.): `this.playedLog = this._trickPlay.playedLog;`

**Guarantee**: P4. After any trick-play action, `Round.playedLog === TrickPlay.playedLog`
(same reference, same pattern as `currentTrick`/`collectedTricks`).
