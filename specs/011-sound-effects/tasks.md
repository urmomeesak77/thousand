---
description: "Task list for Sound Effects (feature 011)"
---

# Tasks: Sound Effects

**Input**: Design documents from `specs/011-sound-effects/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/sound-events.md, quickstart.md

**Tests**: INCLUDED — the constitution mandates ≥90% coverage (frontend + backend). Test tasks are written before their implementation (TDD) where the unit is testable in isolation (jsdom + injected audio factory). Trigger-emission inside large view classes (DealAnimation/GameScreen/etc.) is verified via the manual quickstart rather than brittle DOM unit tests.

**Organization**: Tasks grouped by user story (US1, US2, US3) for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (setup, foundational, and polish tasks carry no story label)

## Path Conventions

Web app, single existing layout: frontend under `src/public/js/`, styles under `src/public/css/`, backend util under `src/utils/`, tests under `tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Ensure the audio assets are served correctly before any playback work.

- [X] T001 Add a `.mp3` → `audio/mpeg` MIME mapping in `src/utils/StaticServer.js` if not already present, so sound files serve with the correct content-type (without it, browsers may refuse to decode the audio).
- [X] T002 [P] Confirm the three assets exist and are reachable: `src/public/sound/playing-card.mp3`, `src/public/sound/flipcard.mp3`, `src/public/sound/turn.mp3` (load each via `http://localhost:3000/sound/<file>` while `npm start` runs).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `SoundManager` is required by every user story (sounds, mute, persistence). It must exist and be subscribed to the engine bus before story work begins.

**⚠️ CRITICAL**: No user story can be fully exercised until this phase is complete.

- [X] T003 [P] Write failing unit tests for `SoundManager` in `tests/sound-manager.test.js`: muted ⇒ `play(cue)` does NOT call the audio factory; unmuted ⇒ `play(cue)` plays exactly once per call; unknown cue is a no-op; `toggleMute()` flips and returns the new state; a `play()` that throws is swallowed. Use an injected `audioFactory` stub returning a spy with `cloneNode()`/`play()`.
- [X] T004 Implement `SoundManager` in `src/public/js/thousand/SoundManager.js` to make T003 pass: constructor `(antlion, { store = null, audioFactory = (src) => new Audio(src) } = {})`; preload one base `Audio` per cue (`card`/`flip`/`turn` → the three files); `play(cue)` no-ops when muted else clones the cached base and `.play()` (errors swallowed, no `ended` listener — §XI); in-memory `muted` initialised from `store?.get()` (default `false`); `isMuted()`, `toggleMute()` (flips, persists via `store?.set()`); register `antlion.onInput('sound:card'|'sound:flip'|'sound:turn', …)` → `play(...)`.
- [X] T005 Construct the `SoundManager` in `src/public/js/core/ThousandApp.js` (instantiate with the app's `antlion`; leave the `store` option unset for now) and keep the reference for the mute button wiring.

**Checkpoint**: Engine events now produce sound; default state is unmuted.

---

## Phase 3: User Story 1 — Hear feedback as cards move and turns change (Priority: P1) 🎯 MVP

**Goal**: Every card movement plays `playing-card.mp3`, every face-up reveal plays `flipcard.mp3`, and every active-player change plays `turn.mp3`. Simultaneous batches fire one cue per card (overlap allowed) per the clarification.

**Independent Test**: Play a round with bots (default unmuted) and confirm card/flip/turn cues fire at the right moments with no duplicate cue for the same individual card/flip/turn (SC-001).

- [X] T006 [P] [US1] In `src/public/js/thousand/DealAnimation.js`, emit `this._antlion.emit('sound:card')` once per launched card inside `_launchCard()` (24 staggered cues per deal).
- [X] T007 [P] [US1] In `src/public/js/thousand/CardFlightAnimator.js`, emit `this._antlion.emit('sound:card')` once per flight inside `spawn()` (covers play-to-centre and collect-to-winner flights).
- [X] T008 [P] [US1] In `src/public/js/thousand/CardExchangeView.js`, emit `this._antlion.emit('sound:card')` once per card passed during the exchange.
- [X] T009 [P] [US1] In `src/public/js/thousand/SellPhaseView.js`, emit `gs._antlion.emit('sound:flip')` once per exposed card in the expose animation path (`_animateSprites` for the sell exposure).
- [X] T010 [US1] In `src/public/js/thousand/GameScreen.js`, add turn-change detection: in the status-render path (`_renderStatus` / `updateStatus`), compare the previous `activePlayer.seat` (from `_lastGameStatus`) against the incoming `gameStatus.activePlayer.seat`; when it changes to a non-null seat, emit `'sound:turn'`. Compute the comparison BEFORE `_lastGameStatus` is reassigned.
- [X] T011 [US1] In `src/public/js/thousand/GameScreen.js` (same file, after T010), emit `'sound:flip'` once per revealed card when the talon transitions from face-down to face-up, and once per crawl card revealed in the crawl-reveal path (`revealCrawl`).
- [X] T012 [US1] Audit any remaining single-card movement animations not covered above (notably the talon-absorb animation when the declarer takes the talon, and any other sprite flight) and emit `'sound:card'` once per card at each; record the file paths touched in the PR description.

**Checkpoint**: All three cues are audible end-to-end; MVP complete and independently demoable.

---

## Phase 4: User Story 2 — Mute and unmute all sound (Priority: P1)

**Goal**: A toggle next to the rules (info) icon silences/restores all sound and clearly shows its state.

**Independent Test**: Toggle the control; while muted no cue plays for any event; the icon reflects state; unmute restores sound on the next event (SC-002, SC-003).

- [ ] T013 [P] [US2] Write failing unit tests for `MuteButton` in `tests/mute-button.test.js`: a `.mute-btn` click calls `SoundManager.toggleMute()`; after toggle the button's icon/`aria-pressed`/`title` reflect the new state; on bind the initial appearance matches `SoundManager.isMuted()`. Use a jsdom button element, a stub antlion (records `bindInput`/dispatches the input), and a stub `SoundManager`.
- [ ] T014 [US2] Implement `MuteButton` in `src/public/js/thousand/MuteButton.js` (make T013 pass): `bind()` wires every `.mute-btn` via `antlion.bindInput(el, 'click', 'sound-toggle-mute')` and `antlion.onInput('sound-toggle-mute', …)` → `soundManager.toggleMute()` then re-render all `.mute-btn`; render sets icon (e.g. speaker vs muted-speaker SVG), `aria-pressed`, and `title`; set initial state from `soundManager.isMuted()` on bind. Follow the `RulesModal` controller pattern.
- [ ] T015 [US2] Add `_buildMuteBtn()` to `src/public/js/thousand/ScoreboardPanel.js` and append the `.mute-btn .icon-btn` immediately adjacent to the existing `.rules-btn` in the header `controls` row (e.g. `controls.append(muteBtn, rulesBtn, this._toggleBtn)` — keep the mute control right next to the info icon).
- [ ] T016 [US2] In `src/public/js/core/ThousandApp.js`, construct `MuteButton(antlion, soundManager)` and call `bind()` after the game chrome (scoreboard) is built — mirror the existing `RulesModal` bind ordering so every `.mute-btn` is wired.
- [ ] T017 [P] [US2] Add `.mute-btn` styles in `src/public/css/game.css` reusing `.icon-btn` (touch-friendly target per §VI/FR-012) with a distinct muted vs unmuted appearance (e.g. via an `aria-pressed="true"` selector or a state class).

**Checkpoint**: Mute toggles all sound and shows its state; works alongside US1.

---

## Phase 5: User Story 3 — Mute preference is remembered (Priority: P2)

**Goal**: The mute choice persists across reloads/reconnects on the same browser; first-time default is unmuted.

**Independent Test**: Mute then reload → starts muted; unmute then reload → starts with sound on (SC-004).

- [ ] T018 [P] [US3] Write failing unit tests for `MutePreferenceStore` in `tests/mute-preference-store.test.js`: absent key ⇒ `get()` returns `false`; `set(true)`/`set(false)` round-trip through `get()`; a thrown `localStorage` access (stub that throws) is swallowed and `get()` falls back to `false`.
- [ ] T019 [US3] Implement `MutePreferenceStore` in `src/public/js/storage/MutePreferenceStore.js` (make T018 pass): key `thousand_muted`; `get()` → boolean (parse `"true"`, default `false`); `set(bool)` writes `"true"`/`"false"`; all access wrapped in try/catch (best-effort, mirrors `IdentityStore`).
- [ ] T020 [US3] Wire persistence: in `src/public/js/core/ThousandApp.js` pass `new MutePreferenceStore()` as the `store` option to `SoundManager`; confirm `SoundManager` (from T004) initialises `muted` from `store.get()` and calls `store.set()` in `toggleMute()`.
- [ ] T021 [US3] Extend `tests/sound-manager.test.js` to cover store-backed behaviour: construct with a stub store returning `true` ⇒ starts muted; `toggleMute()` calls `store.set()` with the new value.

**Checkpoint**: Mute survives reloads; default remains unmuted for new players.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T022 [P] Run `npm run lint` and resolve any issues in new/modified files (naming, comment-why, ≤50-line functions, ≤100-line classes per conventions).
- [ ] T023 [P] Run `npm test` and confirm the new modules (`SoundManager`, `MuteButton`, `MutePreferenceStore`) meet ≥90% coverage.
- [ ] T024 Manual verification against `specs/011-sound-effects/quickstart.md` — walk SC-001…SC-005 (card/flip/turn cues, mute silence, persistence across reload, no perceptible animation delay).
- [ ] T025 [P] Verify the mute button is a finger-sized, reachable touch target at mobile widths and exposes an accessible label consistent with the rules icon (§VI / FR-012).
- [ ] T026 [P] Confirm `CLAUDE.md` SPECKIT pointer references `specs/011-sound-effects/plan.md` (already updated) and note the new files in any developer docs if appropriate.

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T005)** → user stories.
- **US1 (T006–T012)**, **US2 (T013–T017)**, **US3 (T018–T021)** all depend on Foundational. They are otherwise independent and can be implemented in any order or in parallel by separate developers.
- Within US1, T010 and T011 touch the same file (`GameScreen.js`) → sequential (T010 before T011); T006–T009 are `[P]` (distinct files).
- Within US3, T020 edits `SoundManager.js`/`ThousandApp.js` after the store (T019) exists.
- **Polish (T022–T026)** runs after the stories being shipped are complete.

## Parallel Execution Examples

- After Foundational: run T006, T007, T008, T009 together (four different files), with T010→T011 on `GameScreen.js` in sequence.
- US2 styling (T017) can proceed in parallel with US2 logic (T013/T014).
- All three test-authoring tasks (T003, T013, T018) are `[P]` across distinct test files.

## Implementation Strategy

- **MVP = Phase 1 + Phase 2 + Phase 3 (US1)**: sounds are audible with default-unmuted behaviour — a complete, demoable increment.
- **Increment 2 = US2**: add the mute/unmute control (required to ship per the spec, but the sounds work without it).
- **Increment 3 = US3**: persist the preference across sessions.

## Coverage (FR → tasks)

- FR-001 (card sound per movement) → T006, T007, T008, T012
- FR-002 (flip sound per reveal) → T009, T011
- FR-003 (turn sound per change) → T010
- FR-004 (one cue per card/flip/turn, overlap allowed) → T003/T004 (play semantics) + emitter tasks
- FR-005/FR-006 (control next to info icon, shows state) → T014, T015, T017
- FR-007 (muted ⇒ no sound) → T004 (+T003 test)
- FR-008 (toggle immediate) → T004, T014
- FR-009 (persist, default unmuted) → T019, T020 (+T018, T021 tests)
- FR-010 (failures don't interrupt) → T004 (swallow), T019 (try/catch)
- FR-011 (no animation delay) → T004 (clone-and-play, no blocking) + T024 verify
- FR-012 (accessible/touch) → T014 (aria), T017, T025
