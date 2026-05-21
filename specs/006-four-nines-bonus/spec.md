# Feature Specification: Four Nines Bonus

**Feature Branch**: `006-four-nines-bonus`
**Created**: 2026-05-21
**Status**: Draft
**Input**: User description: "New feature. If any player has four 9s at the beginning of hand, he automatically gets 100 points"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Automatic Four-Nines Bonus (Priority: P1)

After bidding, selling, and the card exchange have all resolved, each player holds 8 cards and trick play is about to begin. There are exactly four 9s in the deck, so it is possible — though rare — for a single player to hold all four of them at this point. When trick play is about to start, the system checks each player's 8-card hand: if any player holds all four 9s, that player is immediately and automatically awarded a 100-point bonus added to their cumulative game score. No action is required from the player to claim it; the bonus is recognised by the system as trick play begins (after bidding and selling) and announced to everyone at the table. Trick play and round-end scoring then proceed completely normally. The bonus is independent of, and stacks on top of, whatever the player earns (or loses) during the hand itself.

**Why this priority**: This is the entire feature. Without it there is no four-nines bonus at all. It is a single, self-contained rule that delivers its full value the moment it can fire.

**Independent Test**: Drive a hand to the point where bidding, selling, and card exchange are complete and one player's 8-card hand contains 9♥, 9♦, 9♣, and 9♠. Observe that within 1 second of trick play being ready to begin, that player's cumulative score increases by exactly 100, all three clients see an announcement naming the player and the +100 bonus, and after all three acknowledge it the declarer leads trick 1 normally with all hands intact.

**Acceptance Scenarios**:

1. **Given** bidding, selling, and card exchange have resolved and exactly one player's 8-card hand holds all four 9s, **When** trick play is about to begin (before the first lead), **Then** that player's cumulative game score increases by exactly 100, and all three clients display an announcement identifying the player and the bonus (e.g., "{nickname} holds four nines: +100").
2. **Given** the four-nines bonus has just been awarded, **When** all three players have acknowledged the blocking announcement, **Then** trick play proceeds (the declarer leads trick 1); every player retains their full 8-card hand; no card is removed or altered as a result of the bonus. The first lead MUST NOT be accepted until all three acknowledgments are recorded.
3. **Given** trick play is about to begin and no single player's hand holds all four 9s (e.g., the 9s are split across hands, or one was left in the talon / passed away in the exchange), **When** the first trick would start, **Then** no bonus is awarded and no announcement appears; trick play begins normally.
4. **Given** the four-nines bonus was awarded at the start of trick play, **When** the round ends and scoring is applied, **Then** the player's round delta is computed by the normal rules and applied **on top of** the already-banked +100 (the bonus is not re-applied, double-counted, or reversed).

---

### User Story 2 — Bonus Is Visible in Round Summary and Game History (Priority: P2)

A player (and the other two at the table) can see, after the round and at game end, that the four-nines bonus was awarded and to whom. The round summary lists the +100 as a distinct line item for the player who received it, separate from their trick points, marriage bonuses, and made/missed bid result. The end-of-game per-round history likewise reflects the bonus on the relevant round's row so the final scores are fully auditable.

**Why this priority**: The award itself (US1) is the functional core; surfacing it in the summary and history makes the cumulative totals explainable and trustworthy, but the game is rule-correct without it. P2 because it builds directly on the existing round-summary and final-results view-models from feature 005.

**Independent Test**: Play a hand in which one player was awarded the four-nines bonus. At the round summary, confirm that player's row shows a distinct "Four nines: +100" line item alongside their normal round figures. At game end, confirm the per-round history row for that round reflects the +100 in the affected player's running cumulative.

**Acceptance Scenarios**:

1. **Given** a player was awarded the four-nines bonus this hand, **When** the round summary appears, **Then** that player's row shows the +100 as a distinct, labelled line item separate from trick points, marriage bonuses, and the made/missed delta.
2. **Given** the game ends after one or more hands in which a four-nines bonus was awarded, **When** the final-results history table is shown, **Then** the +100 is reflected in the affected player's running cumulative total for that round (visible as an annotation or distinct contribution on that round's row).

---

### Edge Cases

- **The bonus lifts the player into the barrel range [880, 1000)**: the bonus is applied at the start of trick play — **after** this hand's bidding and selling — so the 120 bid floor (feature 005 FR-022) does **not** apply to this hand (bidding is already over). The barrel indicator updates to reflect the post-bonus cumulative, and the hand is **not** exempt from barrel-round counting: if the player ends the round on barrel, this hand counts as an on-barrel round per the normal round-boundary rules (feature 005 FR-021/FR-023). The 120 floor would apply to the player's *subsequent* hands while they remain on barrel.
- **The bonus brings the player's cumulative score to 1000+**: the victory condition continues to be evaluated at round-end scoring (feature 005 FR-017), not mid-hand. The hand is played out normally; the player's already-banked +100 is included in the cumulative used for the round-end victory check. (This follows the chosen "award then play on" behaviour — see Assumptions.)
- **No single player's hand holds all four 9s at trick-play start (the 9s are split, one was left in the talon, or one was passed away in the card exchange)**: no bonus, no announcement; the hand is entirely normal. Note the declarer's hand at trick-play start reflects the talon pickup and the two cards passed away, so a declarer can gain or lose a fourth 9 relative to the original deal.
- **The four-nines player is the declarer vs. an opponent**: makes no difference — the bonus is independent of bidding role and is awarded on whichever player's trick-start hand holds all four 9s.
- **The four-nines player goes on to lose their bid that hand**: the made/missed delta is applied normally; the +100 remains banked (the bonus and the round delta are independent).
- **Two players each holding four 9s**: impossible — only four 9s exist in the deck, so at most one player can ever trigger the bonus in a hand.
- **A player disconnects after the bonus is awarded but before acknowledging the modal**: the acknowledgment gate (FR-003) holds the first trick lead and waits on that player; their grace period applies per features 004/005. If they had already pressed acknowledge before disconnecting, the press is sticky and counts toward the all-three condition. Grace expiry mid-gate aborts the round per the existing disconnect posture. On reconnect within grace, the player's cumulative already reflects the +100 and the pending modal is restored per FR-010.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After a hand's bidding, selling, declarer decision, and card exchange have all resolved — i.e., immediately before the first trick is led — the server MUST inspect each player's current 8-card hand to determine whether any single player holds all four 9s (9♥, 9♦, 9♣, 9♠). The check MUST use the trick-play-start hand (post-talon-pickup, post-exchange), not the originally dealt 7-card hand.
- **FR-002**: If exactly one player holds all four 9s at trick-play start, the server MUST award that player a bonus of exactly **100 points**, added to their **cumulative game score** (the persists-across-rounds total used for barrel and victory checks per feature 005). The bonus MUST be applied before the first trick is led.
- **FR-003**: The four-nines award MUST be announced to all three clients via a **blocking modal** that identifies the receiving player (nickname) and the bonus amount (+100). Each of the three players MUST explicitly acknowledge (dismiss) the modal, and the server MUST gate the **first trick lead** until all three acknowledgments are recorded. The modal's acknowledge action is the only operable control while it is showing. Awarding the bonus inherently and acceptably reveals that the named player holds the four 9s, consistent with how a declared marriage reveals held cards.
- **FR-004**: After the bonus is awarded, the hand MUST proceed completely normally: trick play and round-end scoring occur per features 004 and 005. The bonus MUST NOT abort the hand, trigger a re-deal, or remove/alter any card in any hand.
- **FR-005**: The four-nines bonus MUST be applied **once** per occurrence (once for the hand in which it is detected, at trick-play start). It MUST NOT be re-evaluated, re-applied, or reversed during or after that hand.
- **FR-006**: Because the bonus is applied at trick-play start — **after** this hand's bidding and selling — the 120 barrel bid floor (feature 005 FR-022) MUST NOT be retroactively applied to this hand. The barrel indicator (feature 005 FR-018) MUST update to reflect the post-bonus cumulative. The hand is **not** exempt from barrel-round counting: if the post-bonus, post-round-scoring cumulative leaves the player on barrel, this hand counts as an on-barrel round under the normal round-boundary rules (feature 005 FR-021/FR-023). The 120 floor applies to the player's subsequent hands while they remain on barrel.
- **FR-007**: The **victory condition MUST continue to be evaluated at round-end scoring** (feature 005 FR-017). A four-nines bonus that brings a player to 1000+ at trick-play start MUST NOT end the game before the hand is played; the already-banked +100 is included in the cumulative used for the normal round-end victory check.
- **FR-008**: The round summary (feature 005 FR-015) MUST show the four-nines bonus as a **distinct, labelled line item** (e.g., "Four nines: +100") on the receiving player's row, separate from trick points, marriage bonuses, and the made/missed round delta.
- **FR-009**: The final-results per-round history (feature 005 FR-017) MUST reflect the four-nines bonus in the affected player's running cumulative for the hand in which it was awarded (as a distinct contribution or annotation on that round's row).
- **FR-010**: The reconnect-rehydration snapshot (feature 005 FR-026 / feature 004 FR-027) MUST reflect the already-applied bonus: a player reconnecting after the award sees the updated cumulative scores and, if reconnecting while the acknowledgment gate is still open, the four-nines blocking modal in its pending state (with their own acknowledgment recorded as already-pressed if they had pressed it before disconnecting — the press is sticky, consistent with feature 005 FR-025's Continue-to-Next-Round handling).

### Key Entities

- **Round** (extended from feature 005): records whether a four-nines bonus was awarded this hand and to which player — a single optional entry `{ playerId, amount: 100 }`. Used to surface the line item in the round summary and to feed the per-round history.
- **Game** (from feature 005): the cumulative-score total each player carries across rounds is the score the +100 is added to; the bonus participates in barrel and victory evaluation through this total.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across 100 hands in which exactly one player's trick-play-start hand holds all four 9s, 100% of those players receive exactly +100 to their cumulative score, applied before the first trick is led, within 1 second of the card exchange completing.
- **SC-002**: Across 100 hands in which no single player's trick-play-start hand holds all four 9s, 0 bonuses are awarded and 0 announcements appear.
- **SC-003**: In 100% of hands where the bonus is awarded, the hand proceeds to normal completion (trick play through round-end scoring) with no re-deal, no removed cards, and no abort caused by the bonus.
- **SC-004**: In 100% of hands where the bonus is awarded, it appears as a distinct labelled line item on the receiving player's round-summary row and is reflected in that player's running cumulative on the final-results history row for that round.
- **SC-005**: When the bonus is awarded, 100% of clients display the four-nines announcement consistently and the updated cumulative scores within 1 second.

## Assumptions

- **Builds on features 004 and 005**: deal sequence (each player holds 7 cards before bidding, 3 cards in the talon), bidding/selling, trick play, round summary, final-results history, barrel state, and victory checks are all assumed implemented per features 004 and 005. This feature extends those flows; it does not redefine them.
- **Timing: the logic fires at trick-play start, not at the deal** (per clarification): although the feature description says "at the beginning of hand", the rule is evaluated and the bonus applied at the start of the first trick — after bidding, selling, and the card exchange. The condition is checked against the 8-card hand each player then holds (post-talon-pickup, post-exchange), so a declarer's eligibility reflects the talon and the two cards passed away.
- **"Award then play on" behaviour** (per clarification): the four-nines hand is **not** voided or re-dealt. The 100 is awarded and the hand is played out normally. (The alternative — abort and re-deal — was explicitly rejected.)
- **Bonus targets the cumulative game score** (per clarification): the +100 is added to the persists-across-rounds cumulative total, so it counts toward the 880 barrel threshold and the 1000 victory threshold — not merely the round score.
- **Victory is evaluated only at round end**: consistent with feature 005 FR-017, a bonus that reaches 1000+ at trick-play start does not end the game until the round's normal end-of-round victory check. This keeps the "play on" behaviour coherent with the existing architecture; it can be revisited if a mid-hand victory is later desired.
- **Barrel floor is not retroactive**: because the bonus lands after this hand's bidding, it cannot impose the 120 floor on a bid already made; the floor only affects the player's subsequent on-barrel hands. The four-nines hand still counts toward the 3-round barrel window (per clarification).
- **At most one trigger per hand**: there are exactly four 9s in the 24-card deck, so no more than one player can ever hold all four. No simultaneous-trigger handling is required.
- **Bonus detection is automatic and server-side**: the player does not claim the bonus; the server detects the four-nines hand and awards it. This matches the "automatically gets" wording in the feature description.
- **No turn timer / disconnect posture unchanged**: grace-period and reconnect handling follow features 004/005 without modification.

## Clarifications

### Session 2026-05-21

- Q: If the +100 brings a player to 1000+ when it is applied, does the game end immediately or play out? → A: Game continues; victory is checked only at round end (per feature 005 FR-017), with the +100 already banked into the cumulative used for that check. The hand is always played out fully. (Confirms FR-007.)
- Q: Is the four-nines announcement a non-blocking notice or a blocking acknowledgment? → A: A blocking modal that all three players must acknowledge before play continues; the server gates the next action on all three acknowledgments. (Updated FR-003, US1 AS-2, FR-010, and Edge Cases.)
- Q: When does the four-nines logic fire — at the deal, or later? → A: On the first trick, after the bidding and selling rounds (and after the card exchange). The bonus is applied at trick-play start, and the modal gates the first trick lead rather than the start of bidding. (Rewrote US1, Edge Cases, FR-001–FR-007, SC-001–SC-003, and Assumptions.)
- Q: Which hand is inspected for the four 9s — the dealt 7-card hand or the trick-start hand? → A: The 8-card hand each player holds at the start of trick 1 (post-talon-pickup, post-exchange). A declarer's eligibility therefore reflects the talon and the two cards passed away. (Encoded in FR-001 and US1.)
- Q: If the bonus newly places a player on barrel, does that hand count toward the 3-round barrel window? → A: Yes — no exemption; it counts as an on-barrel round under the standard feature 005 FR-021/FR-023 rules. The 120 bid floor is not retroactive to this hand's already-completed bidding. (Encoded in FR-006 and Edge Cases.)
