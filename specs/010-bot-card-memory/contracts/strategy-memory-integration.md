# Contract: Strategy ↔ Memory integration

How recalled-gone knowledge enters `BotStrategy` and changes a decision. Backward
compatible: with no knowledge supplied, behaviour is identical to feature 009.

## `BotStrategy.decide(round, seat, aggressiveness, knowledge)`

New optional 4th parameter:

```js
knowledge = { goneCardIds: new Set() }   // default
```

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `goneCardIds` | `Set<number>` | empty | cardIds the bot recalls as played in past tricks. |

**Guarantees**:
- S1. Called with the default (empty) `knowledge`, every decision is **identical** to the
  current feature-009 output (all existing tests stay green).
- S2. The strategy reads gone-card knowledge **only** from `knowledge.goneCardIds` — never
  from `round.playedLog`/`collectedTricks` directly — so it acts on what the bot *recalls*,
  not ground truth (FR-012).

## Helper: `isBossCard(card, context, trump) → boolean`

Added to `src/services/bots/botStrategyHelpers.js` (pure).

```js
isBossCard(card, { goneCardIds, hand, currentTrick }, trump)
```

Returns `true` iff **no card still unaccounted-for can beat `card`** — i.e. every card
that ranks higher than `card` (trump-aware, per `cardBeats`) is either in `goneCardIds`,
in the bot's own `hand`, or already on the table in `currentTrick`.

**Guarantees**:
- H1. Pure; depends only on its arguments.
- H2. Trump-aware: uses the same beat ordering as `cardBeats`.
- H3. Conservative under forgetting: a higher card that is genuinely gone but **not** in
  `goneCardIds` (forgotten) makes `isBossCard` return `false` — the bot cannot prove the
  card is safe, so it does not treat it as a guaranteed winner (this is the observable
  "memory mistake", SC-004).

## Decision change (lead and follow)

- **Lead** (declarer or opponent): if any legal, non-marriage-reserved card is a boss
  card with point value > 0, lead the highest-point such boss card; otherwise fall back
  to today's lead logic.
- **Follow**: unchanged winning/ducking logic, except a boss card identifiable as a
  guaranteed winner of a point-bearing trick is preferred over an equal-value non-boss
  play. Marriage-reservation rules from feature 009 still apply.

**Guarantee**: S3. The change only ever **reorders preferences among already-legal
moves** — it never produces an illegal action (the `RoundActionHandler` still validates),
and it changes only bot decision quality, not game rules (FR-014).
