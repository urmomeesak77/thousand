# Implementation Plan: Antlion Engine Enhancement

**Branch**: `001-card-game-lobby` | **Date**: 2026-04-16 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/002-antlion-engine-enhancement/spec.md`

## Summary

Extend the Antlion engine with a game object hierarchy (GameObject → HtmlGameObject → HtmlContainer), a Scene bridge for the tick loop, and a Behaviour component system. Then migrate the existing lobby (ThousandApp, ThousandRenderer, ModalController) to use the engine's object model via HtmlContainer subclasses — preserving identical user-facing behaviour while unifying the frontend under a single architecture.

## Technical Context

**Language/Version**: Node.js v18+ (CommonJS backend) / Vanilla JS ES6+ (frontend, ES modules)
**Primary Dependencies**: `ws` npm package (backend WebSocket); no frontend dependencies
**Storage**: N/A (in-memory backend state)
**Testing**: Node.js built-in test runner (`node --test`), pre-commit hooks run ESLint + tests
**Target Platform**: Modern browsers (ES6+ module support), Node.js v18+ server
**Project Type**: Web application (game lobby + future card game)
**Performance Goals**: 60fps tick loop (already achieved by rAF); lobby has few objects so no bottleneck
**Constraints**: No build tools, no frameworks, no TypeScript. Constitution §I–§V enforced.
**Scale/Scope**: ~10 frontend files modified/created, 5 new engine classes, lobby migration of 3 existing modules

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| §I Stack | PASS | Vanilla JS, no frameworks, no build tools |
| §II Single-File Frontend | PASS | index.html remains the single HTML file. JS modules loaded via `<script type="module">` |
| §III Simplicity First | PASS | Each new class is ~40-90 lines. No speculative abstractions — only what the plan requires |
| §V No Build Step | PASS | All files served as-is, ES modules, no transpilation |
| §VII Classes Over Functions | PASS | All new entities are ES6 classes |
| §VIII One Class Per File | PASS | Each engine class in its own file in `antlion/` |
| §IX Small Units | PASS | Largest class (HtmlContainer) estimated ~90 lines |
| §XI All Logic Through Antlion | PASS | Scene registers via `onTick`; objects use `bindInput`/`emit`. No direct DOM listeners. |

**No violations. No Complexity Tracking needed.**

## Project Structure

### Documentation (this feature)

```text
specs/002-antlion-engine-enhancement/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/           # Phase 1 output (internal — no external APIs added)
```

### Source Code (repository root)

```text
src/public/js/antlion/          # Engine layer — 5 NEW files, 2 unchanged
  EventBus.js                   # UNCHANGED
  Antlion.js                    # UNCHANGED
  GameObject.js                 # NEW — base class: state, lifecycle, behaviours
  HtmlGameObject.js             # NEW — DOM element ownership, dirty-flag rendering
  HtmlContainer.js              # NEW — children management, tree traversal
  Scene.js                      # NEW — bridge between Antlion tick loop and object tree
  Behaviour.js                  # NEW — attachable component base class

src/public/js/                  # Lobby migration — MODIFIED files
  index.js                      # MODIFIED — create Scene, wire up lobby containers
  ThousandApp.js                # MODIFIED — refactor to use engine objects for screens
  ThousandRenderer.js           # DELETE — rendering moves into HtmlGameObject subclasses
  ModalController.js            # MODIFIED — becomes/wraps an HtmlGameObject
  ThousandSocket.js             # UNCHANGED (already uses Antlion API)
  GameApi.js                    # UNCHANGED (pure HTTP, no DOM)
  Toast.js                      # UNCHANGED (already uses Antlion API)
  utils/HtmlUtil.js             # UNCHANGED

src/public/index.html           # UNCHANGED — static HTML structure stays identical
src/public/css/index.css        # UNCHANGED — no style changes

tests/                          # Existing backend tests — no changes needed
```

**Structure Decision**: Flat layout within `antlion/` for engine classes (all game-agnostic). Lobby modules stay in `src/public/js/` at top level — they are feature modules that register into the engine.

## Implementation Phases

### Phase A: Engine Core Classes (P1 — Stories 1, 2, 3)

Build the 5 new engine classes in dependency order. Each class is self-contained with no changes to existing code.

#### A1. `Behaviour.js` (~40 lines)
- Base class with `owner`, `_enabled`, `onAttach()`, `onDetach()`, `update(dt)`, `enable()`, `disable()`
- No dependencies on other new classes

#### A2. `GameObject.js` (~80 lines)
- `name`, `parent`, `_enabled`, `_visible`
- `_behaviours` Map — `addBehaviour(name, b)`, `removeBehaviour(name)`, `getBehaviour(name)`
- Lifecycle stubs: `onCreate()`, `onDestroy()`, `update(dt)`, `render()`
- `update(dt)` iterates behaviours, calling `behaviour.update(dt)` for enabled ones
- `getScene()` — walks parent chain to find Scene
- `getEngine()` — `getScene().engine`
- State: `enable()`, `disable()`, `show()`, `hide()`, `setEnabled(bool)`, `setVisible(bool)`

#### A3. `HtmlGameObject.js` (~70 lines)
- Extends `GameObject`
- Constructor takes `(name, tag='div')`, creates `document.createElement(tag)`
- `_dirty` flag, `markDirty()`, `render()` calls `renderContent()` if dirty
- `renderContent()` — override point (no-op in base)
- `show()`/`hide()` — toggle `hidden` CSS class + super
- `bindInput(domEvent, engineEvent)` — delegates to `this.getEngine().bindInput(this._element, domEvent, engineEvent)`
- `onCreate()` calls `renderContent()` for initial render
- `onDestroy()` removes `_element` from DOM

#### A4. `HtmlContainer.js` (~90 lines)
- Extends `HtmlGameObject`
- `_children` array
- `addChild(child)`: set parent, append DOM element, call `onCreate()`. If child already has parent, remove from old parent first (FR-008).
- `removeChild(child)`: call `onDestroy()` recursively, remove DOM element, clear parent
- `removeAllChildren()`, `getChild(name)`, `hasChild(name)`
- `update(dt)`: super, then iterate enabled children
- `render()`: super, then iterate enabled+visible children
- `get children()`: returns shallow copy

#### A5. `Scene.js` (~60 lines)
- Constructor takes `(engine, rootElement)`
- Creates root `HtmlContainer` that **adopts** `rootElement` (does not create new element)
- `start()`: registers `_tick` via `engine.onTick()`, calls `root.onCreate()`
- `stop()`: removes tick handler, calls `root.onDestroy()`
- `_tick()`: computes dt from `performance.now()`, calls `root.update(dt)`, `root.render()`
- Stores `_lastTime` for delta calculation

**Key design decision for HtmlContainer adopting existing elements**: The Scene root and lobby screen containers will adopt pre-existing DOM elements from `index.html` rather than creating new ones. This is critical for the lobby migration — the HTML structure stays identical.

To support this, `HtmlGameObject` needs an alternate constructor path or a static factory: `HtmlGameObject.adopt(name, element)` that takes an existing DOM element instead of creating one. This keeps the HTML file unchanged.

### Phase B: Lobby Migration (P2 — Story 5)

Refactor the lobby to use engine objects. The HTML stays identical. The migration replaces ThousandRenderer's static methods and ThousandApp's direct DOM manipulation with HtmlContainer/HtmlGameObject subclasses.

#### B1. Refactor `index.js` — Create Scene
- Create `Scene` with `document.body` or a wrapper element as root
- Lobby screens become HtmlContainer children of the scene root
- `antlion.start()` after `scene.start()`

#### B2. Refactor `ThousandApp.js` — Screen switching via show/hide
- Screens (nickname, lobby, game) are HtmlContainer instances that **adopt** existing `<section>` elements
- Screen switching: `nicknameScreen.show()` / `lobbyScreen.hide()` etc.
- ThousandApp holds references to screen containers instead of using `$('screen-id')`
- All `bindInput`/`onInput` calls move into the appropriate screen's `onCreate()` or stay in ThousandApp (coordinator pattern)

#### B3. Migrate rendering into game objects
- **GameListObject** (extends HtmlGameObject): adopts `#game-list` `<ul>`, owns `renderGameList(games)` logic from ThousandRenderer
- **WaitingRoomContainer** (extends HtmlContainer): adopts `#game-screen .card`, owns player list rendering
- **TooltipObject** (extends HtmlGameObject): manages the player tooltip
- Timer logic (elapsed time, waiting time) moves into the owning objects using `antlion.scheduleInterval`

#### B4. Delete `ThousandRenderer.js`
- All static methods have been absorbed into game objects
- Remove import from ThousandApp

#### B5. Update `ModalController.js`
- Wrap as or integrate with an HtmlGameObject that adopts the modal element
- Input bindings move into `onCreate()`

### Phase C: Behaviour Base (P2 — Story 4)

Already built in A1. This phase just validates it works when attached to lobby objects — no additional code needed since concrete behaviours are out of scope.

## Verification

1. **Unit check**: Run `npm test` — all 59 existing backend tests must pass (no backend changes)
2. **Lint check**: Run `npm run lint` — no new lint errors
3. **Manual lobby flow**:
   - `npm start`, open browser
   - Enter nickname → verify lobby screen appears
   - Create public game → verify waiting room
   - Open second browser tab, join game → verify player list updates in real-time
   - Leave game → verify return to lobby
   - Create private game → verify invite code, copy code, join from other tab
   - Verify toast notifications work
   - Verify game list elapsed timers tick
   - Verify tooltip on player count hover
4. **Edge cases**:
   - Refresh page during waiting room → reconnect works
   - Host disconnects → guest sees "game disbanded" toast, returns to lobby
   - Rapid screen switching → no DOM errors in console
5. **Dirty-flag check**: Add `console.log` in `renderContent()` of a lobby object, verify it only fires when state changes (not every frame)
