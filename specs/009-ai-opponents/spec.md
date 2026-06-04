# Feature Specification: AI Opponents (Bots)

**Feature Branch**: `009-ai-opponents`  
**Created**: 2026-06-04  
**Status**: Draft  
**Input**: User description: "AI opponents (bots) for the Thousand card game. Players can fill empty seats at a table with computer-controlled opponents so a game can start without a full set of humans. Bots participate in the full game loop — bidding/selling, card exchange, trick play with follow-suit/trump/marriages, and scoring — driven by server-side decision logic. Support 3- and 4-player variants. A bot should take its turn automatically after a short, natural delay. Host can add/remove bots in the waiting room before the game starts."

## Clarifications

### Session 2026-06-04

- Q: What bot difficulty should v1 support? → A: One shared strategy (no user-selectable difficulty), but each bot has a randomized aggressiveness trait that varies its bidding (see below).
- Q: Should a bot ever take over a human's seat mid-game (e.g., after disconnect)? → A: Out of scope for v1 — bots are waiting-room-only; existing disconnect/grace behaviour is untouched.
- Q: How long should a bot wait before acting on its turn? → A: A randomized delay of roughly 1–3 seconds per turn.
- Q: How should bots be named/identified? → A: Distinct themed bot names (e.g., "Robo-Ada") plus a clear "computer opponent" badge.
- Q: When is each bot's random aggressiveness assigned? → A: Once per bot when it is added; it persists for the whole game (a stable personality).
- Q: How much can aggressiveness swing a bid above the safe hand estimate? → A: Moderately — a bold bot bids up to roughly +20–30 over its safe makeable estimate, gambling on favourable talon cards.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fill empty seats to start a short-handed table (Priority: P1)

A host has created a table but does not have enough other humans present to begin. From the waiting room, the host adds one or more computer-controlled opponents to occupy the remaining empty seats, then starts the game. The game begins immediately with a mix of humans and bots, with no behavioural difference in how the round is dealt or played out.

**Why this priority**: This is the core value of the feature — it removes the "can't start without N humans" blocker that prevents solo or under-populated tables from ever playing. Without it, none of the other stories matter.

**Independent Test**: Create a table as the only human, add bots until the seat count for the chosen variant is reached, start the game, and confirm the round deals and the first turn proceeds. Delivers a playable game with a single human present.

**Acceptance Scenarios**:

1. **Given** a waiting room for a 3-player variant with 1 human seated, **When** the host adds 2 bots and starts, **Then** the game begins with 3 occupied seats and the deal proceeds normally.
2. **Given** a waiting room for a 4-player variant with 2 humans seated, **When** the host adds 2 bots and starts, **Then** the game begins with 4 occupied seats.
3. **Given** all seats are filled (by any mix of humans and bots), **When** the host attempts to add another bot, **Then** the action is rejected because there is no empty seat.

---

### User Story 2 - Bots play the full game loop autonomously (Priority: P2)

Once a game starts, each bot takes its own turns without any human input: it bids or passes during the auction, conducts the selling phase if it is the declarer, exchanges/distributes cards as required, plays cards during trick play while respecting follow-suit, trump, and marriage rules, declares marriages when advantageous, and its results are scored exactly as a human's would be. Bots make competent, rules-legal decisions and can carry a game through to its conclusion.

**Why this priority**: A bot that can sit at a seat but cannot actually play is useless. This story turns "a filled seat" into "a real opponent" and is what makes a short-handed game enjoyable rather than just startable.

**Independent Test**: Start a game with bots in every non-host seat and let it run; confirm the bots advance every phase (auction → exchange → trick play → scoring) without human intervention and that the round completes with valid scores.

**Acceptance Scenarios**:

1. **Given** it is a bot's turn to bid, **When** the natural delay elapses, **Then** the bot submits a legal bid or pass and the turn advances.
2. **Given** a bot is the declarer, **When** the selling/exchange phase begins, **Then** the bot completes its required card decisions and play continues.
3. **Given** it is a bot's turn during trick play, **When** the bot plays, **Then** the card played is always legal under follow-suit/trump rules.
4. **Given** a round ends, **When** scoring is applied, **Then** bot scores are computed identically to human scores and cumulative totals update.
5. **Given** a game reaches the victory threshold, **When** the final round completes, **Then** final results render with bots ranked alongside humans.
6. **Given** two bots with the same hand-strength but different aggressiveness, **When** they bid, **Then** the more aggressive bot bids higher (gambling on favourable talon cards) while the more cautious bot bids lower or passes — and a bot never bids beyond the moderate gamble cap above its safe estimate.

---

### User Story 3 - Manage bots in the waiting room (Priority: P3)

Before starting, the host can remove a previously added bot (e.g., if a late human arrives to take the seat) and can see at a glance which seats are bots versus humans. Bots are clearly labelled so no human mistakes a bot for another person.

**Why this priority**: Quality-of-life around composition. The game is playable without it (P1 + P2), but managing the table and clearly distinguishing bots prevents confusion and supports the common "a human showed up, swap the bot out" flow.

**Independent Test**: In a waiting room with at least one bot, remove the bot and confirm the seat becomes empty and available; confirm bot-occupied seats are visually/labelled distinctly from human seats.

**Acceptance Scenarios**:

1. **Given** a waiting room with a bot in a seat, **When** the host removes that bot, **Then** the seat becomes empty and a human may take it.
2. **Given** a waiting room with a mix of humans and bots, **When** any participant views the seat list, **Then** each bot seat is clearly identified as a computer opponent.
3. **Given** a non-host participant, **When** they view the waiting room, **Then** they cannot add or remove bots (only the host manages composition).

---

### Edge Cases

- What happens to an in-progress game if the **only** remaining human leaves and all other seats are bots? (Expected default: the game cannot continue without a human and is abandoned/cleaned up — bots do not play against an empty table.)
- What happens if a human **disconnects mid-game** at a table that also contains bots? (Out of scope for this feature — handled by existing disconnect/grace behaviour; bots do not auto-replace a disconnected human in v1.)
- What happens if the host tries to start with empty (neither human nor bot) seats remaining? (Start remains blocked until every seat for the chosen variant is occupied, same as today's full-table rule.)
- What happens to a bot's turn timer if the game is paused/blocked waiting on a human action? (The bot only acts when it is genuinely that bot's turn.)
- How are bots named when multiple bots share a table, to keep them individually distinguishable?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The host MUST be able to add a computer-controlled opponent (bot) to any empty seat from the waiting room before the game starts.
- **FR-002**: The host MUST be able to remove a previously added bot from a seat in the waiting room before the game starts, returning that seat to empty.
- **FR-003**: The system MUST reject adding a bot when no empty seat is available for the active variant (3 or 4 players).
- **FR-004**: The system MUST allow a game to start once every seat for the chosen variant is occupied by any mix of humans and bots, with at least one human present.
- **FR-005**: Only the host MUST be permitted to add or remove bots; other participants MUST NOT be able to change table composition.
- **FR-006**: Each bot MUST take all of its own turns automatically across every phase of play: auction (bid/pass), selling, card exchange/distribution, trick play, and any in-round acknowledgements required to advance.
- **FR-007**: Every action a bot takes MUST be legal under the same rules enforced for human players (follow-suit, trump, legal bid increments, marriage declaration eligibility, etc.).
- **FR-008**: Bot decisions MUST be competent enough to carry a game to completion without stalling, including playing makeable contracts and reaching the victory threshold.
- **FR-009**: A bot MUST take its turn only when it is genuinely that bot's turn, and MUST wait a randomized delay of roughly 1–3 seconds before acting (so play feels human and never instantaneous).
- **FR-010**: Bot results MUST be scored using the exact same scoring rules as humans, contributing to cumulative totals, barrel/zero special states, round history, and final results.
- **FR-011**: The system MUST support bots in both the 3-player and 4-player variants.
- **FR-012**: Bots MUST be visually/labelled as computer opponents wherever seats/players are shown (waiting room and in-game), so they are never mistaken for humans.
- **FR-013**: When multiple bots occupy the same table, each MUST be individually distinguishable via a distinct themed bot name (e.g., "Robo-Ada", "Robo-Max"), in addition to the shared computer-opponent badge from FR-012.
- **FR-014**: If no human remains at a table (e.g., the last human leaves), the system MUST NOT continue running the game with only bots; the game MUST be cleaned up consistent with the existing empty-table behaviour.
- **FR-015**: Bots MUST NOT count against or interfere with the existing per-human reconnect/disconnect grace handling for the human players at the table.
- **FR-016**: Each bot MUST be assigned a randomized aggressiveness trait when it is added, and that trait MUST persist for the whole game. During the auction the bot MUST factor this trait into how much it gambles on the hidden talon: a more aggressive bot bids higher in anticipation of favourable talon cards, a more cautious bot bids lower or passes.
- **FR-017**: A bot's bid MUST remain bounded — it never exceeds its safe hand-strength estimate by more than a moderate gamble margin (≈20–30 points), and it never exceeds the game's legal maximum bid. This keeps even the most aggressive bot from runaway overbidding while still allowing it to miss a gambled contract.

### Key Entities *(include if feature involves data)*

- **Bot Player**: A non-human participant occupying a seat. Has a display name and a clear "computer opponent" marker; otherwise participates in the round exactly as a seated player (holds a hand, bids, plays, accrues score). Created and removed by the host in the waiting room.
- **Table Composition**: The set of seats for the active variant and, for each, whether it is empty, occupied by a human, or occupied by a bot. Drives the start-eligibility rule (all seats filled, ≥1 human).
- **Bot Decision Policy**: The strategy that selects a bot's action for the current game state in each phase (bid value/pass, cards to keep/pass, marriage declarations, which legal card to play). Independent of any single seat so it can drive any number of bots.
- **Bot Aggressiveness Trait**: A per-bot value assigned once when the bot is added and held for the whole game. It scales the bot's willingness to gamble on the hidden talon during bidding — from cautious (bids at/below its safe estimate) to bold (bids up to the moderate gamble margin above it). It does not change which actions are legal, only the bid amount chosen among legal options.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A single human can start and complete a full game (to the victory threshold) with bots filling all other seats, with zero human input required for any bot turn.
- **SC-002**: 100% of bot actions across a completed game are rules-legal (no illegal card, bid, or out-of-turn action ever occurs).
- **SC-003**: Both the 3-player and 4-player variants can be played to completion with bots filling the non-human seats.
- **SC-004**: A host can add or remove a bot and see the table composition update within 1 second of the action.
- **SC-005**: In any waiting room or in-game player view, a participant can correctly identify which seats are bots and which are humans with no ambiguity.
- **SC-006**: A game with bots completes a full round (auction through scoring) without long stalls — each bot turn adds only a randomized ~1–3 second delay, never an indefinite wait.
- **SC-007**: Across repeated identical-hand bidding trials, bots show observable variation in bid amount attributable to their aggressiveness trait (more-aggressive bots bid higher on average), while no bot ever bids more than the moderate gamble margin above its safe estimate.

## Assumptions

- **One strategy, varied aggressiveness**: Bots share a single competent strategy (no user-selectable easy/medium/hard difficulty), but each bot carries a randomized aggressiveness trait that varies its bidding (FR-016/FR-017). Only bidding is varied by the trait in v1; trick-play/exchange/marriage decisions remain the shared strategy.
- **Aggressiveness model**: The trait is drawn uniformly at random when the bot is added and persists for the game. It maps to a gamble margin added on top of the safe makeable estimate (0 for the most cautious, up to ≈+20–30 for the most aggressive), rounded to the legal bid step and clamped to the legal bid range.
- **Bot strategy source**: The existing smart end-to-end test bot strategy (`tests/e2e-live-smart.js`) is the starting point and is promoted into a reusable, server-side decision policy rather than rewritten from scratch.
- **Server-authoritative**: Bot decisions are made server-side; the client only displays bot seats and their resulting actions. Bots require no browser/client to participate.
- **Waiting-room-only composition**: Adding/removing bots happens only before the game starts. Mid-game replacement of a disconnected human by a bot is out of scope for v1.
- **At least one human**: A table always has ≥1 human; bots never play purely against other bots in a live game (automated test harnesses excepted).
- **Reuses existing flow**: Bots reuse the existing round/scoring/variant engine and the existing waiting-room and start-game flows; no new game rules are introduced.
- **Persistence**: Server state remains in-memory (consistent with current architecture); bot table composition need not survive a server restart.
