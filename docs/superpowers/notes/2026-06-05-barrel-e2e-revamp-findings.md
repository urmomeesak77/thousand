# Barrel e2e revamp — findings

**Date:** 2026-06-05
**Context:** After the barrel non-declarer scoring freeze landed
(`docs/superpowers/specs/2026-06-05-barrel-non-declarer-scoring-design.md`,
commits `cda57d7` / `514f757`), the live barrel e2e needed revisiting.

## TL;DR

- The browser end-game/barrel e2e (`tests/e2e-endgame.js` → `tests/endgameHarness.js`)
  **times out under the corrected barrel rule** — not a product bug, a stale test assumption.
- Driving a seeded-barrel game with the competent bots instead exposed a **separate, pre-existing
  harness timing bug**: the per-player action rate limiter drops a bot's post-bid decision.
- We validated the barrel logic with a **fast deterministic test** instead (commit `fd2cf9e`,
  `tests/Game.barrel.test.js`, ~0.16 s) and deleted the slow bots sim.

## 1. Why the browser end-game e2e now times out

`endgameHarness.js` seeds every seat into `[880, 1000)` (e.g. `985,985,985` and `900,990,950`)
and drives N browsers with **deliberately dumb auto-play** (everyone passes → dealer takes the
forced contract → plays the first legal card).

Under the corrected rule, a non-declarer on the barrel scores **0**, so the only path to 1000 is
**winning a bid as declarer while on the barrel**. Random auto-play almost never makes a 120
contract, and the 3-round −120 knock-down pushes a stuck barrel player back down — so the game
oscillates and never converges. It bails at the 360 s per-scenario budget.

The old seeds "worked" only because of the **bug** the freeze fixed: a non-declarer at 985
collecting ~40 points used to leak across 1000 and win instantly. That path is now (correctly)
closed.

**Status:** `endgameHarness.js` seeds/assertions are stale w.r.t. the corrected rules. Left as-is
for now (the barrel logic is covered fast — see §3). If the live end-game e2e is wanted back,
options are: drive it with the in-process bots (see §2 caveat), or relax the "natural victory
under random play" expectation.

## 2. Pre-existing bot-driver stall: the action rate limiter

While building a bots-only seeded sim to reach victory reliably, every seeded-barrel game stalled
with **0 completed rounds**. Root cause (traced with an action-level trace + stall-state dump):

- `RoundActionHandler` uses `new RateLimiter(250, 1)` — **1 action per 250 ms per player** — shared
  with `TrickPlayActionHandler`. It guards the live server against human WebSocket spam.
- `_runRoundAction` (bids/passes) and `handleStartGame` / sell actions all consume a token.
- A bots-only sim clamps the 1–3 s bot turn timer to a few tens of ms for speed. So when the
  **forced dealer** wins the auction with their own bid and must *immediately* make the post-bid
  decision (`startGame` / `sellStart`), that second action arrives **within 250 ms of their own
  bid** and is **silently dropped**. Phase never advances → stall.
- It surfaces deterministically in the barrel scenario because barrel players pass conservatively,
  making the dealer the forced declarer — the exact back-to-back same-player pattern. It is
  **unrelated to the barrel-freeze change** (that code only runs at round end; the stall is
  mid-round, before any round completes).

**Latent elsewhere:** `tests/sim-bots-only.js` clamps to 180 ms (also < 250 ms) and has the same
latent stall; it just hits the pattern rarely in unseeded games. Not fixed here (out of scope).

**Fix if a bots-only sim is revived:** disable the limiter for the in-process driver, e.g.
`store._botDriver._handler._rateLimiter.isAllowed = () => true;` (the handler instance is shared,
so this covers every action path). No human-spam risk in-process.

## 3. What we did instead — fast deterministic validation

The barrel freeze is a round-**end** scoring property; it does not need a played-out game.
`tests/Game.barrel.test.js` (Suite 6, `RoundActionBroadcaster.computeRoundEnd …`) drives a real
`Round` to a controlled post-trick state and runs the real `computeRoundEnd` / `applyRoundEnd`
path. Commit `fd2cf9e` added the two **gate** cases that encode the rule directly:

- a non-declarer on the barrel at 990 collects points and stays at 990 (cannot win without bidding);
- a declarer on the barrel at 920 makes a 120 contract → 1040 (to win, they bid).

Whole file runs in ~0.16 s; the full barrel file is 37/37 green and covers entry/exit (FR-021),
the 3-round knock-down (FR-023), the bid floor (FR-022), and the freeze + gate. The slow
`tests/sim-barrel-freeze.js` bots sim was deleted.

## Open items

- [ ] `endgameHarness.js` (3p + 4p) seeds/assertions are stale under the corrected rule — decide:
      repoint to in-process bots (apply the §2 limiter fix) or relax the victory expectation.
- [ ] `tests/sim-bots-only.js` shares the latent rate-limiter stall (§2) — fix opportunistically.
