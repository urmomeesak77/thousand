# Tasks: Antlion Engine Enhancement

**Input**: Design documents from `specs/002-antlion-engine-enhancement/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/engine-api.md

**Tests**: Not explicitly requested in the spec. Test tasks omitted. Existing 59 backend tests must continue passing.

**Organization**: Tasks grouped by user story. Stories 1-3 (P1) are co-dependent engine classes. Stories 4-5 (P2) build on that foundation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new project initialization needed — engine classes are added to the existing `src/public/js/antlion/` directory. This phase handles the only HTML change required.

- [ ] T001 Add `<main id="app">` wrapper around the three `<section>` screen elements in `src/public/index.html` (research decision R2 — provides scene root without affecting CSS/layout)

---

## Phase 2: Foundational (Engine Core — Blocking)

**Purpose**: Build all 5 engine classes. These are the prerequisite for ALL user stories. No existing files are modified.

- [ ] T002 [P] Create Behaviour base class in `src/public/js/antlion/Behaviour.js` (~40 lines) — constructor, owner, _enabled, onAttach(), onDetach(), update(dt), enable(), disable() per contracts/engine-api.md
- [ ] T003 Create GameObject base class in `src/public/js/antlion/GameObject.js` (~80 lines) — name, parent, _enabled, _visible, _behaviours Map, lifecycle hooks (onCreate/onDestroy/update/render), state controls (enable/disable/show/hide), behaviour management (addBehaviour/removeBehaviour/getBehaviour), tree access (getScene/getEngine) per contracts/engine-api.md
- [ ] T004 Create HtmlGameObject class in `src/public/js/antlion/HtmlGameObject.js` (~70 lines) — extends GameObject, constructor(name, tag='div') creates DOM element, static adopt(name, element) factory for existing elements, _dirty flag, markDirty(), render() calls renderContent() if dirty, bindInput() delegates to engine, onCreate() calls renderContent(), onDestroy() removes element from DOM per contracts/engine-api.md
- [ ] T005 Create HtmlContainer class in `src/public/js/antlion/HtmlContainer.js` (~90 lines) — extends HtmlGameObject, _children array, addChild(child) with re-parent support (FR-008), removeChild(child) with recursive onDestroy, removeAllChildren(), getChild(name), hasChild(name), update(dt)/render() propagate to children per contracts/engine-api.md. Must handle edge cases: object added to container not yet in scene (defer onCreate until container enters scene), recursive cleanup of 3+ nesting levels (SC-005), and single-parent invariant enforcement.
- [ ] T006 Create Scene class in `src/public/js/antlion/Scene.js` (~60 lines) — constructor(engine, rootElement) adopts rootElement into root HtmlContainer, start() registers _tick via engine.onTick(), stop() removes handler and halts all update/render dispatch (US3 acceptance scenario 3), _tick() computes dt via performance.now() and calls root.update(dt)/root.render() per contracts/engine-api.md and research decision R4

**Checkpoint**: All engine classes built. Antlion.js and EventBus.js remain unchanged (FR-011). Verify `npm run lint` passes.

---

## Phase 3: User Stories 1-3 — Wire Engine into App (Priority: P1) — MVP

**Goal**: Connect the engine to the running application. Scene creates the tick loop, screen sections become HtmlContainers, update/render propagation works end-to-end. Covers US1 (game objects render), US2 (containers group objects), and US3 (scene bridges engine).

**Independent Test**: Run `npm start`, open browser. Lobby loads and functions identically. Open devtools console — no errors. Screen switching (nickname → lobby → waiting room → lobby) works via container show/hide.

### Implementation

- [ ] T007 [US1] Update `src/public/js/index.js` to import Scene, create it with `document.getElementById('app')` as root element, call `scene.start()` before `antlion.start()`, and pass scene reference to ThousandApp
- [ ] T008 [US2] Refactor `src/public/js/ThousandApp.js` — accept scene in constructor, create three HtmlContainer instances (via static `adopt()`) for `#nickname-screen`, `#lobby-screen`, `#game-screen` and add them as children of scene.root
- [ ] T009 [US2] Replace all `ThousandRenderer.showScreen()` calls in `src/public/js/ThousandApp.js` with container `.show()` / `.hide()` calls on the three screen containers
- [ ] T010 [US1] [US3] Verify dirty-flag rendering works: temporarily override `renderContent()` on one screen container with a `console.log`, confirm it fires once on `markDirty()` and does NOT fire on subsequent frames without `markDirty()` (SC-002). Remove the log after verification.
- [ ] T011 [US3] Verify Scene._tick() delta time: temporarily log `dt` in a container's `update(dt)`, confirm values are reasonable (~16ms at 60fps). Verify that hiding a container skips its `render()` but not `update()`. Verify that disabling a container skips both. Remove logs after verification.

**Checkpoint**: Engine tick loop running with Scene. Screens managed as engine containers. `npm test` and `npm run lint` pass. Lobby unchanged visually.

---

## Phase 4: User Story 4 — Behaviours Add Reusable Logic (Priority: P2)

**Goal**: Behaviours can be attached to game objects and receive per-frame update calls. Validates the Behaviour base class built in Phase 2.

**Independent Test**: Attach a behaviour to a lobby object, verify it receives update(dt). Disable it, verify it stops. Remove it, verify onDetach fires.

### Implementation

- [ ] T012 [US4] Verify Behaviour integration: temporarily create a test Behaviour subclass, attach it to one of the screen containers, confirm onAttach() fires, update(dt) runs each frame, disable() stops updates, removeBehaviour() calls onDetach(), and two instances on different objects run independently (SC-006, US4 acceptance scenarios 1-4). Remove test code after verification.

**Checkpoint**: Behaviour system validated end-to-end.

---

## Phase 5: User Story 5 — Lobby Uses the Engine's Object Model (Priority: P2)

**Goal**: Migrate all lobby rendering and interaction logic from static ThousandRenderer methods into HtmlGameObject/HtmlContainer subclasses. Delete ThousandRenderer.js. Every lobby screen is represented as an engine object (FR-009).

**Independent Test**: Full lobby flow — enter nickname, browse games, create/join game, waiting room, leave game — works identically after migration.

### Implementation

- [ ] T013 [P] [US5] Create NicknameScreen class in `src/public/js/NicknameScreen.js` — extends HtmlContainer, adopts `#nickname-screen` section, moves nickname form binding and validation logic from `ThousandApp._bindNicknameForm()` into `onCreate()`, emits engine event on successful nickname entry (FR-009 — nickname entry screen as engine object)
- [ ] T014 [P] [US5] Create GameList class in `src/public/js/GameList.js` — extends HtmlGameObject, adopts the `#game-list` `<ul>` element, moves `renderGameList()`, `_updateElapsedTimes()`, `_formatElapsed()`, `startElapsedTimer()`, `stopElapsedTimer()` logic from ThousandRenderer, uses `markDirty()` and `renderContent()` for dirty-flag rendering
- [ ] T015 [P] [US5] Create PlayerTooltip class in `src/public/js/PlayerTooltip.js` — extends HtmlGameObject, manages the `#player-tooltip` element, moves tooltip creation, mouseover/mousemove/mouseout handling, and `_positionTooltip()` from `ThousandRenderer.init()` into `onCreate()`
- [ ] T016 [P] [US5] Create WaitingRoom class in `src/public/js/WaitingRoom.js` — extends HtmlContainer, adopts `#game-screen .card` area, moves `renderWaitingRoom()`, `renderWaitingRoomPlayers()`, `startWaitingTimer()`, `stopWaitingTimer()` from ThousandRenderer, uses `markDirty()` and `renderContent()`
- [ ] T017 [US5] Update `src/public/js/ThousandApp.js` — wire `_handleMessage()` to the new game objects (GameList, WaitingRoom, NicknameScreen) instead of calling ThousandRenderer static methods. Move game list selection/join/double-click bindings into GameList or keep in ThousandApp as coordinator. Remove `_bindNicknameForm()` (now in NicknameScreen).
- [ ] T018 [US5] Update `src/public/js/ModalController.js` — refactor to accept engine reference via constructor (already receives antlion), move input bindings into a dedicated `init()` or `bind()` that uses engine API consistently. No structural change needed if current pattern already complies with Constitution §XI.
- [ ] T019 [US5] Delete `src/public/js/ThousandRenderer.js` and remove its import from `src/public/js/ThousandApp.js`
- [ ] T020 [US5] Verify nested cleanup (SC-005): temporarily create a 3+ level nesting hierarchy (root → container → sub-container → leaf object), call `removeChild()` on the top container, confirm all descendants receive `onDestroy()` and all DOM elements are removed. Remove test code after verification.
- [ ] T021 [US5] Full regression test: run `npm start`, open two browser tabs, test complete lobby flow:
  - Enter nickname → lobby appears
  - Create public game → waiting room with game ID
  - Second tab: enter nickname, see game in list, join → both tabs show updated player list
  - First tab: copy invite code → verify clipboard
  - Leave game → return to lobby
  - Create private game → verify invite code display
  - Host disconnect → guest sees "game disbanded" toast
  - Verify elapsed timers tick in game list and waiting room
  - Verify player tooltip on hover
  - Verify toast notifications appear and auto-dismiss
  - Verify modals (new game, leave confirm) open/close correctly
  - Verify real-time update during screen transition (join game while lobby_update arrives)

**Checkpoint**: ThousandRenderer.js deleted. All lobby screens (nickname, lobby, waiting room) are engine objects (FR-009). All lobby interactions preserved (FR-010). `npm test` and `npm run lint` pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and validation

- [ ] T022 [P] Verify no direct `addEventListener`, `setTimeout`, `setInterval`, or `requestAnimationFrame` calls exist in any frontend module outside `src/public/js/antlion/Antlion.js` (Constitution §XI compliance)
- [ ] T023 [P] Verify all new files follow one-class-per-file convention (Constitution §VIII) and classes are under ~100 lines (Constitution §IX) — check: `Behaviour.js`, `GameObject.js`, `HtmlGameObject.js`, `HtmlContainer.js`, `Scene.js`, `NicknameScreen.js`, `GameList.js`, `PlayerTooltip.js`, `WaitingRoom.js`
- [ ] T024 Run `npm test` — all 59 existing backend tests pass
- [ ] T025 Run `npm run lint` — no errors
- [ ] T026 Final manual smoke test of complete lobby flow per quickstart.md verification checklist

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — HTML wrapper change
- **Phase 2 (Foundational)**: Depends on Phase 1 — builds all engine classes
- **Phase 3 (US1-US3)**: Depends on Phase 2 — wires Scene, creates screen containers, validates propagation
- **Phase 4 (US4)**: Depends on Phase 3 — needs active scene with containers to test behaviours
- **Phase 5 (US5)**: Depends on Phase 3 — migrates lobby rendering into engine objects
- **Phase 6 (Polish)**: Depends on Phase 5 — final validation

### User Story Dependencies

- **US1 (Game Objects)**: Needs Phase 2 engine classes
- **US2 (Containers)**: Needs US1 (Scene active) — same phase
- **US3 (Scene)**: Needs US1 (Scene active) — same phase
- **US4 (Behaviours)**: Needs Phase 3 (active scene with containers)
- **US5 (Lobby Migration)**: Needs Phase 3 (screen containers)

### Within Phase 2 (Foundational)

```
T002 (Behaviour) ──────────────────────────────┐
T003 (GameObject) ── depends on T002 ──────────┤
T004 (HtmlGameObject) ── depends on T003 ──────┤
T005 (HtmlContainer) ── depends on T004 ───────┤
T006 (Scene) ── depends on T005 ───────────────┘
```

T002 can run in parallel with T001. T003-T006 are sequential (each extends the previous).

### Within Phase 5 (US5)

```
T013 (NicknameScreen) ──┐
T014 (GameList) ─────────┤── all [P], different files
T015 (PlayerTooltip) ────┤
T016 (WaitingRoom) ──────┘
T017 (wire ThousandApp) ── depends on T013-T016
T018 (ModalController) ── independent of T013-T016
T019 (delete ThousandRenderer) ── depends on T017
T020 (nested cleanup verification) ── depends on Phase 2
T021 (full regression) ── depends on T019
```

---

## Parallel Example: Phase 5 (User Story 5)

```bash
# Launch these four in parallel (different files):
Task: "T013 [P] [US5] Create NicknameScreen in src/public/js/NicknameScreen.js"
Task: "T014 [P] [US5] Create GameList in src/public/js/GameList.js"
Task: "T015 [P] [US5] Create PlayerTooltip in src/public/js/PlayerTooltip.js"
Task: "T016 [P] [US5] Create WaitingRoom in src/public/js/WaitingRoom.js"

# Then sequentially:
Task: "T017 [US5] Wire ThousandApp message handling to new objects"
Task: "T018 [US5] Update ModalController"
Task: "T019 [US5] Delete ThousandRenderer.js"
```

---

## Implementation Strategy

### MVP First (User Stories 1-3)

1. Complete Phase 1: HTML wrapper
2. Complete Phase 2: All 5 engine classes
3. Complete Phase 3: Scene + screen containers + validation
4. **STOP and VALIDATE**: Lobby still works, engine running, dirty-flag and propagation confirmed
5. This is the structural MVP — engine exists and runs

### Incremental Delivery

1. Phase 1 + 2 → Engine classes built
2. Phase 3 (US1-US3) → Scene active, screen containers, propagation verified → Validate
3. Phase 4 (US4) → Behaviour system verified
4. Phase 5 (US5) → Full lobby migration → Major validation
5. Phase 6 → Polish and final checks

---

## Traceability: Spec Coverage

### Functional Requirements

| FR | Task(s) |
|----|---------|
| FR-001 GameObject base | T003 |
| FR-002 HtmlGameObject dirty-flag | T004, T010 |
| FR-003 Container child management | T005 |
| FR-004 addChild DOM insert + onCreate | T005 |
| FR-005 removeChild recursive destroy | T005, T020 |
| FR-006 Scene tick bridge | T006, T011 |
| FR-007 Behaviour base | T002, T012 |
| FR-008 Single-parent constraint | T005 |
| FR-009 Lobby as engine objects | T008, T013-T016 |
| FR-010 Preserve lobby functionality | T017-T019, T021 |
| FR-011 Engine core unchanged | Phase 2 (no Antlion.js/EventBus.js changes) |

### Success Criteria

| SC | Task(s) |
|----|---------|
| SC-001 Renders within one frame | T010 (renderContent fires on markDirty) |
| SC-002 Dirty-flag skip | T010 (no re-render without markDirty) |
| SC-003 Lobby flow identical | T021 |
| SC-004 100% interactions | T021 |
| SC-005 Nested cleanup 3+ levels | T020 |
| SC-006 Behaviour lifecycle | T012 |

### Edge Cases

| Edge Case | Task(s) |
|-----------|---------|
| Object in container not in scene | T005 (implementation) |
| Deeply nested removal | T005, T020 (verification) |
| Behaviour on in-scene object | T012 |
| Same object two containers | T005 (re-parent) |
| Update during screen transition | T021 (regression test item) |

---

## Notes

- No new tests are generated — the 59 existing backend tests cover server behaviour. Frontend validation is manual.
- ThousandSocket.js, GameApi.js, Toast.js, and HtmlUtil.js are NOT modified — they already use Antlion correctly.
- The HTML file gets one structural change (Phase 1) — wrapping screens in `<main id="app">`.
- CSS file is not modified.
- Antlion.js and EventBus.js are not modified (FR-011).
- All new lobby classes (NicknameScreen, GameList, PlayerTooltip, WaitingRoom) live in their own files per Constitution §VIII.
