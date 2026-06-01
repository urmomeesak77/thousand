# Feature Specification: 4-Player Variant with Extended Deck

**Feature Branch**: `008-four-player-variant`
**Created**: 2026-06-01
**Status**: Draft
**Input**: User description: "lets create 4 players version. add 7s and 8s to game (both value is 0 points). We will not implement 2 players version, so remove any logic or comments regarding it"

## Clarifications

### Session 2026-06-01

- Q: In a 4-player game, when two or more players are tied at the maximum cumulative score (≥1000) and the most recent declarer is not among the tied set, what tie-break order decides the winner? → A: Declarer first if tied; otherwise clockwise from the dealer — P1 → P2 → P3 → Dealer (dealer lowest priority), the direct generalization of the existing 3-player rule.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Play a complete 4-player game (Priority: P1)

Four people join one room and play a full game of Thousand to victory using an extended
32-card deck. Each player is dealt 7 cards with a 4-card talon; the bidding winner picks
up the talon, passes one card to each of the three opponents, and all four players hold
8 cards for an 8-trick round. Scoring, special penalties, and victory at 1000 work for
all four seats.

**Why this priority**: This is the core new value — the entire point of the feature is
that four people can play together. Without it, nothing else matters.

**Independent Test**: Create a 4-player room, have four clients join, and play a full
round (bid → sell → talon pickup → exchange → 8 tricks → round summary) and a full game
to ≥1000. Verify hand sizes (7→8), talon size (4), trick width (4 cards), and that the
final scoreboard lists all four players.

**Acceptance Scenarios**:

1. **Given** a new 4-player room with four players joined, **When** the round deals,
   **Then** each player holds 7 cards, the talon holds 4 cards, and the 32-card deck
   contains every rank 7, 8, 9, 10, J, Q, K, A in all four suits.
2. **Given** bidding completes with a declarer, **When** the declarer picks up the
   4-card talon, **Then** they hold 11 cards and must pass exactly one card to each of
   the three opponents, leaving every player with 8 cards.
3. **Given** trick play begins, **When** all eight tricks are played, **Then** each
   trick contains four cards (one per player) and 32 cards total are collected.
4. **Given** a 7 or 8 is played, **When** the trick is resolved, **Then** the 7/8
   contributes 0 card points and never beats a 9 or higher of the same suit.
5. **Given** cumulative play, **When** any player reaches ≥1000, **Then** the game ends
   and final results rank all four players.

---

### User Story 2 - Existing 3-player games are unaffected (Priority: P2)

Players can still create and play 3-player games exactly as before: 24-card deck (9–A),
7 cards + 3-card talon, declarer passes one card to each of two opponents, 8 tricks of
three cards, identical scoring.

**Why this priority**: The feature must not regress the shipped 3-player game. Existing
behavior is a hard constraint.

**Independent Test**: Run the full existing 3-player test suite; create and play a
3-player game end-to-end and confirm deck size (24), talon (3), trick width (3), and
scoring match current behavior.

**Acceptance Scenarios**:

1. **Given** a 3-player room, **When** the round deals, **Then** the deck is 24 cards
   (no 7s/8s) and behavior is identical to today.
2. **Given** any existing 3-player automated test, **When** the suite runs, **Then** it
   passes without modification of its expectations.

---

### User Story 3 - Choose player count when creating a game (Priority: P3)

When creating a game, a player chooses whether it is a 3- or 4-player game. The lobby
and waiting room show the correct required count and progress (e.g., "2 / 4 joined").

**Why this priority**: Needed UX to reach a 4-player game, but trivial relative to the
gameplay engine; can be demonstrated with the creation/lobby flow alone.

**Independent Test**: Open the new-game modal, create a 4-player game, and verify the
waiting room shows "(4 needed to start)" and starts only when the 4th player joins.

**Acceptance Scenarios**:

1. **Given** the new-game modal, **When** a player selects 4 players and creates,
   **Then** the room requires four players to start.
2. **Given** a 4-player room with three players, **When** a fourth joins, **Then** the
   game starts; with only three, it stays in the waiting room.

---

### Edge Cases

- **Forced declarer**: In 4-player bidding, when three players pass, the fourth becomes
  the declarer at the minimum bid (generalization of today's "two passed" rule).
- **Simultaneous victory**: Two or more of the four players cross 1000 in the same
  round → resolved by the existing tiebreaker, generalized to four seats.
- **Four-nines / crawl** (features 006/007): the "all four 9s in one hand" bonus and the
  crawl mechanic must work with four 8-card hands; the four-nines acknowledgment gate
  must wait for all four active players.
- **Disconnect/reconnect**: a snapshot for a 4-seat table must rebuild correctly for
  every viewer seat.
- **Talon exposure during sell** must show all four-player seat geometry correctly.

## Requirements *(mandatory)*

### Functional Requirements

**Player count & lobby**

- **FR-001**: System MUST allow creating a game configured for either 3 or 4 players.
- **FR-002**: System MUST reject any required-player count other than 3 or 4.
- **FR-003**: System MUST start a game only once the configured number of players have
  joined, and the waiting room MUST display the configured required count and current
  join progress.
- **FR-004**: System MUST NOT offer or accept a 2-player game, and MUST remove or update
  code comments and spec notes that describe 3-player as the only supported count or
  4-player as a "future feature."

**Deck & cards**

- **FR-005**: 4-player games MUST use a 32-card deck containing ranks 7, 8, 9, 10, J, Q,
  K, A in all four suits.
- **FR-006**: 3-player games MUST continue to use the 24-card deck (ranks 9, 10, J, Q,
  K, A).
- **FR-007**: The 7 and the 8 MUST each be worth 0 card points (like the 9).
- **FR-008**: In trick resolution, the 7 and 8 MUST rank below the 9 (lowest to highest:
  7, 8, 9, J, Q, K, 10, A), so they can never win a trick over any higher card of the
  led/trump suit.

**Deal, talon & exchange**

- **FR-009**: In 4-player, the deal MUST give each player 7 cards and place 4 cards in
  the talon; in 3-player, 7 cards each and 3 in the talon (unchanged).
- **FR-010**: The declarer MUST pick up the entire talon (4 cards in 4-player, 3 in
  3-player) before the exchange.
- **FR-011**: During the exchange the declarer MUST pass exactly one card to each
  opponent (3 cards in 4-player, 2 in 3-player), after which every player holds 8 cards.

**Round flow, turn order & scoring**

- **FR-012**: Turn rotation, dealer rotation, bidding-pass progression, and sell-phase
  opponent cycling MUST operate over the actual number of seats (3 or 4), with the last
  un-passed bidder forced to declare.
- **FR-013**: Each round MUST consist of 8 tricks; each trick MUST contain exactly one
  card per active player (4 in 4-player, 3 in 3-player).
- **FR-014**: Follow-suit, trump, and marriage rules MUST apply unchanged in both modes.
- **FR-015**: Round scoring, deltas (made/missed vs. bid), marriage bonuses, barrel and
  three-consecutive-zero penalties, cumulative carry-over, and victory at ≥1000 MUST be
  computed for every seat in the game (3 or 4).
- **FR-016**: Winner determination and tie-breaking MUST generalize to the actual number
  of seats. When two or more players are tied at the maximum cumulative score (≥1000):
  the most recent round's declarer wins if among the tied set; otherwise the winner is
  the highest-priority tied seat in clockwise order from the dealer — P1, P2, P3, then
  Dealer (dealer lowest priority) — which reduces to the existing P1 → P2 → Dealer rule
  in 3-player games.
- **FR-017**: Special features from prior work — the four-nines bonus and the crawl
  mechanic — MUST function in 4-player, including waiting for acknowledgment from all
  active players where applicable.

**Frontend presentation**

- **FR-018**: A 4-player game screen MUST present the local player plus three opponents
  in distinct seat positions, and the trick-centre MUST display up to four played cards.
- **FR-019**: The scoreboard and final-results views MUST list all players in the game
  (3 or 4).
- **FR-020**: User-facing text (subtitle, waiting hints) MUST reflect the configured
  player count rather than a fixed "3 players."

### Key Entities

- **Game**: a session across rounds; now carries a configured player count (3 or 4) that
  selects the deck variant and seat count, plus cumulative scores / barrel / zero state
  per seat.
- **Deck variant**: 24-card (3-player) or 32-card (4-player) set of cards.
- **Card**: rank (now possibly 7 or 8) + suit; carries a point value (0 for 7/8/9) and a
  trick-rank order.
- **Talon**: face-down cards set aside at deal (3 or 4 cards), claimed by the declarer.
- **Round / Seat**: per-round state for each active seat (hand, collected tricks).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Four players can create a room and complete a full game to a ≥1000 victory
  without the round ever stalling.
- **SC-002**: A 4-player round deals 7 cards to each player and a 4-card talon; after
  pickup and exchange every player holds 8 cards; 8 tricks of 4 cards are played.
- **SC-003**: 7s and 8s contribute 0 points and never win a trick over a 9-or-higher of
  the same suit, in 100% of resolutions.
- **SC-004**: All existing 3-player automated tests pass unchanged, and a 3-player game
  plays identically to the current release (24-card deck, 3-card talon, 3-card tricks).
- **SC-005**: At game creation a player can select 3 or 4 players, and the room starts
  only when exactly that many have joined.

## Assumptions

- 7s and 8s are part of the **4-player deck only**; the 3-player deck stays at 24 cards,
  because 32 cards do not divide evenly among 3 players.
- Trick rank order places 7 below 8 below 9 (both new ranks lowest); both worth 0 points.
- The declarer claims the entire talon and reduces to 8 cards by passing one card to each
  opponent (the existing 3-player exchange, generalized).
- No 2-player mode exists today and none will be added; "removing 2-player logic" means
  clearing outdated comments/notes that restricted the game to 3 players or labeled
  4-player as future work.
- Marriage bonuses, trump rules, barrel/zero penalties, and the 1000-point victory
  threshold are unchanged for both modes.
