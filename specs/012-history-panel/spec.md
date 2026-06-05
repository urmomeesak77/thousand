# Feature Specification: Game History Panel

**Feature Branch**: `012-history-panel`  
**Created**: 2026-06-05  
**Status**: Draft  
**Input**: User description: "On bottom left corner. add history box there. collapsible. visible last 10 actions, if there are more then add scrollbar. show info who won a trick, who bet how much, how many points any player scored last round etc."

## Clarifications

### Session 2026-06-05

- Q: How should the history be sourced so reconnecting players see a coherent log? → A: Server-authoritative — the server records each event and includes the history log in game state/snapshots; all players (incl. reconnects & late joiners) see the same complete log.
- Q: How many history entries are retained over a game? → A: Full game, uncapped — every event of every round is retained and remains scrollable for the entire game session.
- Q: What is the panel's default state on entering the game screen? → A: Responsive — expanded by default on larger screens, collapsed by default on small/narrow screens; the player can override either way.
- Q: How are entries ordered and where do new ones appear? → A: Newest at bottom (chat-style) — entries append in chronological order and the view auto-scrolls to the bottom to reveal the latest entry.
- Q: Does the collapse/expand choice persist across reload/reconnect? → A: Persist in browser — the choice is remembered across reloads/reconnects; the responsive default applies only when no stored choice exists.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Follow the flow of the current game (Priority: P1)

A player in an active game wants to glance at a running log of what just happened — who won the last trick, who bid what during the auction, who declared a marriage — without having to remember every action or ask other players. A history box sits in the bottom-left corner of the game screen and lists recent game events in chronological order, newest activity easy to find, so the player can stay oriented at any moment of the round.

**Why this priority**: This is the core value of the feature — a single always-available place to read back what happened. Without it the feature delivers nothing. It is independently testable and useful even if no other story ships.

**Independent Test**: Open a game, perform a sequence of actions (bids, a marriage declaration, several tricks), and confirm each action appears as a readable line in the history box in the order it occurred.

**Acceptance Scenarios**:

1. **Given** a game in the auction phase, **When** a player places a bid, **Then** a new history entry appears naming the player and the amount bid.
2. **Given** a game in trick play, **When** a trick is completed, **Then** a new history entry appears naming the player who won the trick.
3. **Given** several actions have occurred, **When** the player reads the history box, **Then** the entries are shown in the order the actions happened.
4. **Given** a round has just ended, **When** the player reads the history box, **Then** an entry shows how many points each player scored that round.

### User Story 2 - Keep the history box out of the way (Priority: P2)

A player who wants to focus on the cards rather than the log can collapse the history box so it takes minimal screen space, then expand it again when they want to review events. The box defaults to a state that does not obscure gameplay.

**Why this priority**: The card table is the primary surface; a permanently expanded panel in the corner risks covering cards or controls. Collapsibility makes the feature non-intrusive, but the feature is still usable without it (P1 delivers the log itself).

**Independent Test**: With the history box present, toggle it collapsed and confirm it shrinks to a compact handle/label; toggle it expanded and confirm the entries are visible again. Reload the page and confirm the chosen state is restored.

**Acceptance Scenarios**:

1. **Given** an expanded history box, **When** the player activates the collapse control, **Then** the entry list hides and only a compact handle/label remains.
2. **Given** a collapsed history box, **When** the player activates the expand control, **Then** the entry list becomes visible again with all current entries.
3. **Given** the player has set a collapsed/expanded state, **When** new events occur, **Then** the box stays in the state the player chose.

### User Story 3 - Review a long history without losing the screen (Priority: P3)

In a long round many events accumulate. The player wants to see the most recent activity at a glance but still be able to scroll back through earlier entries, all within a fixed-size box that never grows to push other UI off-screen.

**Why this priority**: Bounded size with scrollback is a refinement on top of the basic log. The feature is valuable with just recent entries (P1); this story protects the layout and enables deeper review.

**Independent Test**: Generate more events than fit in the box's visible area, confirm the box does not grow beyond its fixed height, that the most recent entries are visible by default, and that a scrollbar appears allowing access to older entries.

**Acceptance Scenarios**:

1. **Given** ten or fewer recorded events, **When** the player views the expanded box, **Then** all events are visible without a scrollbar.
2. **Given** more than ten recorded events, **When** the player views the expanded box, **Then** the box shows the most recent events at its default scroll position and presents a scrollbar to reach older events.
3. **Given** many recorded events, **When** new events are added, **Then** the box's outer dimensions stay fixed and surrounding UI is not displaced.

### Edge Cases

- **Empty history**: At the very start of a round before any action, the box shows an empty state (e.g. a "no activity yet" hint) rather than a blank or broken panel.
- **Round boundary**: When a new round begins, the panel makes clear which entries belong to the new round versus the previous round (e.g. the previous round's scoring summary remains readable as the last entry of that round). Whether older rounds' entries remain or are cleared is defined in Assumptions.
- **Reconnect / page reload**: A player who reconnects mid-game sees a coherent history rather than a permanently empty box (see Assumptions for the recovery boundary).
- **Unknown name**: Entries reference players by their current display name; if a player's name is unknown the entry still renders with a stable seat reference.
- **3- and 4-player variants**: The log correctly attributes events across all active seats regardless of player count.
- **Rapid successive events** (e.g. a trick win immediately followed by round-end scoring): each distinct event produces its own ordered entry without dropping or reordering.
- **Overlap with corner UI**: The bottom-left placement does not permanently cover the player's hand, action controls, or other corner elements.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display a history panel anchored in the bottom-left corner of the game screen during an active game.
- **FR-002**: The history panel MUST record and display game events in the chronological order they occur.
- **FR-003**: The history panel MUST record auction bids, identifying the player and the amount bid.
- **FR-004**: The history panel MUST record pass actions during the auction, identifying the player who passed.
- **FR-005**: The history panel MUST record the completion of each trick, identifying the player who won the trick.
- **FR-006**: The history panel MUST record marriage declarations, identifying the player and the suit of the declared marriage.
- **FR-007**: The history panel MUST record the end-of-round scoring outcome, showing how many points each player scored in the round just completed.
- **FR-008**: The history panel MUST record notable special scoring events when they occur (e.g. the four-nines bonus, a player going "on the barrel", and barrel/zero penalties).
- **FR-009**: The history panel MUST be collapsible and expandable by the player via an on-screen control.
- **FR-010**: The history panel MUST remember the player's chosen collapsed/expanded state in the player's browser and restore it across page reloads and reconnects.
- **FR-010a**: When no stored choice exists, the history panel's initial state MUST be responsive: expanded on larger screens and collapsed on small/narrow screens.
- **FR-011**: When expanded, the history panel MUST show at least the most recent 10 entries without requiring scrolling.
- **FR-012**: When more entries exist than fit the visible area, the history panel MUST present a scrollbar that lets the player reach older entries.
- **FR-013**: The history panel MUST maintain fixed outer dimensions as entries accumulate, so that adding entries never displaces or covers other essential game-screen UI.
- **FR-014**: The history panel MUST order entries chronologically with the newest at the bottom (chat-style), and when expanded MUST auto-scroll to the bottom as new entries arrive so the latest activity is always revealed.
- **FR-015**: The history panel MUST show a clear empty state when no events have yet been recorded.
- **FR-016**: Each history entry MUST identify the relevant player(s) by their display name (or a stable seat reference when no name is available).
- **FR-017**: The history panel MUST attribute events correctly across all seats in both the 3-player and 4-player variants.
- **FR-018**: The system MUST record history events server-side as the single source of truth and include the history log in the game state shared with players, so every player — including those who reconnect or join late — sees the same complete log.
- **FR-019**: The system MUST retain every recorded event for the entire game session without dropping older entries; all retained entries MUST remain reachable via the panel's scrollbar.

### Key Entities *(include if feature involves data)*

- **History Entry**: A single recorded game event. Key attributes: the kind of event (bid, pass, trick win, marriage, round score, special scoring), the player(s) involved, an associated value where relevant (bid amount, trick number, points), and an ordering position so entries display chronologically.
- **History Log**: The server-authoritative, ordered collection of History Entries for the whole game session (uncapped), shared with every player via game state.
- **View Preference**: The player's collapsed/expanded choice, remembered in the player's browser and restored across reloads/reconnects; falls back to a responsive default when unset.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After any logged action occurs, the corresponding entry is visible in the (expanded) history panel within 1 second.
- **SC-002**: A player can identify who won the most recent trick using only the history panel, without consulting any other part of the screen, in 100% of completed tricks.
- **SC-003**: A player can read every player's score from the most recently completed round in the history panel for 100% of completed rounds.
- **SC-004**: The history panel never grows beyond its fixed footprint; with 50+ accumulated entries the surrounding game-screen UI remains fully visible and usable.
- **SC-005**: At least the 10 most recent entries are readable at once when the panel is expanded, with older entries reachable by scrolling.
- **SC-006**: Collapsing or expanding the panel takes a single action and the panel reflects the new state immediately (within 1 second).
- **SC-007**: In a usability check, players can locate and interpret a target past event (a specific bid or trick win) using the panel in under 10 seconds.

## Assumptions

- **Scope of the log**: History accumulates across all rounds of a single game session with no cap — every event of every round is retained and remains reachable via the scrollbar for the whole game (so "points scored last round" and all earlier activity stay visible). When a new game begins the log starts empty. Entries are not persisted to durable storage beyond the live game session.
- **Recovery boundary**: Because history is server-authoritative (see Clarifications / FR-018), a reconnecting or reloading player receives the full current log from the shared game state — the panel is restored to the same content all other players see, not merely a best-effort partial.
- **Default state**: The panel's initial state is responsive — expanded by default on larger screens (where it fits without covering the hand or controls) and collapsed by default on small/narrow screens. The player can override the state at any time (FR-010).
- **"Last 10 actions"** is interpreted as: at least the 10 most recent entries are visible without scrolling when expanded; the panel may retain more than 10 entries internally and expose them via the scrollbar.
- **Event vocabulary**: The "etc." in the request is taken to cover the natural set of round events already modeled by the game — bids, passes, marriage declarations, trick wins, round scoring, and special scoring (four-nines bonus, barrel, three-zeros). Per-card-play move logging (every individual card laid in a trick) is out of scope for the initial version; only trick outcomes are logged.
- **Existing screen reuse**: The feature integrates into the existing in-round game screen and reuses the existing player/seat naming already shown elsewhere in the UI.
- **Localization/styling**: Entry wording follows the existing UI's language and visual theme; no new theming system is introduced.
- **Out of scope for v1**: Filtering/searching entries, exporting the history, and a full move-by-move replay are not included.
