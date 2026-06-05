# Barrel: freeze non-declarer scoring

**Date:** 2026-06-05
**Status:** Approved (design)

## Problem

In Thousand, a player "on the barrel" (cumulative score in `[BARREL_MIN, BARREL_MAX)` = `[880, 1000)`) cannot improve their score by collecting trick/marriage points as a non-declarer. The only way off the barrel — and the only way to win — is to become the declarer and make a contract. Three barrel rounds without escaping triggers the −120 knock-down.

The current code implements two of the three barrel mechanics but **not** the central one:

- ✅ **Bid floor** — a seat on the barrel must bid ≥ `BARREL_BID_FLOOR` (120). Enforced in `Round` and mirrored in `BotStrategy._decideBidding`.
- ✅ **3-round knock-down** — `Game.applyRoundEnd` advances `barrelRoundsUsed` each on-barrel round and applies `−SPECIAL_PENALTY` after `BARREL_ROUND_LIMIT` (3) rounds in range.
- ❌ **Frozen non-declarer scoring** — `Scoring.roundDeltas` (`Scoring.js:59-65`) always credits a non-declarer their full `roundScoresMap[seat]`, with no regard for barrel state.

Consequences of the gap:

1. A seat on the barrel still banks trick/marriage points every round as a non-declarer, contradicting the rule.
2. Such a seat can even cross 1000 and **win without ever bidding** — which the barrel rule exists to prevent.
3. The 3-round counter is meaningless while points keep accruing.

## Scope

Freeze the **round delta** of a non-declarer who is on the barrel. Out of scope: the four-nines bonus (see Decisions), any new summary UI.

## Approach (chosen: A)

Gate inside `roundDeltas` — the single point where a non-declarer's collected points become a scored delta. The same `deltas` object feeds **both** the summary `delta` field (`Round.buildSummary`) and the cumulative-score update (`Game.applyRoundEnd`), so gating there keeps display and scoring consistent by construction.

Rejected alternatives:
- **B — post-process deltas in `computeRoundEnd`.** Splits the rule across two files; more fragile around ordering.
- **C — A plus a `'barrel-frozen'` display annotation.** More faithful UI, but larger than requested; can be a follow-up.

## Changes

### `src/services/Scoring.js`

`roundDeltas` gains an optional 5th parameter `onBarrelSeats` (a `Set<number>` of seat indices), defaulting to an empty set so existing callers and tests are unchanged.

```js
function roundDeltas(roundScoresMap, declarerSeat, bid, playerCount = 3, onBarrelSeats = new Set()) {
  const n = Number.isInteger(playerCount) ? playerCount : 3;
  const deltas = initSeatMap(n, 0);
  for (const seat of seatRange(n)) {
    if (seat === declarerSeat) {
      deltas[seat] = roundScoresMap[seat] >= bid ? bid : -bid;
    } else if (onBarrelSeats.has(seat)) {
      deltas[seat] = 0;               // on the barrel: no points without bidding
    } else {
      deltas[seat] = roundScoresMap[seat];
    }
  }
  return deltas;
}
```

### `src/services/RoundActionBroadcaster.js`

`computeRoundEnd` builds the set from session barrel state and passes it through:

```js
const onBarrelSeats = new Set(
  seatRange(round.playerCount).filter((s) => game.session.barrelState[s]?.onBarrel),
);
round.roundDeltas = roundDeltas(
  round.roundScores, round.declarerSeat, round.currentHighBid, round.playerCount, onBarrelSeats,
);
```

`barrelState[seat].onBarrel` is set at the end of the *prior* round, so at round-end it correctly reflects whether the seat *entered this round* on the barrel.

## Interaction notes (no code changes needed)

- **Declarer on barrel:** unaffected — still `±bid`. Scoring by bidding is the intended escape.
- **Marriage bonus:** part of `roundScoresMap`, so freezing the whole delta freezes marriage points too. Matches the rule.
- **3-round knock-down:** `barrelRoundsUsed` already advances each on-barrel round; with frozen deltas those rounds genuinely score nothing, so the counter and −120 become meaningful.
- **Three-zeros penalty:** keyed on actually-collected `trickPoints + marriageBonus` (not the delta), so it is unchanged; the barrel counter — not three-zeros — governs on-barrel seats.
- **`applyPenaltyAnnotations` barrel annotation:** computes `cumulativeScores[seat] + deltas[seat]`; with a frozen delta this equals the unchanged cumulative, keeping the seat in barrel range — consistent.

## Decisions

1. **Marriage bonus is frozen** for on-barrel non-declarers. ✅
2. **Four-nines +100 is out of scope.** It is banked immediately at trick-play start (`Game.applyFourNinesBonus` → cumulative, not via `roundDeltas`), so it still lands for an on-barrel non-declarer. Revisit only if desired.
3. **No new summary UI.** The round summary will show `delta: 0` while `trickPoints`/`roundTotal` still show what was collected. Approach C (a `'barrel-frozen'` annotation) is a possible follow-up.

## Testing

Unit tests in `tests/` for `roundDeltas`:

- Non-declarer on barrel → delta `0` even with non-zero `roundScoresMap`.
- Non-declarer **not** on barrel → unchanged full points.
- Declarer on barrel, made bid → `+bid`; missed → `−bid` (gating must not touch the declarer).
- Multiple on-barrel non-declarers in one round all frozen.
- Omitting the `onBarrelSeats` arg preserves legacy behavior.

Integration via `RoundActionBroadcaster.computeRoundEnd` / `Game.applyRoundEnd`:

- A seat entering a round on the barrel banks 0 cumulative from non-declarer play; cannot cross 1000 without bidding.
- After 3 such frozen rounds in range, the −120 knock-down fires.
