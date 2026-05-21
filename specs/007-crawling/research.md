# Phase 0 Research: Crawling

All Technical Context unknowns resolved below. No NEEDS CLARIFICATION remained from the spec (three were resolved at spec-creation time and recorded in spec.md).

---

## Decision 1 — Eligibility is a pure card-fact helper on `Scoring.js`

**Decision**: Add `handHasAce(handCardIds, deck) → boolean` to `src/services/Scoring.js`, beside the existing `findFourNinesSeat`. Crawl is offered to the declarer when `!handHasAce(hands[declarerSeat], deck)` at trick-play start.

**Rationale**: Whether a hand contains an ace is a stateless fact about cards — the same category as `findFourNinesSeat`/`cardPoints`, which already live in `Scoring.js`. This honours §VII (pure utility → function) and §X (card facts cohere in the scoring/card module). The hand inspected is the post-talon-pickup, post-exchange 8-card hand — the same snapshot feature 006 uses for the four-nines check — so the declarer's eligibility correctly reflects the talon and the two cards passed away.

**Alternatives considered**: A method on `Round`/`TrickPlay` — rejected: it would duplicate card-iteration logic and add state-bearing methods for a pure question. Computing on the client — rejected: the server is authoritative for eligibility (a client could otherwise offer/force an illegal crawl).

---

## Decision 2 — Crawl sub-state lives on `TrickPlay`, reusing `_resolveTrick`

**Decision**: Model the crawl as a sub-state of the first trick on `TrickPlay`: `crawlActive`, `crawlCommits` (`[{ seat, cardId }]`), and a derived `crawlAvailable`. New methods `beginCrawl()` and `commitCrawlCard(hands, seat, cardId)`. On the **third** commit, move the three commits into the existing `currentTrick` and call the existing `_resolveTrick()` so winner determination, trick collection, and the trick-2 leader advance are **not** reimplemented.

**Rationale**: The crawl trick *is* a trick — it ends in a standard resolution (led suit, no trump on trick 1, highest led-suit wins; winner collects and leads next). `TrickPlay` already owns `_determineWinner`, `_resolveTrick`, leader rotation, and the collected-tricks piles. Funnelling the revealed commits into `currentTrick` and calling `_resolveTrick` reuses all of it (§III least code, §X cohesion). The only crawl-specific behaviour is (a) accepting commits **without** follow-suit and (b) keeping them hidden until the third lands — both small.

**Alternatives considered**:
- *A separate `CrawlTrick.js` class now*: deferred. It is the §IX fallback if `TrickPlay.js` grows past the guideline (R-201), but introducing it up front would duplicate or awkwardly share `_determineWinner`/`_resolveTrick`. Reuse-in-place is simpler today.
- *Routing crawl commits through the normal `playCard`*: rejected — `playCard` enforces follow-suit/trump (`_checkFollowSuit`) and pushes into the public `currentTrick`, which would reject legal blind plays (R-203) and leak faces (R-202).

---

## Decision 3 — Committed cards are held outside the public `currentTrick` until reveal

**Decision**: Crawl commits accumulate in `TrickPlay.crawlCommits`, **not** in `currentTrick`. The per-viewer view-model exposes only `crawlCommittedSeats` (an array of seats) and the **viewer's own** committed card (the viewer already knows it). All three faces are sent exactly once, in the `crawl_revealed` message, after the third commit. `_resolveTrick` populates `currentTrick` only at the moment of resolution (and clears it immediately).

**Rationale**: FR-005 requires no committed face to be visible to any player before the third commit. The existing `currentTrick` view-model field exposes `rank`/`suit` for animation, so reusing it for crawl would leak the gamble (R-202). A seats-only progress field plus an own-card echo is the minimal disclosure — it lets clients render face-down placeholders and confirm their own play without exposing opponents' cards.

**Alternatives considered**: Adding a `hidden: true` flag to `currentTrick` entries and trusting clients not to render faces — rejected: server must not send data it requires clients to ignore (defence-in-depth; a tampered/older client would leak).

---

## Decision 4 — One client→server `crawl_commit` message for both initiate and respond

**Decision**: A single `crawl_commit { cardId }` message serves the declarer's initiating commit **and** each opponent's response. The server uses turn order (`currentTurnSeat`) to interpret it: the first commit (from the declarer, when `crawlAvailable`) begins the crawl; subsequent commits are opponent responses. The declarer **declines** simply by sending the normal `play_card` instead — no separate decline message.

**Rationale**: Every commit is the same operation — "commit one of my cards face-down" — so one message keeps the surface minimal (§III). Turn order already disambiguates sender intent, mirroring how `exchange_pass` and `play_card` rely on `currentTurnSeat`. Modelling decline as "just lead normally" matches the spec (the declarer's first action is either a crawl commit or a face-up lead) and avoids a redundant message.

**Alternatives considered**: Separate `crawl_start` + `crawl_respond` messages — rejected as redundant. A `decline_crawl` message — rejected; the existing `play_card` first lead already expresses it, and `crawlAvailable` flips false once a normal lead is played.

---

## Decision 5 — Two server→client messages: `crawl_committed` (progress, no faces) and `crawl_revealed` (faces + winner)

**Decision**:
- `crawl_committed { seat, committedSeats, gameStatus }` — broadcast after each face-down commit; carries **no** card identity. Drives the face-down placeholder and the "your turn to commit" prompt.
- `crawl_revealed { commits: [{seat, cardId, rank, suit}], winnerSeat, gameStatus }` — broadcast after the third commit; carries all three faces and the winner so clients flip the placeholders face-up and run the collect-to-winner animation. The accompanying `gameStatus` already reflects trick 2 (leader, collected counts).

**Rationale**: Splitting progress (no faces) from reveal (faces) enforces FR-005 at the message boundary, and parallels how feature 006 split `four_nines_awarded` from `four_nines_ack_progress`. The reveal payload mirrors `card_played`'s identity-carrying shape so `TrickPlayView` can reuse its flight/collect animation. If the third commit also completes... it cannot — crawl is trick 1 of 8, so a crawl never ends the round; trick 2 always follows.

**Alternatives considered**: Folding everything onto `phase_changed`/`card_played` — rejected: the blind-then-reveal semantics are distinct enough that dedicated messages keep client routing clear and make the no-face invariant auditable in tests.

---

## Decision 6 — Follow-suit suspended for the crawl trick only; restored from trick 2

**Decision**: `commitCrawlCard` accepts **any** card in the committer's hand (no `_checkFollowSuit`, no trump priority). Because `currentTrick` stays empty during the crawl, `RoundSnapshot._computeLegalCardIds` returns the full hand for the current committer (every card legal). From trick 2 onward, play uses the normal `playCard` path, so follow-suit and trump priority are enforced exactly as today — including against any card an opponent "wasted" on the crawl.

**Rationale**: Opponents commit blind (they cannot see the led suit), so follow-suit is logically impossible to enforce on the crawl trick — this is the essence of the gamble (spec Edge Cases). Confining the suspension to trick 1 (the crawl) and leaving every later trick on the standard path keeps the rules change surgical and avoids any regression to the 005 follow-suit guarantees.

**Alternatives considered**: Enforcing follow-suit on opponents' commits — rejected: incoherent with face-down play and contradicts the spec's resolved clarification.

---

## Decision 7 — No scoring / summary / history changes

**Decision**: A crawled trick is scored exactly like any other trick — its card points go to the winner's collected pile and flow through the unchanged feature 005 round scoring, summary, and final-results history. No `Scoring.js` formula, `buildSummary`, or history field changes.

**Rationale**: Crawl changes only *how* the first trick's cards are played and revealed, not *what* they are worth or *who* may win. Once `_resolveTrick` assigns the trick, downstream scoring is identical to a normal hand. Keeping scoring untouched (§III) also means none of feature 006's summary/history work needs revisiting.

**Alternatives considered**: A special "successful crawl" bonus/penalty — rejected: the spec defines no such thing; the declarer's only gain is hiding their lead.

---

## Decision 8 — Deterministic test seam: `no-ace-declarer` deck mode

**Decision**: Extend `Round._stackedDeckForTest` (the existing `THOUSAND_STACK_DECK` seam, inert in production) with a `no-ace-declarer` mode that places all four aces on the two non-declarer seats and keeps them out of the talon, so the intended declarer seat holds no ace through talon pickup and the exchange. The quickstart drives bidding so that seat declares.

**Rationale**: An ace-less declarer is rare; like the `four-nines` seam, a deterministic deck is the only practical way to exercise the crawl path in unit, integration, and live e2e tests. Reusing the same seam mechanism keeps the test surface consistent and production-inert (only active when `THOUSAND_STACK_DECK` is set).

**Alternatives considered**: Mocking `handHasAce` in tests — rejected for the integration/e2e layers: it would bypass the real eligibility wiring the tests exist to verify. Unit tests for `handHasAce` itself use plain hand fixtures, no deck seam.

---

## Resolved Technical Context

| Unknown | Resolution |
|---------|-----------|
| Where does eligibility live? | Pure `handHasAce` in `Scoring.js` (Decision 1). |
| Where does crawl state/resolution live? | `TrickPlay` sub-state, reusing `_resolveTrick` (Decision 2). |
| How are faces kept hidden? | `crawlCommits` off the public `currentTrick`; faces only in `crawl_revealed` (Decision 3, 5). |
| Message surface? | One `crawl_commit` in; `crawl_committed` + `crawl_revealed` out (Decision 4, 5). |
| Follow-suit handling? | Suspended for crawl trick only (Decision 6). |
| Scoring/summary impact? | None (Decision 7). |
| Four-nines interaction? | Reuse `fourNinesAckPending` guard; `crawlAvailable` false while gate open (plan R-204). |
| Deterministic testing? | `no-ace-declarer` deck seam (Decision 8). |
