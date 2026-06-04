# Contract: BotMemory API

`src/services/bots/BotMemory.js` — one exported class. The Fourier low-pass recall
model and the deterministic per-card draw are module-private pure helpers in the same
file (mirrors how `BotStrategy.js` keeps its pure helpers private).

## Class `BotMemory`

```js
new BotMemory(memorySkill, memorySeed)
```

| Param | Type | Notes |
|-------|------|-------|
| `memorySkill` | number ∈ [0,1] | Sets the recall filter cutoff. Out-of-range values are clamped. |
| `memorySeed` | integer | Seeds the deterministic recall draw. |

### `recalledGoneCardIds(playedLog, currentTrickNumber, roundKey) → Set<number>`

| Param | Type | Notes |
|-------|------|-------|
| `playedLog` | `Array<{cardId, trickNumber}>` | The round's play log (from `Round.playedLog`). |
| `currentTrickNumber` | number | Used to compute each card's age. |
| `roundKey` | number/string | Per-round salt so different rounds forget differently. |

**Returns**: the set of `cardId`s from **past tricks** (age ≥ 1) the bot recalls as gone.

**Guarantees**:
- C1. Pure: same args ⇒ same Set (FR-008). No internal mutation between calls.
- C2. Age-0 records (played in the in-progress trick) are **never** returned — they are
  on the table and handled by the caller directly. (`kernel[0]=1` conceptually, but they
  are excluded from this set to keep "gone/remembered" = past tricks only.)
- C3. Monotonic recall: if a card is not returned at age `a`, it is not returned at any
  age `> a` for the same bot/round (FR-006/FR-007).
- C4. Skill ordering: for two `BotMemory`s with the same `memorySeed` and the same
  inputs, the higher `memorySkill` returns a set that is a superset-or-equal at every
  age (FR-011).
- C5. Empty `playedLog` ⇒ empty Set.

## Module-private pure helpers (not exported)

- `recallKernel(memorySkill, maxAge) → number[]` — `kernel[age]` recall strengths from
  the first-order low-pass frequency response (research.md §1). `kernel[0] === 1`,
  monotonically non-increasing.
- `recallDraw(memorySeed, roundKey, cardId) → number ∈ [0,1)` — deterministic hash-based
  draw; stable across calls, well-spread across cardIds.

Each helper ≤ ~20 lines (§IX); `BotMemory` ≤ 100 lines (§VIII/§IX).
