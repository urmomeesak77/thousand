# Research: Antlion Engine Enhancement

**Date**: 2026-04-16

## R1. Adopting Existing DOM Elements

**Decision**: HtmlGameObject supports adopting pre-existing DOM elements via a static factory or constructor option.

**Rationale**: The lobby migration must preserve the existing `index.html` structure. Creating new DOM elements would require either duplicating the HTML or removing it from the HTML file and generating it in JS — both violate the "refactor only" constraint and Constitution §II (single-file frontend). By adopting existing elements, the HTML stays unchanged and the Scene tree mirrors the existing DOM.

**Alternatives considered**:
- *Generate all DOM from JS*: Would require removing HTML content from `index.html`, breaking the static-HTML-first design.
- *Keep HTML and overlay engine objects*: Would create dual ownership of DOM elements — brittle and confusing.

## R2. Scene Root Adoption

**Decision**: Scene constructor accepts an existing DOM element as the root. The root HtmlContainer wraps (adopts) this element rather than creating a new one.

**Rationale**: The architecture plan specifies `new Scene(antlion, document.getElementById('app'))`. Since `index.html` has no `#app` wrapper, the root element can be `document.body` or a wrapper `<div>` added to the HTML. Using `document.body` directly is simplest — no HTML changes needed.

**Alternatives considered**:
- *Add `<div id="app">` wrapper to HTML*: Would require modifying `index.html` structure and CSS selectors. Unnecessary complexity.
- *Use `document.body`*: Simplest, but body contains modals and toast outside the screen sections. This is actually fine — the root container can adopt body and all existing children remain in the DOM.

**Final choice**: Use a dedicated `<main id="app">` wrapper in `index.html` for the three screens. Modals and toast remain outside as direct body children (they are overlays and should not be part of the screen tree). This is a minimal HTML change (wrap three `<section>` elements in a `<main>`).

## R3. Lifecycle Timing for Adopted Elements

**Decision**: When a container adopts an existing element that already has children in the DOM, `onCreate()` is NOT called on those DOM children automatically — only on engine GameObjects explicitly added via `addChild()`.

**Rationale**: The DOM children (HTML markup) are passive content managed by `renderContent()`. Only GameObjects in the `_children` array participate in the engine lifecycle. This separation keeps the engine simple and avoids scanning/wrapping arbitrary DOM content.

## R4. Delta Time Source

**Decision**: Use `performance.now()` for delta time calculation in Scene, not the rAF timestamp.

**Rationale**: The Antlion tick loop uses `requestAnimationFrame` but does not pass the timestamp to tick handlers. Scene will call `performance.now()` internally to compute dt. This is independent of Antlion's implementation and works without modifying Antlion.js (FR-011).

## R5. Lobby Migration Strategy — Incremental vs. Big-Bang

**Decision**: Incremental migration. Build engine classes first (Phase A), then migrate lobby screens one at a time (Phase B).

**Rationale**: Incremental approach allows testing each screen independently. If something breaks, the blast radius is limited to one screen. The existing ThousandApp coordinator pattern maps naturally to a phased approach — each screen section can be migrated independently.

## R6. ThousandRenderer Elimination

**Decision**: Delete ThousandRenderer.js entirely. Its static methods are absorbed into HtmlGameObject subclasses.

**Rationale**: ThousandRenderer is a bag of static rendering functions — it has no state of its own (timers are class-level statics, not instance state). This maps directly to the HtmlGameObject model where each object owns its own rendering. Keeping ThousandRenderer alongside game objects would create dual responsibility.

**Migration map**:
- `showScreen()` → replaced by container `show()`/`hide()` calls
- `renderGameList()` → moves into a GameList HtmlGameObject's `renderContent()`
- `renderWaitingRoom()` / `renderWaitingRoomPlayers()` → moves into WaitingRoom container
- `startElapsedTimer()` / `stopElapsedTimer()` → moves into GameList object
- `startWaitingTimer()` / `stopWaitingTimer()` → moves into WaitingRoom object
- `init()` (tooltip setup) → moves into GameList or a Tooltip HtmlGameObject
- `_formatElapsed()` → utility function, kept as a module-level helper or on a shared utility
