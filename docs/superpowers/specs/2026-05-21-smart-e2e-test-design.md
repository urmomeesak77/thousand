# Smart Live E2E Test — Design

**Date:** 2026-05-21
**Topic:** A heuristic-driven live 3-browser end-to-end test that plays Thousand strategically and reliably drives a player to the 1000-point victory in fewer rounds than the existing `tests/e2e-live.js`.

## Problem

`tests/e2e-live.js` plays "dumb": every player passes the auction, the forced last bidder takes the minimum contract (100), and everyone plays the first legal card each trick. Points scatter across all three seats, so the game grinds ~10 rounds before someone crosses 1000. We want a test that plays with intent — concentrating points on one declarer who makes healthy, marriage-backed bids — so the victory condition is reached in ~5–6 rounds, while still exercising every phase (bidding, exchange, trick play, marriage declaration, round summary, victory/final-results).

## Scope

- **New file:** `tests/e2e-live-smart.js`. The existing `tests/e2e-live.js` is left untouched.
- **Run mode:** visible (`headless:false`, `slowMo` on), matching the current test, so the game can be watched.
- **Strategy depth:** heuristic (read card ranks from the DOM; no full lookahead/simulation).

## Scaffolding (reused from `e2e-live.js`)

Unchanged from the existing test:

- Server spawned on port **3099**; three browsers — Alice (Chrome), Bob (Firefox), Charlie (Chromium).
- Nickname entry → Alice creates a public game → Bob & Charlie join from the game list → round auto-starts on the 3rd join.
- Per-iteration polling loop with a **stuck detector** (same-player-acts-alone and no-actor thresholds) that screenshots + dumps state and bails.
- `pageerror` / console error+warning capture across all three pages.
- Browser anti-throttling args/prefs (background windows must keep their rAF/timers alive for the trick-flight animation lock).

## Strategy — funnel points to one declarer

Rank value for all decisions: **A=11, 10=10, K=4, Q=3, J=2, 9=0** (the card point values).

### Roles
- **Alice (Chrome)** is the designated *aggressor / declarer*.
- **Bob (Firefox)** and **Charlie (Chromium)** are *passive opponents*.

### 1. Bidding
- Bob & Charlie **always pass** — main bidding and sell-bidding.
- Alice computes a **max-makeable bid** from her dealt hand and bids it:

  ```
  floor  = current value of .bid-controls__input   // already MIN_BID, the next legal raise, or the barrel floor (120)
  target = roundDownToStep( 100 + sum(bonus of each complete marriage K+Q she holds), 5 )
  bid    = clamp( floor, target, 300 )              // 300 = MAX_BID cap
  ```

  Rationale: opponents dump their lowest cards, so Alice plausibly wins ~all 120 trick points; "100" is a conservative stand-in for that winnable trick total, and each held marriage (♣100 / ♠80 / ♥60 / ♦40) adds points she can bank by declaring it. This pushes the bid as high as the hand justifies while keeping it makeable. Reading the floor from the pre-filled input means MIN_BID, an in-progress raise, and the barrel floor (120) are all honoured without the test tracking barrel state itself. A flat 300 was rejected: it is unmakeable in almost every hand (max round score ≈ 120 trick points + held marriages), so it would yield −300/round and never reach 1000.
- Alice reads her hand from `.hand-view__card[data-card-id]` (`card--{rank}{suit}` classes) **before** bidding to detect marriages (a suit with both K and Q present).
- Bidding mechanics: set `.bid-controls__input` to `bid` (fires the input handler → re-validates), then click `.bid-controls__bid`.
- If Alice is ever the forced last bidder, the same "bid the computed value" path applies (Pass is hidden; the Bid button resolves the auction).

### 2. Selling
- Alice (declarer) clicks **"Start the game"** (`.declarer-controls__start`), skipping the sell phase — same as the dumb test.

### 3. Card exchange
- Alice keeps her strongest cards: she passes her **two lowest-value cards** out, one to each opponent.
- Mechanics (per existing test): the phase is detected by `.status-bar__exchange-passes`. To pass a chosen card, force-click the target hand card (`.hand-view__card[data-card-id]` — read its rank to pick the lowest), then force-click a `.card-exchange__dest-btn`. Repeat for the second-lowest card to the other destination.

### 4. Trick play
Legality is server-enforced: illegal cards carry `.card--disabled`, so "highest/lowest **legal** card" is always a valid follow-suit/trump play — no led-suit or trump tracking is needed in the test.

- **Alice** plays her **highest-value legal card** each trick → wins the point-rich tricks.
  - Exception: when Alice is **leading** and holds a complete marriage, she leads that suit's **K** to trigger the declare prompt (banks the bonus, sets trump).
- **Bob & Charlie** play their **lowest-value legal card** → dump points toward Alice.

Card play uses `force:true` clicks on `.hand-view--interactive .hand-view__card[data-card-id]:not(.card--disabled)`, selecting by parsed rank value rather than "first".

### 5. Marriage declarations
- Everyone **declares** when the prompt appears (`button[data-action="declare"]`) — maximises table points and shortens the game.

### 6. Crawl (feature 007)
- If Alice is an ace-less declarer, the crawl choice appears (`button[data-action="crawl"]` / `button[data-action="lead-normally"]`). Alice clicks **"Lead normally"** to skip the face-down mechanic and keep the loop simple. With Alice never crawling, the opponent face-down branch never activates.

### 7. Round summary → next round / victory
- Non-victory summary: click `.round-summary__continue-btn`.
- Victory summary / final results: click `.round-summary__back-btn` / `.final-results__back-btn` back to lobby (as today).

## Victory assertion

When the final-results screen appears, read the winner row and assert the goal was actually met:

- Winner score: `.final-results__ranking-row--winner .final-results__ranking-score`.
- **Assert the parsed winner score ≥ 1000.** If not (or if the loop hits the iteration cap before any final-results screen), set `process.exitCode = 1` and emit a clear failure message + screenshots — mirroring the existing test's failure handling.
- Success path logs the winner nickname and score, then drives all three back to the lobby.

## Decision logic placement

The per-player branch order (final-results → summary → marriage → exchange → trick play → declarer-start → sell-pass → bid) mirrors `e2e-live.js`'s `takeAction`. The smart version differs only inside the bidding, exchange, and trick-play branches, which now consult a small shared helper:

- `rankValue(rank)` — map to point value for sorting.
- `readHand(page)` — return `[{cardId, rank, suit, disabled}]` from `.hand-view__card`.
- `findMarriages(cards)` — suits holding both K and Q.
- `pickCard(cards, {highest|lowest, legalOnly})` — choose a card id by rank value.

These keep each phase branch short (≤ the 50-line function guideline) and independently testable by reading.

## Out of scope

- No changes to game source under `src/`.
- No trump/led-suit simulation, no opponent counter-play, no sell-phase exercise (declarer always starts the game).
- Not wired into `npm test` (it is a live, browser-driven script run on demand, like `e2e-live.js`).
