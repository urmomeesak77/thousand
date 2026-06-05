# Bot Bidding Realism & Smarter Selling — Design

Date: 2026-06-05
Status: Approved (design phase)

## Problem

Server-side bots (feature 009 strategy) bid too aggressively. They declare
high contracts and frequently miss them, taking the `−bid` penalty. They also
rarely sell a hopeless hand even when the talon gave them no support.

### Root cause

`botStrategyHelpers.estimateMakeable()` bases every estimate on a flat **105**:

```js
const value = 105 + completeBonus + Math.min(halfCount * 5, 10) + nudge;
```

105 assumes the declarer sweeps ~120 of the 120 trick points — only true
against passive opponents. In a contested 3-bot game declarers capture far
less, so the estimate is systematically inflated. This single value drives
three downstream failures:

1. **Bidding** (`decideBid`): even a weak hand estimates ≥105, so bots almost
   never pass, and `aggressiveness × MAX_TALON_GAMBLE (30)` is added on top —
   guaranteeing overbids and missed contracts.
2. **Selling** (`sellEvaluator.takeOrSell`): sells only when estimate
   `< bid − cushion`; the inflated estimate keeps the bot from selling even a
   talon-starved hand.
3. **Sell exposure** (`sellEvaluator.chooseSellExposure`): exposes the
   highest-*point* cards (aces/tens). Exposing a **K/Q** to let a buyer complete
   a marriage — the genuinely enticing move — is not implemented.

## Goals

- Declarer **make-rate ≈ 65–75%** in headless bots-only simulation (declarers
  rarely go negative, still bid competitively).
- Bots sell a hand the talon failed to support, instead of declaring and missing.
- Sell exposure offers K/Q to entice a buyer who can complete a marriage.

Non-goals: no change to trick-play tactics, no change to the round/auction
engine, no new persisted state, no bot-personality rework beyond bidding scale.

## Design

### 1. Realistic expected-capture estimate (core change)

Rewrite `estimateMakeable(hand)` to return the points the hand can realistically
**win** in a contested game, choosing trump = the hand's longest suit (what a
declarer would pick). Return shape is unchanged: `{ value, complete, half }`.

Contributions (constants tuned empirically against the make-rate target):

- **Aces** — ~11 each, lightly discounted for ruff risk. A trump-suit ace is
  safer than an off-suit ace.
- **Tens** — heavily discounted unless the same-suit ace is also held; a bare 10
  usually loses to the outstanding ace.
- **Trump length** — each trump beyond the third adds ruffing power (capture an
  opponent's point trick), a capped per-card bonus.
- **Complete marriages** — full bonus, lightly discounted (must win a lead to
  declare). **Half marriages** — small capped nudge (a talon card may complete
  them). Preserves the existing `complete` / `half` outputs that callers read.

Typical output drops from a flat ≥105 to ~55–90, so weak hands read as weak and
strong hands still stand out.

### 2. Re-based bid policy

In `BotStrategy.decideBid`, bid **below** the mean expectation by a safety
margin — you must capture *at least* the bid to make it, so bidding at the mean
is ~50% to miss. Aggressiveness raises the target toward/over the expectation
rather than starting from a guaranteed overbid.

```
target = roundDownToStep(expected − SAFETY_MARGIN + aggressiveness × gamble, step)
```

A target below `MIN_BID` ⇒ pass (unless `forced`, where the last bidder takes the
floor — so the auction never stalls). `MAX_TALON_GAMBLE` / new `SAFETY_MARGIN`
live in `botConstants.js`.

### 3. Selling falls out of the realistic estimate

No structural change to `takeOrSell`: with a truthful estimate, a talon that did
not help leaves `estimateMakeable(handWithTalon).value < bid − cushion`, so the
bot sells. Cushion still scales with aggressiveness.

### 4. K/Q-first sell exposure

`chooseSellExposure(hand, count)` exposes **kings and queens first** (signalling a
completable marriage to a buyer holding the matching half), then aces, then by
point value. `buyOrPass` already merges exposed cards and re-estimates, so a
buyer who can complete the marriage now bids.

## Testing & verification

- **Unit (TDD)**: rewrite `estimateMakeable` / sell-exposure expectations to the
  new semantics first, then implement. Update `botStrategyHelpers.test.js`,
  `sellEvaluator.test.js`, `BotStrategy.test.js` as needed. `npm test` green,
  `npm run lint` clean.
- **Headless measurement**: a bots-only harness (reusing the `sim-bots-only.js`
  server path) runs many rounds and reports declarer make-rate + average declarer
  delta. Iterate constants until make-rate ≈ 65–75%.
- **Live confirmation**: one run of the live Chrome bot test
  (`tests/e2e-live-bots.js` / thousand-live-e2e skill) to confirm in a real game.

## Files touched

- `src/services/bots/botStrategyHelpers.js` — `estimateMakeable` rewrite
- `src/services/bots/BotStrategy.js` — `decideBid` re-base
- `src/services/bots/botConstants.js` — `SAFETY_MARGIN`, tuned constants
- `src/services/bots/sellEvaluator.js` — `chooseSellExposure` K/Q-first
- `tests/*` — updated unit expectations + measurement harness
