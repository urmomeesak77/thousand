# Feature Specification: Antlion Engine Enhancement

**Feature Branch**: `002-antlion-engine-enhancement`  
**Created**: 2026-04-16  
**Status**: Draft  
**Input**: User description: "Enhance Antlion engine with game object hierarchy, scene management, behaviours, and dirty-flag rendering as described in the architecture plan. Migrate the lobby to use the engine's object model."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Game Objects Render on Screen (Priority: P1)

A developer creates game objects (e.g., a button, a display panel) that own their own portion of the screen. Each object manages its own content and updates only when its state changes. Objects appear, update, and disappear correctly as the application runs.

**Why this priority**: Game objects are the foundation of the entire engine. Without them, no other feature (containers, scenes, behaviours) can function.

**Independent Test**: Create a single game object that displays text, change its state, and verify the screen updates only when the state changes — not every frame.

**Acceptance Scenarios**:

1. **Given** a game object is created with a display area, **When** it is added to the active scene, **Then** it appears on screen with its initial content rendered.
2. **Given** a visible game object, **When** its state is changed (e.g., text updated), **Then** the display refreshes to show the new content on the next frame.
3. **Given** a visible game object, **When** its state has NOT changed, **Then** no re-rendering occurs for that object (dirty-flag optimization).
4. **Given** a game object, **When** it is removed from the scene, **Then** it disappears from the screen and releases its resources.

---

### User Story 2 - Containers Organize Objects into Groups (Priority: P1)

A developer groups related game objects into containers. Containers manage their children — adding, removing, and traversing them. The visual hierarchy on screen mirrors the logical hierarchy of containers and their children.

**Why this priority**: Containers enable composition — screens, panels, and stages all depend on grouping objects together. This is co-equal with game objects for building any meaningful UI.

**Independent Test**: Create a container, add two child objects to it, verify both appear on screen inside the container. Remove one child and verify it disappears while the other remains.

**Acceptance Scenarios**:

1. **Given** a container with two child objects, **When** the scene renders, **Then** both children are visible within the container's area.
2. **Given** a container, **When** a child is removed, **Then** the child disappears from the screen and the container continues functioning with remaining children.
3. **Given** a container that is hidden, **When** the scene renders, **Then** neither the container nor any of its children are visible.
4. **Given** a nested container structure (container inside container), **When** the parent container updates, **Then** all descendants update in the correct order.

---

### User Story 3 - Scene Bridges the Engine and Object Tree (Priority: P1)

The scene connects the engine's frame loop to the game object tree. Each frame, the scene computes elapsed time and propagates update and render calls through the entire object hierarchy.

**Why this priority**: Without the scene, game objects have no connection to the engine's tick loop — they would never update or render.

**Independent Test**: Create a scene with a root container, start the engine, and verify that objects in the tree receive regular update calls with correct time deltas.

**Acceptance Scenarios**:

1. **Given** a scene with a populated object tree, **When** the engine is running, **Then** all enabled objects receive update calls each frame with the time elapsed since the last frame.
2. **Given** a scene with visible objects, **When** the engine is running, **Then** all enabled and visible objects receive render calls each frame.
3. **Given** a scene, **When** it is stopped, **Then** no further update or render calls are dispatched to the object tree.

---

### User Story 4 - Behaviours Add Reusable Logic to Objects (Priority: P2)

A developer attaches reusable logic components (behaviours) to any game object. Behaviours run each frame alongside their owner and can be enabled/disabled independently. The same behaviour type can be attached to multiple different objects.

**Why this priority**: Behaviours enable code reuse across objects (e.g., animation, drag-and-drop, timers). Important but not blocking for the core object/container/scene system.

**Independent Test**: Create a behaviour that counts elapsed time, attach it to an object, and verify it increments each frame. Disable the behaviour and verify it stops updating.

**Acceptance Scenarios**:

1. **Given** a behaviour attached to a game object, **When** the object updates each frame, **Then** the behaviour also updates with the same time delta.
2. **Given** an enabled behaviour, **When** it is disabled, **Then** it stops receiving update calls while the owning object continues updating.
3. **Given** a behaviour, **When** it is removed from its owner, **Then** it stops receiving updates and its cleanup logic runs.
4. **Given** two objects each with the same type of behaviour, **When** both objects update, **Then** each behaviour instance operates independently on its own owner.

---

### User Story 5 - Lobby Uses the Engine's Object Model (Priority: P2)

The existing lobby screens (nickname entry, game list, waiting room) are represented as engine objects within the scene tree. Users experience no functional difference — the lobby looks and behaves identically — but it now participates in the engine's lifecycle, rendering, and event system through the object hierarchy rather than through direct DOM manipulation.

**Why this priority**: Migrating the lobby validates the engine in a real scenario and unifies the application under one architecture. It depends on Stories 1-3 being complete.

**Independent Test**: Open the application, complete the full lobby flow (enter nickname, browse games, create/join a game, see the waiting room, leave a game), and verify all interactions work identically to before the migration.

**Acceptance Scenarios**:

1. **Given** the application loads, **When** the user enters a nickname, **Then** the lobby screen appears with the game list, just as before.
2. **Given** the lobby screen is visible, **When** a game is created or joined, **Then** the waiting room screen appears with correct game and player information.
3. **Given** the waiting room is visible, **When** the user leaves the game, **Then** the lobby screen reappears with the game list.
4. **Given** the lobby is running as engine objects, **When** the user interacts with any lobby element (buttons, forms, game list selection, invite codes, modals), **Then** the behaviour is identical to the current implementation.
5. **Given** real-time updates arrive (new games, player joins/leaves, game disbanded), **When** displayed in the lobby, **Then** they appear immediately with no lag compared to the current implementation.

---

### Edge Cases

- What happens when a game object is added to a container that is not yet part of the scene? It should not receive lifecycle calls until the container joins the scene.
- How does the system handle removing a container that has deeply nested children? All descendants must be cleaned up recursively.
- What happens when a behaviour is attached to an object that is already in the scene? The behaviour's initialization should run immediately.
- What happens if the same object is added to two different containers? This must be prevented — an object can only have one parent.
- What happens during screen transitions (lobby to waiting room) if a real-time update arrives? The update should be processed correctly regardless of which screen is active.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a base game object with lifecycle hooks (creation, destruction, per-frame update, per-frame render) and enable/disable/show/hide state controls.
- **FR-002**: System MUST provide a game object variant that owns a single display element and uses dirty-flag rendering — only re-rendering its content when explicitly marked as changed.
- **FR-003**: System MUST provide a container object that manages an ordered list of child objects, supporting add, remove, remove-all, and lookup operations.
- **FR-004**: When a child is added to a container, the system MUST insert the child's display element into the container's display area and invoke the child's creation lifecycle hook exactly once.
- **FR-005**: When a child is removed from a container, the system MUST invoke the child's destruction lifecycle hook (recursively for all descendants), remove the child's display element, and clear the parent reference.
- **FR-006**: System MUST provide a scene that bridges the engine's frame loop and the object tree — computing time deltas and propagating update (to all enabled objects) and render (to all enabled and visible objects) each frame.
- **FR-007**: System MUST provide a behaviour base that can be attached to and detached from any game object, receiving per-frame update calls when both the behaviour and its owner are enabled.
- **FR-008**: An object MUST have at most one parent container at any time. Adding an object that already has a parent to a different container MUST either move it or reject the operation.
- **FR-009**: The lobby MUST be represented as engine objects within the scene tree, covering all existing screens: nickname entry, game list/lobby, and waiting room.
- **FR-010**: The migrated lobby MUST preserve all existing user-facing functionality: nickname entry and validation, game creation (with game-type selection modal), game joining (by selection and by invite code), invite code copying, game list real-time updates, waiting room player list updates, leave-game confirmation, and game-disbanded handling.
- **FR-011**: The existing engine core (tick loop, event bus, input binding, scheduling) can remain unchanged — the object system integrates through the existing public interface.

### Key Entities

- **GameObject**: The abstract base unit — holds state, lifecycle, and behaviours. Has no rendering opinion.
- **HtmlGameObject**: A game object that owns a single display element. Uses dirty-flag rendering.
- **HtmlContainer**: A game object that manages an ordered collection of child objects, mirroring logical hierarchy to visual hierarchy.
- **Scene**: The bridge between the engine tick loop and the game object tree. Computes delta time and propagates update/render calls.
- **Behaviour**: A reusable, attachable logic component that runs alongside its owning game object.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can compose a UI from game objects and containers, and it renders correctly on screen within one frame of being added to the scene.
- **SC-002**: Objects with unchanged state skip rendering entirely — only dirty objects re-render their content each frame.
- **SC-003**: The full lobby user flow (nickname entry through game join/leave) works identically after migration, with no user-visible differences in behaviour or appearance.
- **SC-004**: 100% of existing lobby interactions (forms, buttons, modals, real-time updates) function correctly through the engine object model.
- **SC-005**: Removing a container with 3+ levels of nesting correctly cleans up all descendants — no orphaned display elements or lingering event handlers.
- **SC-006**: A behaviour can be attached, detached, enabled, and disabled at any point during an object's lifecycle without errors or missed frames.

## Assumptions

- The lobby migration is a refactor — the visual design (HTML structure, CSS styling) remains the same. Only the code organization changes.
- Canvas rendering support is out of scope. Only HTML-based rendering is included.
- Concrete behaviours (animation, drag, timer) are out of scope. Only the behaviour base class is included.
- Game-specific objects (card game stages, cards, player zones) are out of scope. Only the engine classes and the lobby migration are included.
- The lobby currently uses static HTML with show/hide screen switching. The migration will adopt the same show/hide pattern using engine containers.
- Performance is not a concern for the lobby (few objects, infrequent updates). The dirty-flag system is primarily valuable for the future card game.
