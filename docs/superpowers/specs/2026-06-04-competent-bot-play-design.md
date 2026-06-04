# Design: Competent bot play

**Date**: 2026-06-04
**Status**: Draft for review
**Area**: Server-side bot strategy (`src/services/bots/`)
**Relationship**: Builds on feature 009 (bot opponents) and feature 010 (bot card memory).
No game-rule change — only bot *decision quality* changes.

## 1. Problem

Bots are willing to bid, but they play badly because feature 009 shipped deliberate v1
shortcuts in `BotStrategy`:

- **Selling**: the declarer *always* `startGame` (never sells); opponents *always*
  `sellPass` (never buy).
- **Marriage**: a bot declares a marriage the first legal moment (trick 2, highest-bonus
  suit) regardless of whether that wins the trick or sets a useful trump.
- **Card play**: opponents dump the lowest-value legal card; the declarer leads
  marriage → boss → highest trump → highest free card; follow plays the cheapest winner
  or the lowest discard. No notion of winning the point-rich tricks, ducking cheap ones,
  protecting aces/tens, or drawing trumps.

## 2. Goal & non-goals

**Goal**: bots that play **competently and believably** — no obvious blunders — using the
card memory (`goneCardIds`) they already receive. Deterministic, pure, unit-testable,
flavored by each bot's existing `aggressiveness` and `memorySkill` traits.

**Non-goals (YAGNI)**:

- No Monte-Carlo / multi-ply lookahead, opponent modelling, or endgame solving (rejected
  Approach B — heavier, non-deterministic, makes bots too strong).
- No new game rules, WebSocket/HTTP contracts, or frontend changes.
- No new per-bot traits — reuse `aggressiveness` and `memorySkill`.
- Selling-selection (which cards to expose) stays intentionally simple — selling is rare.

## 3. Approach

**Approach A — heuristic upgrade in place.** Add small pure helper units beside
`botStrategyHelpers.js`; `BotStrategy` orchestrates them. Each unit answers one question,
is a pure function of its arguments, and is tested in isolation. The feature-010
boss-card cashing folds into the new trick planner unchanged.

## 4. New / changed files

```text
src/services/bots/
  trickPlanner.js     # NEW — pure lead/follow/marriage-timing decision helpers
  sellEvaluator.js    # NEW — pure take-vs-sell, expose-selection, buy-vs-pass helpers
  botStrategyHelpers.js  # EDIT — small shared primitives (trick point value, suit length,
                         #        trump control, "cheapest winner / lowest duck" pickers)
  BotStrategy.js      # EDIT — route post-bid-decision + selling-bidding + trick-play to the
                      #        new helpers; emit the new decision kinds
  BotTurnDriver.js    # EDIT — _execute gains sellStart / sellSelect / sellBid cases
  botConstants.js     # EDIT — named thresholds (sell cushion, buy margin, trump-control min)
tests/
  trickPlanner.test.js
  sellEvaluator.test.js
  botStrategyHelpers.test.js   # EDIT — cover the new primitives
  BotStrategy.test.js          # EDIT — phase routing for the new decisions
```

## 5. Decision flow (what changes in `BotStrategy.decide`)

| Phase | Today | New |
|-------|-------|-----|
| `post-bid-decision` (declarer) | `{ startGame }` | `sellEvaluator.takeOrSell(...)` → `{ startGame }` **or** `{ sellStart }` |
| `selling-selection` (declarer) | *(n/a — never reached)* | `{ sellSelect, cardIds }` (expose strongest N) |
| `selling-bidding` (opponent) | `{ sellPass }` | `sellEvaluator.buyOrPass(...)` → `{ sellBid, amount }` **or** `{ sellPass }` |
| `trick-play` lead | marriage→boss→trump→highest | `trickPlanner.chooseLead(...)` |
| `trick-play` follow | cheapest-winner / lowest | `trickPlanner.chooseFollow(...)` |
| `bidding` | `decideBid` | `decideBid` with a refined `estimateMakeable` |

New decision kinds and their existing handler targets (verified to exist):

- `sellStart` → `handleSellStart(botId)`
- `sellSelect` → `handleSellSelect(botId, cardIds)`
- `sellBid` → `handleSellBid(botId, amount)`

## 6. Heuristics

### 6.1 Trick planner — leading (`chooseLead`)
In priority order, choosing among **legal, non-reserved** cards:

1. **Marriage** (see 6.3) — if the timing test says declare now.
2. **Cash a boss point card** — the highest-point card that `isBossCard` (memory-confirmed
   guaranteed winner). Unchanged from feature 010, now living here.
3. **Draw trumps** — when the bot has *trump control* (holds the top remaining trump, or a
   trump-length majority by memory) and trumps are still out: lead the highest trump to
   strip opponents' ruffers and protect side-suit aces.
4. **Lead toward strength** — otherwise lead a low card from a long side suit to keep
   control and flush high cards, **never** leading a bare (singleton) ace into live trumps,
   and **keeping** aces/tens and reserved-marriage K/Q.

### 6.2 Trick planner — following (`chooseFollow`)
1. Compute the trick's **point value** (sum of `RANK_VALUE`) and the current winning card.
2. **If the bot can beat the current winner:**
   - **Win** when the trick has points **or** seizing the lead advances the bot's winners.
     Use the *cheapest* card that wins if the bot is last to play; if not last, consult
     memory — play a **sure winner** (boss) when an opponent still to act could overtake,
     otherwise **duck** rather than spend a high card that gets overtrumped.
   - **Trump to win** only point-rich tricks when void in the led suit; never ruff a
     worthless trick.
3. **If it should not / cannot win:** **duck** with the lowest-value legal card; never spill
   an ace/ten when a cheaper legal card exists; keep reserved-marriage cards.

### 6.3 Marriage timing
Declare only while **leading** in the window (tricks 2–6) and holding a complete marriage:

- Prefer declaring when the marriage's **K is a likely winner** (boss or top of its suit)
  so the bot banks the bonus *and* retains the lead.
- Choose **which** marriage by `bonus + trump usefulness` (does making that suit trump help
  this hand — trump length, side-suit aces to protect?).
- **Deadline**: if trick 6 (last chance) and a marriage is still undeclared, declare the
  highest-bonus one regardless — never forfeit the bonus.

### 6.4 Sell evaluator
- **`takeOrSell(hand, bid, aggressiveness, attemptsLeft)`**: take when
  `estimateMakeable(hand).value ≥ bid − SELL_CUSHION`, where the cushion shrinks as
  `aggressiveness` rises (bold bots take thinner). Sell (`sellStart`) otherwise. Force take
  when `attemptsLeft === 0`.
- **`chooseSellExposure(hand, count)`**: expose the strongest `count` cards (highest
  `RANK_VALUE`, completing-marriage cards first) to entice a buyer. Simple by design.
- **`buyOrPass(hand, exposedCards, bid, aggressiveness)`**: with the exposed cards merged in,
  buy when `estimateMakeable(merged).value ≥ bid + BUY_MARGIN`, bidding the makeable value
  (clamped to legal sell-bid range); the margin shrinks with `aggressiveness`. Else pass.

### 6.5 Bidding tune
Refine `estimateMakeable` to add a small, capped bonus for **trump length** (4+ of a suit)
and **extra aces**, so bids track hand strength without inflating past the sweepable
ceiling. Willingness (the aggressiveness gamble) is unchanged.

## 7. Personality threading

- **`aggressiveness`** drives the *risk* decisions: bid gamble (existing), `SELL_CUSHION`,
  `BUY_MARGIN`. Bolder bots bid/take/​buy more.
- **`memorySkill`** already flavors card play: a forgetful bot identifies fewer boss cards
  and mis-reads who is still live, so it plays looser — no extra wiring needed.

## 8. Backward compatibility

- **Stay green (invariants):** every game-rule, legality, and snapshot test; the pure
  card-memory **unit** tests (`BotMemory.test.js`, `botStrategyHelpers.boss.test.js`).
  Boss-card cashing is preserved as a capability — it moves into `trickPlanner.chooseLead`.
- **Intentionally updated (behavior change):**
  - feature-009 `BotStrategy` strategy-preference tests that encode v1 *dumb* play —
    "opponent dumps its lowest legal card" (now wins a point-rich trick with its ace),
    "declarer follow wins a worthless trick" (now ducks to save the high card). Rewritten
    to assert the competent behavior, each with a comment explaining the change.
  - the **memory integration** tests (`BotStrategy.memory.test.js`): the new lead heuristic
    changes the empty-memory baseline (it leads a low safe card and still cashes an
    *inherent* boss like a bare ace), so these scenarios are refreshed to a hand where the
    memory-enabled boss (e.g. `K♣` once `A♣/10♣` are recalled gone) differs from the
    empty-memory lead — preserving the property "memory enables a boss-cash the bot would
    otherwise miss."
- We do **not** weaken legality — every returned action is still validated by
  `RoundActionHandler`. New decision kinds are additive.

## 9. Testing strategy

- **Unit** (pure, deterministic, `// per FR-NNN`-style annotations):
  - `trickPlanner`: win point-rich trick cheaply; duck a cheap trick keeping aces; draw
    trumps with control; don't ruff a worthless trick; lead boss; marriage-timing truth
    table incl. the trick-6 deadline.
  - `sellEvaluator`: take a makeable hand; sell a hopeless one; force-take with no attempts;
    aggressiveness moves the threshold; buy a profitable exposed hand, pass otherwise.
  - `botStrategyHelpers`: the new primitives.
- **Integration**: a bots-only sim sanity check — declarers make their bid noticeably more
  often than the v1 baseline, sells occur on hopeless hands, marriages are declared at
  sensible moments, and the full game still reaches a scored victory with no errors.
- **Coverage** ≥ 90% on the new/changed files (constitution).

## 10. Risks / open questions

- "Trump control" and "lead toward strength" are the fuzziest heuristics; keep them simple
  and lean on tests to lock behavior. If a rule proves weak in the sim, tune the constant,
  not the structure.
- Sell exposure is deliberately shallow; revisit only if observed sell play looks silly.
