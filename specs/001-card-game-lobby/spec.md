# Feature Specification: Card Game 1000 — Lobby & Game Creation

**Feature Branch**: `001-card-game-lobby`
**Created**: 2026-04-14
**Status**: Implemented
**Input**: User description: "I want to create a card game 1000. it should start with lobby where user can join some random new game, or create new game to play with friends (invite only)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Join a Random Game (Priority: P1)

A player opens the game and is taken to a lobby. From there they can see available open games and join one with a single action, instantly entering that game session.

**Why this priority**: This is the primary entry point for solo/casual players and the simplest path to gameplay. Without it, the product has no value.

**Independent Test**: A player visits the lobby, sees a listed open game, clicks Join, and is placed inside a live game session.

**Acceptance Scenarios**:

1. **Given** the player is on the lobby screen, **When** at least one open game exists, **Then** a list of joinable games is visible with player count and status.
2. **Given** the player clicks Join on an open game, **When** the game is not yet full, **Then** the player is placed in that game and the game screen appears.
3. **Given** the player clicks Join on an open game, **When** the game just became full, **Then** the player sees a "Game is full" message and returns to the lobby.

---

### User Story 2 — Create a Private Game and Invite Friends (Priority: P2)

A player creates a new invite-only game session, receives a shareable invite link or code, and shares it with friends. Only players with the invite code can join.

**Why this priority**: Enables the social play mode which is a core stated requirement. Depends on the lobby being in place (P1).

**Independent Test**: A host creates a game, shares the invite code with a second player, and the second player joins using only that code — no listing in the public lobby.

**Acceptance Scenarios**:

1. **Given** the player clicks "Create Game" in the lobby, **When** they confirm, **Then** a new private game is created and an invite code is displayed.
2. **Given** a private game is created, **When** the host shares the invite code, **Then** a second player can enter the code and join that exact game.
3. **Given** a private game exists, **When** a player tries to find it in the public lobby list, **Then** it does not appear — it is hidden from the public listing.
4. **Given** a private game is full, **When** a player tries to join via the invite code, **Then** they see a "Game is full" message.

---

### User Story 3 — Lobby State Awareness (Priority: P3)

The lobby updates in real time as games open, fill up, or become unavailable, so players always see accurate game availability without manual refresh.

**Why this priority**: Quality-of-life feature that prevents players from trying to join already-full games. Enhances experience but the product is viable without it.

**Independent Test**: Two browser sessions are open on the lobby. When one session creates a game, the other session sees it appear without refreshing.

**Acceptance Scenarios**:

1. **Given** a player is on the lobby, **When** a new public game is created by another player, **Then** it appears in the lobby list within 5 seconds without a page reload.
2. **Given** a player is on the lobby, **When** an open game becomes full, **Then** it is removed from the joinable list within 5 seconds.

---

### Edge Cases

- What happens when a player tries to join a game that was deleted or ended between browsing and clicking Join?
- What happens if the invite code is invalid or expired?
- What happens if the host leaves before any other player joins — does the game close?
- What happens when the lobby has no open games?
- Can the same player open the game in two tabs and join twice?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST present a lobby screen as the starting point of the application.
- **FR-002**: System MUST display a list of available public games in the lobby, showing each game's current player count and maximum capacity.
- **FR-003**: Players MUST be able to join a public game from the lobby with a single action.
- **FR-004**: System MUST prevent a player from joining a full game and display an appropriate message.
- **FR-005**: Players MUST be able to create a new private (invite-only) game from the lobby.
- **FR-006**: System MUST generate a unique invite code for each private game.
- **FR-007**: Players MUST be able to join a private game by entering its invite code.
- **FR-008**: Private games MUST NOT appear in the public lobby listing.
- **FR-009**: Lobby game list MUST reflect real-time changes (new games, filled games) without requiring manual page refresh.
- **FR-010**: System MUST handle the case where a game closes or fills up between a player viewing it and attempting to join.

### Key Entities

- **Player**: A person in a game session; identified by a session (no account required assumed). Has a display name chosen at lobby entry.
- **Game**: A session of the card game 1000. Has a type (public/private), player list, capacity (typically 2–4 players), and status (waiting/in-progress/finished).
- **Invite Code**: A short unique code tied to a private game. Used to join without appearing in the public listing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player can go from opening the app to being seated in a game in under 60 seconds via the "Join Random" path.
- **SC-002**: A player can create a private game and share a working invite code in under 30 seconds.
- **SC-003**: The lobby list reflects new or closed games within 5 seconds of the change occurring.
- **SC-004**: 95% of join attempts succeed on the first try when a seat is available.
- **SC-005**: Private games are never visible in the public listing — 0% leak rate.

## Assumptions

- Players do not need a registered account; a temporary session identity (e.g., chosen nickname) is sufficient for v1.
- Game capacity is 2–4 players (standard for 1000 card game); exact number TBD at design time.
- Invite codes do not expire during an active waiting game session; they expire when the game starts or the host leaves.
- Only the game lobby and session entry are in scope for this feature — actual gameplay rules are a separate feature.
- The application is browser-based and accessed from a single URL.
