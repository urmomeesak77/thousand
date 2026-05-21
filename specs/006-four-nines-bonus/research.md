# Phase 0 Research: Four Nines Bonus

No `NEEDS CLARIFICATION` markers remained after `/speckit-clarify` (Session 2026-05-21). This document records the design decisions that resolve *how* the spec's requirements map onto the existing feature-004/005 architecture.

---

## Decision 1 — Detection point: the `card-exchange → trick-play` transition

**Decision**: Run the four-nines check inside `Round.commitExchangePass`, in the branch where `exchangePassesCommitted === 2` (the moment `phase` flips to `trick-play`), reading `this.hands` (each player now holds 8 cards).

**Rationale**: The spec (FR-001, clarification) requires inspecting the **post-talon-pickup, post-exchange 8-card hand**, immediately before the first lead. This transition is the single existing point where all three hands are at their trick-start composition. No new lifecycle hook is needed.

**Alternatives considered**:
- *At deal completion* — rejected: that inspects the dealt 7-card hand, which misses talon/exchange effects on the declarer (R-101). The clarification explicitly moved the timing here.
- *On the first `play_card`* — rejected: the bonus must be applied and announced *before* the lead, and the lead is exactly what the ack-gate blocks.

## Decision 2 — Detection lives in `Scoring.js` as a pure helper

**Decision**: Add `handHoldsFourNines(handCardIds, deck)` (and/or a `findFourNinesSeat(hands, deck)`) to `Scoring.js` as a pure function returning the owning seat or `null`.

**Rationale**: It is stateless card-fact logic, identical in nature to the existing pure helpers in `Scoring.js` (card points, winner determination). §VII's carve-out allows function exports for stateless utilities; §VIII is satisfied because `Scoring.js` already exports pure functions (the `Deck.js`/`Scoring.js` precedent). Keeps `Round.js` (the §IX risk) thin.

**Alternatives considered**: A method on `Round` — rejected to avoid growing `Round.js` and to keep the rule unit-testable in isolation.

## Decision 3 — The +100 is a banked cumulative adjustment on `Game`, never a round delta

**Decision**: Add `Game.applyFourNinesBonus(seat)` which does `cumulativeScores[seat] += 100` and records the award for the history log. Call it from `RoundActionHandler` at the transition. It is **separate** from `roundDeltas` and from `Game.applyRoundEnd`.

**Rationale**: The spec (FR-002, AS-1, SC-001) requires the cumulative total to rise by exactly 100 **at trick-play start** — so the always-visible status bar / scoreboard (FR-018) shows it during the hand, not only at round end. At round end, `applyRoundEnd(roundDeltas)` adds the normal deltas on top of the already-banked +100. Keeping the bonus out of `roundDeltas` prevents double-counting (R-102) and keeps `Scoring.js`'s delta math untouched.

**Alternatives considered**:
- *Fold +100 into the declarer/opponent round delta* — rejected: it is not a trick/marriage/made-missed quantity, and folding it in would corrupt the made/missed comparison and the summary breakdown; it would also defer the cumulative bump to round end, violating SC-001.

## Decision 4 — Barrel/victory interaction: no mechanic changes; evaluation stays at round end

**Decision**: Do **not** change `Game.applyRoundEnd`'s barrel/zero/victory logic. The +100 is a plain cumulative bump; barrel `onBarrel` recompute and victory (FR-017 of 005) continue to run at round end against the post-bonus, post-delta cumulative.

**Rationale**:
- *Victory* (FR-007): evaluated only at round end per 005 FR-017. A bonus that reaches 1000+ at trick-play start does not end the game early — the hand plays out and victory fires at the normal check (the +100 is already in the total). This is exactly the "award then play on" clarification.
- *Barrel floor* (FR-006): the bonus lands **after** this hand's bidding, so the 120 floor cannot apply retroactively to a completed bid. It applies to the player's *subsequent* on-barrel hands.
- *Barrel-round counting nuance* (R-104): 005's `applyRoundEnd` advances `barrelRoundsUsed` only for players who were `onBarrel` entering the round (set at the previous round end), then recomputes `onBarrel`. Consequence: an **already-on-barrel** player who receives the bonus has this hand counted normally (matches Q3=A). A player who **newly enters** barrel via the bonus this round is not retroactively counted this round; counting begins the following round. We accept the existing mechanic rather than special-case the four-nines path. This is a minor refinement of FR-006's "counts as round 1 this hand" wording for the newly-entering case — flagged in the plan report.

**Alternatives considered**: Retroactively advancing the counter for a newly-entering bonus player in the same round — rejected: it would diverge from the uniform 005 barrel mechanic for marginal benefit and risk a counting regression (R-104 catastrophic-class).

## Decision 5 — Acknowledgment gate modelled on the `continue_to_next_round` sticky-press protocol

**Decision**: Add a small ack-gate to `Round`: `fourNinesAckPending` (boolean) + `fourNinesAcks` (Set of seats). The new `acknowledge_four_nines` client→server message records the sender's seat; when `fourNinesAcks.size === 3`, clear `fourNinesAckPending` and unlock the first lead. Presses are **sticky** across disconnects and the gate is reflected in the reconnect snapshot (FR-010). While pending, `play_card` is rejected.

**Rationale**: The spec (FR-003) requires a blocking modal all three players must acknowledge before the first lead, with sticky behaviour across disconnect — structurally identical to 005's `continue_to_next_round` between-rounds gate. Reusing that shape is the least-code option (§III) and inherits its tested disconnect semantics. FR-027's 250 ms throttle and FR-005's once-only guarantee make duplicate acks/awards no-ops.

**Alternatives considered**:
- *Non-blocking toast* — rejected by the clarification (Q2 chose a blocking modal).
- *Gate the start of bidding* — moot: bidding is already complete when the bonus fires; the gate is on the first trick lead.

## Decision 6 — Identity disclosure is intentional and bounded

**Decision**: The `four_nines_awarded` broadcast names the receiving player and the +100. This reveals that the player holds all four 9s. No other card identities are sent.

**Rationale**: FR-003 accepts this as analogous to a declared marriage (which reveals held K+Q). It is the single, deliberate exception to the FR-019 minimum-knowledge rule, scoped to the four 9s of the awarded player only.

---

## Summary of resolved unknowns

| Topic | Resolution |
|-------|-----------|
| When detection fires | At the second `exchange_pass` commit (phase → `trick-play`) — Decision 1 |
| Which hand is inspected | Post-exchange 8-card hand — Decision 1 / FR-001 |
| Where the rule lives | Pure helper in `Scoring.js` — Decision 2 |
| How +100 is applied | `Game.applyFourNinesBonus`, banked separately from `roundDeltas` — Decision 3 |
| Victory/barrel interaction | No mechanic change; evaluated at round end — Decision 4 |
| Announcement gate | Sticky 3-player ack-gate on `Round`, mirrors `continue_to_next_round` — Decision 5 |
| Identity leak | Intentional, bounded to the awarded player's four 9s — Decision 6 |
