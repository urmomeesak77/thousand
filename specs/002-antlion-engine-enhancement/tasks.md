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

**Note**: US1 (GameObject/HtmlGameObject), US2 (HtmlContainer), US3 (Scene), and US4 (Behaviour) map 1:1 to engine classes. They are built bottom-up here because each class depends on the previous ones at the code level, even though the spec treats them as separate stories.

- [ ] T002 [P] Create Behaviour base class in `src/public/js/antlion/Behaviour.js` (~40 lines) — constructor, owner, _enabled, onAttach(), onDetach(), update(dt), enable(), disable() per contracts/engine-api.md
- [ ] T003 Create GameObject base class in `src/public/js/antlion/GameObject.js` (~80 lines) — name, parent, _enabled, _visible, _behaviours Map, lifecycle hooks (onCreate/onDestroy/update/render), state controls (enable/disable/show/hide), behaviour management (addBehaviour/removeBehaviour/getBehaviour), tree access (getScene/getEngine) per contracts/engine-api.md
- [ ] T004 Create HtmlGameObject class in `src/public/js/antlion/HtmlGameObject.js` (~70 lines) — extends GameObject, constructor(name, tag='div') creates DOM element, static adopt(name, element) factory for existing elements, _dirty flag, markDirty(), render() calls renderContent() if dirty, bindInput() delegates to engine, onCreate() calls renderContent(), onDestroy() removes element from DOM per contracts/engine-api.md
- [ ] T005 Create HtmlContainer class in `src/public/js/antlion/HtmlContainer.js` (~90 lines) — extends HtmlGameObject, _children array, addChild(child) with re-parent support (FR-008), removeChild(child) with recursive onDestroy, removeAllChildren(), getChild(name), hasChild(name), update(dt)/render() propagate to children per contracts/engine-api.md
- [ ] T006 Create Scene class in `src/public/js/antlion/Scene.js` (~60 lines) — constructor(engine, rootElement) adopts rootElement into root HtmlContainer, start() registers _tick via engine.onTick(), stop() removes handler, _tick() computes dt via performance.now() and calls root.update(dt)/root.render() per contracts/engine-api.md and research decision R4

**Checkpoint**: All engine classes built. Antlion.js and EventBus.js remain unchanged (FR-011). Verify `npm run lint` passes.

---

## Phase 3: User Story 1 — Game Objects Render on Screen (Priority: P1) — MVP

**Goal**: A developer can create HtmlGameObject instances, add them to a scene, and see them render with dirty-flag optimization.

**Independent Test**: Create a simple HtmlGameObject subclass, add to scene, verify it appears on screen. Change state via markDirty(), verify re-render. Verify no re-render when not dirty.

### Implementation for User Story 1

- [ ] T007 [US1] Update `src/public/js/index.js` to create a Scene with `document.getElementById('app')` as root element, call `scene.start()` before `antlion.start()`, and pass scene reference to ThousandApp
- [ ] T008 [US1] Smoke-test: run `npm start`, open browser, verify the lobby still loads and functions correctly with the Scene active (no visual changes yet — Scene just runs empty tick loop)

**Checkpoint**: Engine tick loop running with Scene. Lobby unchanged. `npm test` and `npm run lint` pass.

---

## Phase 4: User Story 2 — Containers Organize Objects into Groups (Priority: P1)

**Goal**: Screen sections are represented as HtmlContainer instances that adopt existing DOM elements. Show/hide switching works through the container API.

**Independent Test**: Verify that hiding a screen container hides it and all its children. Verify addChild/removeChild correctly inserts/removes DOM elements.

### Implementation for User Story 2

- [ ] T009 [US2] Refactor `src/public/js/ThousandApp.js` — create three HtmlContainer instances (via `HtmlContainer.adopt()` or equivalent) for `#nickname-screen`, `#lobby-screen`, `#game-screen` and add them as children of the scene root
- [ ] T010 [US2] Replace all `ThousandRenderer.showScreen()` calls in `src/public/js/ThousandApp.js` with container `.show()` / `.hide()` calls on the three screen containers
- [ ] T011 [US2] Smoke-test: run `npm start`, verify screen switching (nickname → lobby → waiting room → lobby) works identically to before

**Checkpoint**: Screens managed as engine containers. ThousandRenderer.showScreen() no longer called. `npm test` and `npm run lint` pass.

---

## Phase 5: User Story 3 — Scene Bridges Engine and Object Tree (Priority: P1)

**Goal**: The full update/render cycle propagates through the object tree each frame. Delta time is computed and passed to all objects.

**Independent Test**: Verify objects in the tree receive update(dt) calls with correct delta times. Verify disabled objects are skipped. Verify hidden objects skip render but still update.

### Implementation for User Story 3

- [ ] T012 [US3] Verify Scene._tick() delta time computation works correctly — add temporary console.log in a test HtmlGameObject.update(dt) to confirm dt values are reasonable (~16ms at 60fps), then remove the log
- [ ] T013 [US3] Verify that disabled containers skip update propagation and hidden containers skip render propagation — test with `lobbyScreen.disable()` / `lobbyScreen.hide()` temporarily

**Checkpoint**: Full engine tick → Scene → object tree pipeline verified. All lifecycle rules working.

---

## Phase 6: User Story 4 — Behaviours Add Reusable Logic (Priority: P2)

**Goal**: Behaviours can be attached to game objects and receive per-frame update calls.

**Independent Test**: Attach a behaviour to a lobby object, verify it receives update(dt). Disable it, verify it stops.

### Implementation for User Story 4

- [ ] T014 [US4] Verify Behaviour integration by attaching a temporary test behaviour to one of the lobby screen containers — confirm onAttach() fires, update(dt) runs each frame, disable() stops updates, removeBehaviour() calls onDetach(). Remove test behaviour after verification.

**Checkpoint**: Behaviour system validated end-to-end. No permanent code changes needed — base class was built in Phase 2.

---

## Phase 7: User Story 5 — Lobby Uses the Engine's Object Model (Priority: P2)

**Goal**: Migrate all lobby rendering and interaction logic from static ThousandRenderer methods into HtmlGameObject/HtmlContainer subclasses. Delete ThousandRenderer.js.

**Independent Test**: Full lobby flow — enter nickname, browse games, create/join game, waiting room, leave game — works identically after migration.

### Implementation for User Story 5

- [ ] T015 [P] [US5] Create GameList HtmlGameObject in `src/public/js/ThousandApp.js` (inline class or extracted) that adopts the `#game-list` `<ul>` element — move `renderGameList()`, `_updateElapsedTimes()`, `_formatElapsed()`, `startElapsedTimer()`, `stopElapsedTimer()` logic from ThousandRenderer into this object's methods, using `markDirty()` and `renderContent()`
- [ ] T016 [P] [US5] Create PlayerTooltip HtmlGameObject in `src/public/js/ThousandApp.js` (inline class or extracted) that manages the `#player-tooltip` element — move tooltip creation, mouseover/mousemove/mouseout handling, and `_positionTooltip()` from `ThousandRenderer.init()` into this object's `onCreate()`
- [ ] T017 [P] [US5] Create WaitingRoom HtmlGameObject in `src/public/js/ThousandApp.js` (inline class or extracted) that adopts the `#game-screen .card` area — move `renderWaitingRoom()`, `renderWaitingRoomPlayers()`, `startWaitingTimer()`, `stopWaitingTimer()` from ThousandRenderer into this object
- [ ] T018 [US5] Update `src/public/js/ThousandApp.js` to wire all message handling (`_handleMessage`) to the new game objects instead of calling ThousandRenderer static methods
- [ ] T019 [US5] Update `src/public/js/ModalController.js` — refactor to integrate with the engine object model. Move input bindings into an `onCreate()`-style initialization that uses the engine via the scene tree (or keep current pattern if it already uses Antlion correctly — assess and decide)
- [ ] T020 [US5] Delete `src/public/js/ThousandRenderer.js` and remove its import from `src/public/js/ThousandApp.js`
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

**Checkpoint**: ThousandRenderer.js deleted. All lobby logic lives in engine objects. `npm test` and `npm run lint` pass. Full manual verification complete.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and validation

- [ ] T022 [P] Verify no direct `addEventListener`, `setTimeout`, `setInterval`, or `requestAnimationFrame` calls exist in any frontend module outside `src/public/js/antlion/Antlion.js` (Constitution §XI compliance)
- [ ] T023 [P] Verify all new files follow one-class-per-file convention (Constitution §VIII) and classes are under ~100 lines (Constitution §IX)
- [ ] T024 Run `npm test` — all 59 existing backend tests pass
- [ ] T025 Run `npm run lint` — no errors
- [ ] T026 Final manual smoke test of complete lobby flow per quickstart.md verification checklist

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — HTML wrapper change
- **Phase 2 (Foundational)**: Depends on Phase 1 — builds all engine classes
- **Phase 3 (US1)**: Depends on Phase 2 — wires Scene into index.js
- **Phase 4 (US2)**: Depends on Phase 3 — screen containers need active Scene
- **Phase 5 (US3)**: Depends on Phase 3 — validates tick propagation
- **Phase 6 (US4)**: Depends on Phase 2 — validates Behaviour independently
- **Phase 7 (US5)**: Depends on Phase 4 (screen containers) — migrates lobby rendering
- **Phase 8 (Polish)**: Depends on Phase 7 — final validation

### User Story Dependencies

- **US1 (Game Objects)**: Needs Phase 2 engine classes
- **US2 (Containers)**: Needs US1 (Scene active)
- **US3 (Scene)**: Needs US1 (Scene active) — can run in parallel with US2
- **US4 (Behaviours)**: Needs Phase 2 only — independent of US1-US3
- **US5 (Lobby Migration)**: Needs US2 (screen containers)

### Within Phase 2 (Foundational)

```
T002 (Behaviour) ──────────────────────────────┐
T003 (GameObject) ── depends on T002 ──────────┤
T004 (HtmlGameObject) ── depends on T003 ──────┤
T005 (HtmlContainer) ── depends on T004 ───────┤
T006 (Scene) ── depends on T005 ───────────────┘
```

T002 can run in parallel with T001. T003-T006 are sequential (each extends the previous).

### Parallel Opportunities in Phase 7 (US5)

```
T015 (GameList) ─────────┐
T016 (PlayerTooltip) ────┤── all [P], different DOM areas
T017 (WaitingRoom) ──────┘
T018 (wire message handling) ── depends on T015, T016, T017
T019 (ModalController) ── independent of T015-T017
T020 (delete ThousandRenderer) ── depends on T018
```

---

## Parallel Example: Phase 7 (User Story 5)

```bash
# Launch these three in parallel (different files/objects):
Task: "T015 [P] [US5] Create GameList HtmlGameObject"
Task: "T016 [P] [US5] Create PlayerTooltip HtmlGameObject"
Task: "T017 [P] [US5] Create WaitingRoom HtmlGameObject"

# Then sequentially:
Task: "T018 [US5] Wire message handling to new objects"
Task: "T019 [US5] Update ModalController"
Task: "T020 [US5] Delete ThousandRenderer.js"
```

---

## Implementation Strategy

### MVP First (User Stories 1-3)

1. Complete Phase 1: HTML wrapper
2. Complete Phase 2: All 5 engine classes
3. Complete Phase 3: Scene wired into index.js
4. **STOP and VALIDATE**: Lobby still works, engine running
5. This is the structural MVP — engine exists and runs

### Incremental Delivery

1. Phase 1 + 2 → Engine classes built
2. Phase 3 (US1) → Scene active, lobby unchanged → Validate
3. Phase 4 (US2) → Screen containers → Validate switching works
4. Phase 5 (US3) → Tick propagation verified
5. Phase 6 (US4) → Behaviour system verified
6. Phase 7 (US5) → Full lobby migration → Major validation
7. Phase 8 → Polish and final checks

---

## Notes

- No new tests are generated — the 59 existing backend tests cover server behaviour. Frontend validation is manual.
- ThousandSocket.js, GameApi.js, Toast.js, and HtmlUtil.js are NOT modified — they already use Antlion correctly.
- The HTML file gets one structural change (Phase 1) — wrapping screens in `<main id="app">`.
- CSS file is not modified.
- Antlion.js and EventBus.js are not modified (FR-011).
