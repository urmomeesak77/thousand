# Feature Specification: Sound Effects

**Feature Branch**: `011-sound-effects`  
**Created**: 2026-06-05  
**Status**: Draft  
**Input**: User description: "Lets add sound effects. all sound files are in src\public\sound folder. There has to be mute/unmute button right next to game info icon. Takin card, for each card moving: playing-card.mp3. Flipping card: flipcard.mp3. Shift of turn: turn.mp3"

## Clarifications

### Session 2026-06-05

- Q: When exactly should the turn sound (`turn.mp3`) play? → A: On every turn change — it fires whenever the active player changes for any seat, including in trick play where it layers on top of the card-handling sound after each card.
- Q: When several cards move or are revealed at the same instant (talon reveal, talon absorb, multi-card sell exposure), how many sound cues fire? → A: One cue per card — each card in a simultaneous batch fires its own cue, so the cues overlap (e.g., a 3-card talon reveal plays three flip sounds). The "single logical event" in FR-004 is one card movement / one card flip, not a whole batch.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hear feedback as cards move and turns change (Priority: P1)

A player at the card table hears short audio cues that reinforce what they see on screen: a card-handling sound whenever a card moves (being dealt, passed, taken from the talon, or played to a trick), a flip sound whenever a hidden card is turned face-up, and a distinct sound when the active turn passes to a player. These cues make the game feel responsive and help the player notice when it becomes their turn even if they glanced away.

**Why this priority**: The sound cues themselves are the core of the feature — without them there is nothing to mute. They deliver the primary value (a livelier, more responsive game) and can be demonstrated on their own.

**Independent Test**: Play through a round and confirm that each card movement produces the card-handling sound, each face-up flip produces the flip sound, and each change of the active turn produces the turn sound — with no missing or duplicated cues for the same event.

**Acceptance Scenarios**:

1. **Given** a round is being dealt, **When** each card is dealt to a hand or the talon, **Then** the card-handling sound plays for that card movement.
2. **Given** it is a player's turn to play to a trick, **When** they play a card and it travels to the centre, **Then** the card-handling sound plays.
3. **Given** the declarer passes a card to an opponent during the exchange, **When** that card moves to the opponent, **Then** the card-handling sound plays.
4. **Given** a face-down card becomes visible (talon reveal, crawl card turned up, or an exposed sell card), **When** the card turns face-up, **Then** the flip sound plays.
5. **Given** the active turn belongs to one player, **When** play advances and a different player becomes the active player, **Then** the turn sound plays once.

---

### User Story 2 - Mute and unmute all sound (Priority: P1)

A player who finds the sounds distracting — or who is in a quiet environment — clicks a mute control located immediately next to the existing game-info (rules) icon. While muted, no sound effects play. Clicking again unmutes and sounds resume. The control clearly shows whether sound is currently on or off.

**Why this priority**: The user explicitly required a mute/unmute control. It is essential for the feature to be acceptable to all players and is required to ship alongside the sounds.

**Independent Test**: Toggle the control and confirm that, while muted, no card/flip/turn sound plays for any triggering event, and that the control's appearance reflects the current state; unmute and confirm sounds resume.

**Acceptance Scenarios**:

1. **Given** sound is on, **When** the player clicks the mute control, **Then** the control switches to a muted state and no subsequent sound effects play.
2. **Given** sound is muted, **When** the player clicks the control again, **Then** the control switches to an unmuted state and subsequent triggering events play their sounds.
3. **Given** the game screen is shown, **When** the player looks at the top controls, **Then** the mute control appears directly adjacent to the game-info (rules) icon.

---

### User Story 3 - Mute preference is remembered (Priority: P2)

A player who mutes the game and later reloads, reconnects, or starts a new round does not have to mute again — their last choice is remembered for the device/browser they are using.

**Why this priority**: Convenience that meaningfully improves the experience but is not required for the core sound + mute capability to work. Can be added after P1.

**Independent Test**: Mute the game, reload the page, and confirm the game starts muted; unmute, reload, and confirm it starts with sound on.

**Acceptance Scenarios**:

1. **Given** the player muted the game, **When** they reload or return to the game later on the same browser, **Then** the game remains muted without further action.
2. **Given** the player has sound on, **When** they reload, **Then** the game starts with sound on.

---

### Edge Cases

- **Rapid/overlapping movements**: During the deal many cards move in quick succession. Each card movement still triggers its sound; overlapping playback is acceptable and must not block or delay the animation.
- **Browser autoplay restrictions**: Browsers may block audio until the player interacts with the page. The first sound may be silent if no interaction has occurred yet; once the player has interacted (e.g., clicked to enter or take an action) sounds play normally.
- **Mid-event mute**: If the player mutes while a sound is already playing, that already-playing sound may finish, but no new sounds start while muted.
- **Missing or failed audio file**: If a sound file cannot be loaded or played, the game continues normally without errors visible to the player.
- **Spectators / non-active viewers**: Players observing the table still hear card, flip, and turn cues for the events they can see.
- **Turn sound on round boundaries**: Starting a new round or phase that establishes a first active player produces a single turn cue, not a burst.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST play the card-handling sound (`playing-card.mp3`) once for each individual card movement, including dealing, passing during the card exchange, taking talon cards, and playing a card to a trick.
- **FR-002**: The system MUST play the flip sound (`flipcard.mp3`) once each time a previously hidden card is turned face-up (e.g., talon reveal, crawl card turned up, exposed sell cards).
- **FR-003**: The system MUST play the turn sound (`turn.mp3`) once each time the active player changes for any seat — not only when the turn lands on the viewing player. During trick play this fires after each card is played and is allowed to layer over the card-handling sound.
- **FR-004**: The system MUST play exactly one sound per logical event, where the logical unit is a single card movement, a single card flip, or a single turn change — it MUST NOT play the same cue twice for the same individual card/flip/turn. When multiple cards move or flip at the same instant (e.g., a 3-card talon reveal), each card is its own logical event and fires its own cue; the resulting cues may overlap.
- **FR-005**: The system MUST provide a mute/unmute control on the game screen located immediately adjacent to the existing game-info (rules) icon.
- **FR-006**: The mute control MUST visually indicate the current state (sound on vs. muted) so the player can tell at a glance.
- **FR-007**: While muted, the system MUST NOT start any sound effect for any triggering event.
- **FR-008**: Toggling the control MUST take effect immediately for all subsequent triggering events.
- **FR-009**: The system MUST remember the player's mute preference across page reloads and reconnects on the same browser/device, defaulting to sound on for first-time players.
- **FR-010**: Sound playback failures or missing audio assets MUST NOT interrupt gameplay or surface errors to the player.
- **FR-011**: Sound effects MUST NOT delay, block, or degrade the corresponding visual animations or game responsiveness.
- **FR-012**: The mute control MUST be reachable and operable for players who can see and use the existing game-info icon (keyboard/screen-reader accessible label consistent with that icon).

### Key Entities *(include if data involved)*

- **Sound cue**: A short audio effect tied to a specific game event type — card movement, card flip, or turn change — sourced from a named file in the sound asset folder.
- **Mute preference**: A single on/off setting per browser/device indicating whether sound effects are silenced; persists across sessions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a complete round, 100% of card movements, face-up flips, and turn changes produce their corresponding sound when unmuted, with zero duplicated cues for the same event.
- **SC-002**: When muted, 0 sound effects play across an entire round regardless of how many card movements, flips, or turn changes occur.
- **SC-003**: A player can locate and toggle the mute control in under 5 seconds, and the change takes effect on the very next triggering event.
- **SC-004**: After muting and reloading, the game starts muted in at least 99% of reloads on the same browser.
- **SC-005**: Enabling sound introduces no perceptible delay (no added lag beyond existing animation timing) to card movements or turn changes.

## Assumptions

- Sound effects are scoped to the in-game table experience (dealing, exchange, sell exposure, trick play, turn changes); the lobby and waiting room are out of scope.
- "Game info icon" refers to the existing rules/info icon in the top scoreboard controls; the mute control sits next to it there.
- The mute preference is stored per browser/device (consistent with how the app already keeps client-side identity/preferences), not synced to a server account.
- Default state for a new player is unmuted (sound on).
- "For each card moving" includes the rapid deal animation; each dealt card triggers the card-handling sound, and overlapping playback during the deal is acceptable.
- A "flip" means a card transitioning from face-down/hidden to face-up and visible to the viewer; cards already visible do not re-trigger the flip sound.
- The three provided files (`playing-card.mp3`, `flipcard.mp3`, `turn.mp3`) in `src/public/sound/` are the complete sound set; no additional sounds are required.
- A single global volume level (the files' inherent loudness) is used; per-sound volume controls are out of scope.
