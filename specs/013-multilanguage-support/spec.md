# Feature Specification: Multilanguage Support (English + Russian)

**Feature Branch**: `013-multilanguage-support`
**Created**: 2026-06-11
**Status**: Draft
**Input**: User description: "lets add multilanguage support. first language to add is russian. you should be able to change the language on the flow. autotranslanslate existing eng to rus"

## Clarifications

### Session 2026-06-11

- Q: Where does the language preference live — per browser or tied to server-side player identity? → A: Per-browser preference (like the existing mute preference); same player on a different device re-selects once.
- Q: What language does a first-time visitor (no stored preference) see? → A: Auto-detect the browser language — Russian browsers default to Russian, all others to English.
- Q: Does v1 include translating the full rules text (the largest single chunk of prose)? → A: Yes — rules content is fully translated in v1, same as all other text.
- Q: Are infrastructure/exception error messages (malformed message, internal server error, protocol failures) in scope for translation? → A: No — only text the project emits as part of normal play is translated; infrastructure/exception messages may remain English.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Play the game entirely in Russian (Priority: P1)

A Russian-speaking player opens the game, selects Russian as their display language, and from that moment every piece of text the game shows them — lobby screens, buttons, status messages, bidding controls, prompts, round summaries, final results, the rules, the scoreboard, the event history, error messages, and notifications — appears in Russian.

**Why this priority**: This is the core value of the feature. Without complete Russian coverage, the language option is cosmetic and Russian-speaking players still cannot use the game comfortably.

**Independent Test**: Can be fully tested by selecting Russian and walking through every screen of a complete game session (nickname entry → lobby → waiting room → full round → round summary → final results), verifying no English text remains anywhere in the interface.

**Acceptance Scenarios**:

1. **Given** a player has selected Russian, **When** they navigate any screen (lobby, waiting room, game table, summaries, rules), **Then** all interface text is shown in Russian.
2. **Given** a player has selected Russian, **When** a dynamic message is shown (e.g., a status line naming whose turn it is, or a bid amount), **Then** the message is grammatically composed in Russian with the correct names and numbers inserted.
3. **Given** a player has selected Russian, **When** an error or notification appears (e.g., nickname taken, connection lost), **Then** that message is in Russian.
4. **Given** a translation is missing for a specific piece of text, **When** that text is displayed, **Then** the English original is shown instead of a blank, an error, or a placeholder code.

---

### User Story 2 - Switch language on the fly (Priority: P2)

A player changes the display language at any moment — in the lobby or in the middle of an active game — and the entire visible interface immediately re-renders in the newly chosen language, without reloading the page and without disturbing the game in progress.

**Why this priority**: "Change on the flow" is an explicit user requirement. It also makes the feature self-correcting: a player who lands in the wrong language can fix it instantly without losing their seat or game state.

**Independent Test**: Can be tested by joining a game, switching the language mid-trick, and verifying (a) every visible label updates immediately, (b) the game continues uninterrupted, and (c) previously logged history entries now read in the new language.

**Acceptance Scenarios**:

1. **Given** a player is in the lobby in English, **When** they switch to Russian, **Then** all visible lobby text changes to Russian immediately, without a page reload.
2. **Given** a player is mid-game (e.g., during bidding or trick play), **When** they switch language, **Then** all visible game text — controls, status bar, scoreboard, history panel — updates immediately and the game state (hand, bids, tricks, turn) is unaffected.
3. **Given** the event history panel already contains entries, **When** the player switches language, **Then** the existing entries are displayed in the newly selected language, not frozen in the old one.
4. **Given** two players share a game, **When** one switches to Russian, **Then** the other player's display language is unchanged — language is a personal, per-player choice.

---

### User Story 3 - Language preference is remembered (Priority: P3)

A player who chose Russian closes the browser, returns later (or reconnects after a dropped connection), and the game greets them in Russian without being asked again.

**Why this priority**: Convenience and polish. The feature is usable without persistence, but re-selecting the language every visit would quickly annoy returning players.

**Independent Test**: Can be tested by selecting Russian, closing and reopening the game in the same browser, and verifying the first screen already renders in Russian.

**Acceptance Scenarios**:

1. **Given** a player previously selected Russian, **When** they return to the game in the same browser, **Then** the interface opens in Russian.
2. **Given** a first-time visitor whose browser is set to Russian, **When** they open the game, **Then** the interface defaults to Russian; any other browser language defaults to English.
3. **Given** a player reconnects to an in-progress game after a disconnect, **When** the game screen restores, **Then** it restores in their chosen language.

---

### Edge Cases

- Russian text is typically 10–30% longer than English: buttons, labels, and fixed-width panels must not clip, overflow, or break the layout in either language.
- Dynamic messages that interpolate values (player names, bid amounts, card counts, suit names) must read correctly in Russian, where word forms can depend on the number (e.g., counts of tricks/points).
- Player-entered content (nicknames, game names) and bot names are displayed as-is in both languages — never translated or transliterated.
- A player switches language while a transient element is on screen (a toast, a modal, a countdown prompt): the element either updates in place or the next occurrence appears in the new language; no mixed-language single message.
- If the stored language preference is invalid or refers to an unsupported language, the game falls back to the default-language logic rather than failing.
- Players in the same game using different languages must see identical game facts (same bids, scores, events) — only the wording differs.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The game MUST support multiple display languages, launching with exactly two: English and Russian.
- **FR-002**: Every piece of user-facing interface text — lobby screens, waiting room, in-game controls and prompts, status messages, scoreboard, history panel entries, round summaries, final results, rules content, gameplay errors (e.g., rejected actions, nickname taken, game full), and notifications — MUST have a Russian equivalent. Infrastructure/exception messages (e.g., malformed-message or internal server errors, protocol failures) are exempt and may remain English. *(Scope narrowed in clarification session 2026-06-11.)*
- **FR-003**: The initial Russian text MUST be produced by automatically translating the existing English text; the resulting translations ship with the game (no live translation service at runtime).
- **FR-004**: Players MUST be able to change the display language at any time, from both the lobby and the in-game screen, via a clearly discoverable language control.
- **FR-005**: Changing the language MUST take effect immediately on all currently visible text, without a page reload and without any effect on game state or other players.
- **FR-006**: Language choice MUST be personal to each player; players in the same game may use different languages simultaneously.
- **FR-007**: The chosen language MUST persist across visits and reconnects in the same browser, and be applied automatically on return.
- **FR-008**: For first-time visitors with no stored preference, the game MUST default to Russian when the browser's language is Russian, and to English otherwise.
- **FR-009**: Any text lacking a translation in the selected language MUST fall back to its English original (never a blank, a key/code, or an error).
- **FR-010**: Dynamic messages that embed values (player names, bids, points, trick counts, suit names) MUST compose grammatically correctly in the selected language, including correct Russian word forms for counted quantities.
- **FR-011**: Event-history entries MUST render in the viewer's currently selected language, including entries recorded before the player switched languages.
- **FR-012**: Player-entered text (nicknames, game names) and bot names MUST be displayed unchanged in every language.
- **FR-013**: All screens and controls MUST remain fully usable and visually intact in both languages, accommodating the longer typical length of Russian text.
- **FR-014**: Adding a further language in the future MUST require only supplying a new set of translated text, not reworking individual screens.

### Key Entities

- **Language**: A supported display language (initially English, Russian); has an identifier and a self-referential display name (e.g., "English", "Русский") for the language control.
- **Translation Catalog**: The complete set of user-facing text, where each distinct message exists once per supported language; the English catalog is the source of truth and the fallback.
- **Language Preference**: A per-player, per-browser record of the chosen language; absent for first-time visitors (default logic applies), restored on every return visit.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With Russian selected, a complete game session (lobby through final results) shows 100% of interface text in Russian — zero English strings visible (exempt infrastructure/exception messages excluded; they do not occur in a normal session).
- **SC-002**: Switching language updates all visible text in under 1 second, with no page reload and no interruption to an in-progress game.
- **SC-003**: A returning player sees their previously chosen language on the very first screen, with no re-selection step, in 100% of return visits in the same browser.
- **SC-004**: Two players in the same game can use different languages simultaneously while seeing identical game facts (bids, scores, events).
- **SC-005**: A future third language can be brought to parity by supplying translated text alone, with no per-screen redesign work.

## Assumptions

- "Autotranslate" means the Russian text is generated automatically from the existing English text during development and shipped with the game — not translated live by an external service at runtime. Review by a native speaker is desirable but out of scope for this feature.
- Russian card-game terminology follows the established vocabulary of the game Тысяча (Tysiacha) — e.g., марьяж for marriage, бочка for barrel, прикуп for talon, роспись for crawl-related terms as conventionally used — rather than literal word-for-word translation.
- Scope is interface text only: sounds, card faces (which use standard suit/rank symbols), and developer documentation are unaffected.
- Game events are delivered as structured facts and worded on each player's screen, so the same event can read in English for one player and in Russian for another.
- Language preference is stored per browser (like the existing mute preference), not tied to the player's server-side identity; the same player on a different device re-selects once. *(Confirmed in clarification session 2026-06-11.)*
- No right-to-left languages are in scope; both launch languages read left-to-right.
- "Errors" in scope means gameplay feedback a player can trigger through normal use (rejected actions, taken nickname, full game). Infrastructure/exception messages — malformed messages, internal server errors, protocol failures — are diagnostic, not part of normal play, and stay English. *(Confirmed in clarification session 2026-06-11.)*
