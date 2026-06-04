# Phase 1 Data Model: Bot Card Memory

All state is in-memory. No persistence, no schema migration.

## Entity: Per-bot memory traits (on the `PlayerRegistry` player entry)

Added to the existing bot player object next to `aggressiveness`.

| Field | Type | Origin | Notes |
|-------|------|--------|-------|
| `memorySkill` | number ∈ [0, 1] | `Math.random()` at `createBot` | Sets the recall filter cutoff. Higher ⇒ stronger/longer recall (FR-009/FR-011). |
| `memorySeed` | integer | `crypto.randomInt(...)` at `createBot` | Stable per-bot seed for the deterministic per-card recall draw (FR-008). |

- **Lifetime**: drawn once when the bot is created; persists for the whole game (like
  `aggressiveness`). Not reset between rounds — only the *remembered cards* are
  per-round, and those are derived, not stored.
- **Validation**: `memorySkill` clamped to [0, 1]; `memorySeed` any integer. No external
  input — server-generated only. Not included in serialized player view-models (internal).

## Entity: Played-Card Record (entries of `TrickPlay.playedLog` / `Round.playedLog`)

Append-only log of cards that have left a hand this round — the authoritative
"cards already gone" timeline.

| Field | Type | Notes |
|-------|------|-------|
| `cardId` | number | Index into the round `deck`. |
| `trickNumber` | number (1–8) | The trick during which the card was played. |

- **Append points**: `TrickPlay.playCard` and `TrickPlay.commitCrawlCard`, immediately
  after the card is removed from the hand (single source of truth; crawl cards log at
  `trickNumber === 1`, never double-logged when funnelled into `currentTrick`).
- **Lifetime**: created empty per `TrickPlay` (i.e. per round, on entry to trick-play);
  mirrored onto `Round` in both trick-play sync blocks. Discarded with the round (FR-002).
- **Ordering**: insertion order = play order. `age` of a record at decision time
  = `currentTrickNumber − trickNumber` (0 = played in the in-progress trick).

## Entity: Bot Card Memory (`BotMemory` instance — transient, per decision)

Constructed by `BotTurnDriver` from the acting bot's traits; not stored.

| Field | Type | Notes |
|-------|------|-------|
| `memorySkill` | number ∈ [0, 1] | Copied from the player entry. |
| `memorySeed` | integer | Copied from the player entry. |

**Behaviour** (no other stored state — recall is a pure function of inputs):
- `recalledGoneCardIds(playedLog, currentTrickNumber, roundKey) → Set<cardId>`:
  for each past-trick record (age ≥ 1), include `cardId` iff
  `draw(memorySeed, roundKey, cardId) < kernel[age]`. Age-0 records are excluded here
  (they are on the table and read directly from `currentTrick`).

## Derived value: Recall Strength `kernel[age]`

Not stored — computed per decision by the Fourier low-pass model (see research.md §1).

| Property | Constraint |
|----------|-----------|
| `kernel[0]` | = 1 (a just-played / on-table card is always recalled) |
| Monotonicity | `kernel[a+1] ≤ kernel[a]` (recall never increases with age) — FR-006 |
| Imperfection | `kernel[a] < 1` for some reachable `a` at any `memorySkill < max` — FR-007 |
| Skill ordering | for fixed age `a≥1`, `kernel_skillHi[a] ≥ kernel_skillLo[a]` — FR-011 |

## Entity relationships

```text
PlayerRegistry entry (bot)
  ├─ memorySkill, memorySeed ──────────────┐
  └─ aggressiveness (existing)             │
                                           ▼
BotTurnDriver  ──builds──►  BotMemory(memorySkill, memorySeed)
      │                          │
      │ reads Round.playedLog ───┘ recalledGoneCardIds(log, trickNo, roundKey)
      ▼                                       │
BotStrategy.decide(round, seat, aggressiveness, { goneCardIds })  ◄── Set<cardId>
      │
      └─ isBossCard(card, { goneCardIds, hand, currentTrick }, trump)  → lead/follow choice
```

## Decision knowledge object (passed into `BotStrategy.decide`)

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `goneCardIds` | Set<cardId> | empty Set | Cards the bot currently recalls as played in past tricks. Empty ⇒ behaviour identical to feature 009. |
