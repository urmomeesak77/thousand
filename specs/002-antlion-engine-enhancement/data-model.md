# Data Model: Antlion Engine Enhancement

**Date**: 2026-04-16

## Engine Entities

### GameObject

The abstract base unit of the engine. Holds state, lifecycle, and behaviours.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Unique identifier within parent container |
| parent | HtmlContainer or null | Reference to parent container |
| _enabled | boolean (default: true) | Whether update() runs each frame |
| _visible | boolean (default: true) | Whether render() runs each frame |
| _behaviours | Map<string, Behaviour> | Attached behaviour components |

**Lifecycle hooks**: `onCreate()`, `onDestroy()`, `update(dt)`, `render()`
**State controls**: `enable()`, `disable()`, `setEnabled(bool)`, `show()`, `hide()`, `setVisible(bool)`
**Tree access**: `getScene()`, `getEngine()`

### HtmlGameObject (extends GameObject)

Owns a single DOM element. Uses dirty-flag rendering.

| Field | Type | Description |
|-------|------|-------------|
| _element | HTMLElement | The owned DOM element |
| _dirty | boolean (default: true) | Re-render flag |

**Rendering**: `markDirty()` sets flag; `render()` calls `renderContent()` if dirty, then clears flag.
**Override point**: `renderContent()` — subclasses populate `_element` here.
**DOM lifecycle**: `onCreate()` calls initial `renderContent()`; `onDestroy()` removes element from DOM.

### HtmlContainer (extends HtmlGameObject)

Manages an ordered collection of child GameObjects.

| Field | Type | Description |
|-------|------|-------------|
| _children | Array<GameObject> | Ordered child list |

**Child operations**: `addChild(child)`, `removeChild(child)`, `removeAllChildren()`, `getChild(name)`, `hasChild(name)`
**Traversal**: `update(dt)` and `render()` propagate to children after self.

**Invariant**: A child can have at most one parent. `addChild` on a child that already has a parent removes it from the old parent first.

### Scene

Bridge between the Antlion tick loop and the game object tree.

| Field | Type | Description |
|-------|------|-------------|
| engine | Antlion | The engine instance |
| root | HtmlContainer | Root container wrapping the root DOM element |
| _lastTime | number | Timestamp for delta time computation |

**Lifecycle**: `start()` registers `_tick` with engine; `stop()` removes it.
**Tick**: `_tick()` computes `dt`, calls `root.update(dt)`, `root.render()`.

### Behaviour

Reusable logic component attached to a GameObject.

| Field | Type | Description |
|-------|------|-------------|
| owner | GameObject or null | The object this behaviour is attached to |
| _enabled | boolean (default: true) | Whether update() runs |

**Lifecycle**: `onAttach()`, `onDetach()`, `update(dt)`
**State**: `enable()`, `disable()`

## Relationships

```
Scene 1──1 Antlion (engine reference)
Scene 1──1 HtmlContainer (root)
HtmlContainer 1──* GameObject (children)
GameObject 1──* Behaviour (components)
GameObject *──1 HtmlContainer (parent, nullable)
```

## State Transitions

### GameObject Lifecycle

```
CONSTRUCTED → (addChild) → IN_TREE → (removeChild) → DESTROYED
                             ↑                          |
                             └── can be re-added ───────┘
```

- CONSTRUCTED: exists but receives no update/render calls
- IN_TREE: receives update (if enabled) and render (if enabled+visible) each frame
- DESTROYED: `onDestroy()` called, element removed from DOM

### Scene Lifecycle

```
CREATED → (start) → RUNNING → (stop) → STOPPED
```
