# Antlion Engine — Architecture Plan

Game engine for the Thousand project. Vanilla JS (ES6+), no frameworks, no build tools.
HTML rendering first, canvas support later.

---

## 1. Current State

Antlion exists as a minimal engine in `src/public/js/antlion/` with two files:

- **EventBus.js** — pub/sub (on/off/emit/clear)
- **Antlion.js** — tick loop (rAF), input binding, scheduling, lifecycle (start/stop)

Current API:

```
onInput(type, handler)              — register named input handler
onTick(handler)                     — per-frame callback
emit(type, data)                    — dispatch event
bindInput(element, domEvent, type)  — wire DOM event to engine event
schedule(delay, cb)                 — setTimeout replacement
scheduleInterval(delay, cb)         — setInterval replacement
start() / stop()                    — lifecycle
```

**What's missing:** game objects, scene tree, containers, rendering model, behaviours.

---

## 2. Class Hierarchy

All engine classes live in `src/public/js/antlion/`. One class per file.

```
GameObject                  base: state, lifecycle, behaviours
  HtmlGameObject            owns one DOM element, dirty-flag rendering
    HtmlContainer           children management, tree traversal
Scene                       bridge between Antlion tick loop and object tree
Behaviour                   attachable component base class
```

### 2.1 GameObject

**File:** `src/public/js/antlion/GameObject.js` (~80 lines)

The abstract base. Holds state, lifecycle hooks, and the behaviour system.
Has no rendering opinion — this is the future hook point for canvas objects.

```js
class GameObject {
  constructor(name)

  // Identity
  name                  // string identifier
  parent                // reference to parent container (null for root)

  // State
  _enabled              // default true
  _visible              // default true

  // Behaviours
  _behaviours           // Map<string, Behaviour>

  // Lifecycle — override in subclasses
  onCreate()            // called once when added to the scene tree
  onDestroy()           // called once when removed from the scene tree
  update(dt)            // called each frame if enabled; also updates behaviours
  render()              // called each frame if enabled+visible (no-op in base)

  // State control
  enable() / disable() / setEnabled(bool)
  show() / hide() / setVisible(bool)
  isEnabled() / isVisible()

  // Behaviour management
  addBehaviour(name, behaviour)
  removeBehaviour(name)
  getBehaviour(name)

  // Tree access
  getScene()            // walks up parent chain to find Scene
  getEngine()           // shorthand: getScene().engine (the Antlion instance)
}
```

`update(dt)` iterates behaviours calling `behaviour.update(dt)`, then runs subclass logic.
`dt` is delta time in ms, passed down from the tick loop.

### 2.2 HtmlGameObject

**File:** `src/public/js/antlion/HtmlGameObject.js` (~70 lines)

Extends `GameObject`. Owns a single DOM element.

```js
class HtmlGameObject extends GameObject {
  constructor(name, tag = 'div')

  _element              // the owned DOM element (created in constructor)
  _dirty                // boolean flag for re-render

  get element()         // public accessor

  // Rendering
  render()              // if _dirty, calls renderContent(), clears flag
  renderContent()       // OVERRIDE POINT: populate _element
  markDirty()           // sets _dirty = true

  // Visibility maps to CSS
  show()                // super.show() + removes 'hidden' class
  hide()                // super.hide() + adds 'hidden' class

  // Input binding (delegates to engine)
  bindInput(domEvent, engineEvent)

  // DOM lifecycle
  onCreate()            // calls renderContent() for initial render
  onDestroy()           // removes _element from DOM, unbinds listeners
}
```

### 2.3 HtmlContainer

**File:** `src/public/js/antlion/HtmlContainer.js` (~90 lines)

Extends `HtmlGameObject`. Manages child game objects.

```js
class HtmlContainer extends HtmlGameObject {
  constructor(name, tag = 'div')

  _children             // ordered array of GameObject

  // Child management
  addChild(child)       // append child, set parent, insert DOM element, call onCreate()
  removeChild(child)    // call onDestroy(), remove from DOM, clear parent
  removeAllChildren()
  getChild(name)
  hasChild(name)

  // Tree traversal
  update(dt)            // super.update(dt), then iterate enabled children
  render()              // super.render(), then iterate enabled+visible children

  get children()        // shallow copy
}
```

When `addChild(child)` is called:
1. `child.parent = this`
2. `child._element` appended to `this._element` (DOM insertion)
3. `child.onCreate()` called

When `removeChild(child)` is called:
1. `child.onDestroy()` called (recursively destroys sub-children)
2. `child._element` removed from DOM
3. `child.parent = null`

Scene tree mirrors DOM tree — no reconciliation needed.

### 2.4 Scene

**File:** `src/public/js/antlion/Scene.js` (~60 lines)

The bridge between Antlion and the game object tree. Owns the root container.

```js
class Scene {
  constructor(engine, rootElement)

  engine                // the Antlion instance
  root                  // HtmlContainer wrapping rootElement (adopts it, does not create new)

  start()               // registers _tick with engine.onTick(), calls root.onCreate()
  stop()                // removes tick handler, calls root.onDestroy()

  _tick()               // computes dt, calls root.update(dt), root.render()
  _lastTime             // timestamp for dt calculation
}
```

The Scene computes delta time and passes it through the tree. It registers one
`onTick` handler with Antlion — that's the only integration point.

**No changes to Antlion.js required.**

### 2.5 Behaviour

**File:** `src/public/js/antlion/Behaviour.js` (~40 lines)

A lightweight attachable component. Enables reusable logic.

```js
class Behaviour {
  constructor()

  owner                 // set when attached to a GameObject
  _enabled              // boolean

  onAttach()            // called when added to a GameObject
  onDetach()            // called when removed
  update(dt)            // called each frame by owner's update()

  enable() / disable()
}
```

Behaviours access the engine via `this.owner.getEngine()`.

Examples of concrete behaviours (these live in feature dirs, not antlion/):
- `AnimationBehaviour` — tweens CSS properties over time
- `DragBehaviour` — makes an object draggable
- `TimerBehaviour` — counts down, emits event when done

---

## 3. GameObject Lifecycle

```
1. CONSTRUCT      const btn = new HtmlGameObject('bid-btn', 'button')
2. CONFIGURE      btn.addBehaviour('anim', new PulseBehaviour())
3. ADD TO TREE    container.addChild(btn)    --> onCreate(), DOM inserted
4. FRAME LOOP     scene._tick()
                    root.update(dt)          --> recursive, enabled only
                    root.render()            --> recursive, enabled+visible
5. STATE CHANGE   btn.markDirty()            --> renderContent() next frame
6. REMOVE         container.removeChild(btn) --> onDestroy(), DOM removed
```

Rules:
- `onCreate()` called exactly once when entering the tree via `addChild`
- `onDestroy()` called exactly once when leaving via `removeChild` (recursive)
- `update(dt)` only runs on enabled objects
- `render()` only runs on enabled AND visible objects
- Objects can exist outside the tree (constructed but not added) — they receive no updates

---

## 4. Rendering Model

**Dirty-flag rendering.** No virtual DOM, no diffing.

Each `HtmlGameObject` has a `_dirty` flag. Game logic calls `markDirty()` when
state changes. During the render traversal, `render()` calls `renderContent()`
only if `_dirty` is true, then clears the flag.

`renderContent()` is the override point — each subclass populates its own DOM element:

```js
class BidDisplay extends HtmlGameObject {
  constructor() {
    super('bid-display', 'div');
    this._currentBid = 0;
  }

  setBid(value) {
    this._currentBid = value;
    this.markDirty();
  }

  renderContent() {
    this._element.textContent = `Current bid: ${this._currentBid}`;
  }
}
```

For containers, children handle themselves — the container only renders its own
wrapper (CSS classes, attributes). Children render inside because their DOM
elements are appended to the container's DOM element.

CSS classes handle all visual styling. Objects set classes on `_element` in
constructor or `renderContent()`. Styling stays in CSS files.

---

## 5. Container Model — Screens and Stages

Screens (lobby, game) and game stages (bidding, playing, scoring) are
`HtmlContainer` instances. Two patterns for switching:

### Show/Hide — pre-built persistent screens

Build all top-level containers at startup. Toggle visibility.

```js
const lobby = new HtmlContainer('lobby');
const game  = new HtmlContainer('game');
scene.root.addChild(lobby);
scene.root.addChild(game);
game.hide();  // start with lobby visible

// Switch to game:
lobby.hide();
game.show();
```

Good for screens that persist state (lobby game list, chat).

### Add/Remove — dynamic stages

Only one stage exists in the tree at a time. Clean setup/teardown.

```js
// Transition from bidding to playing:
game.removeChild(biddingStage);   // onDestroy cleans up
game.addChild(playingStage);      // onCreate sets up fresh
```

Good for game stages where you want fresh state each time.

---

## 6. Integration with Existing Engine

```js
// index.js — entry point
const antlion = new Antlion();
const scene = new Scene(antlion, document.getElementById('app'));
scene.start();   // registers onTick internally
antlion.start();
```

- **Scene registers one `onTick` handler** — traverses the tree for update + render
- **EventBus used as-is** — objects communicate via `this.getEngine().emit()` / `onInput()`
- **`bindInput` works as-is** — `HtmlGameObject.bindInput()` wraps `engine.bindInput()`
- **Scheduling works as-is** — behaviours use `this.owner.getEngine().schedule()`
- **Antlion.js and EventBus.js stay unchanged**

### Listener cleanup

When an object is removed via `removeChild`, its `onDestroy()` must unbind DOM
listeners it registered. Each `HtmlGameObject` tracks its own bindings and
removes them in `onDestroy()`.

---

## 7. Usage Example — Thousand Game

### Game coordinator

```js
// src/public/js/thousand/ThousandGame.js
class ThousandGame extends HtmlContainer {
  constructor() {
    super('thousand-game');
    this._currentStage = null;
  }

  startBidding(gameState) {
    this._swapStage(new BiddingStage((action) => this._onBid(action)));
  }

  startPlaying(gameState) {
    this._swapStage(new PlayingStage(gameState));
  }

  _swapStage(stage) {
    if (this._currentStage) {
      this.removeChild(this._currentStage);
    }
    this._currentStage = stage;
    this.addChild(stage);
  }
}
```

### Bidding stage — container with children

```js
// src/public/js/thousand/stages/BiddingStage.js
class BiddingStage extends HtmlContainer {
  constructor(onBidPlaced) {
    super('bidding-stage');
    this._element.classList.add('stage', 'bidding-stage');
    this._bidDisplay = new BidDisplay();
    this._passBtn = new BidButton('pass-btn', 'Pass', () => onBidPlaced('pass'));
    this._bidBtn = new BidButton('bid-btn', 'Bid', () => onBidPlaced('bid'));
  }

  onCreate() {
    super.onCreate();
    this.addChild(this._bidDisplay);
    this.addChild(this._passBtn);
    this.addChild(this._bidBtn);
  }

  updateBid(value, playerName) {
    this._bidDisplay.setBid(value, playerName);
  }
}
```

### Leaf objects

```js
// src/public/js/thousand/objects/BidButton.js
class BidButton extends HtmlGameObject {
  constructor(name, label, onClick) {
    super(name, 'button');
    this._label = label;
    this._onClick = onClick;
    this._element.classList.add('btn');
  }

  onCreate() {
    super.onCreate();
    this.bindInput('click', `${this.name}-click`);
    this.getEngine().onInput(`${this.name}-click`, () => this._onClick());
  }

  renderContent() {
    this._element.textContent = this._label;
  }
}
```

---

## 8. File Structure

```
src/public/js/antlion/
  EventBus.js              # unchanged
  Antlion.js               # unchanged
  GameObject.js            # NEW — base class
  HtmlGameObject.js        # NEW — DOM element ownership
  HtmlContainer.js         # NEW — children management
  Scene.js                 # NEW — tick integration
  Behaviour.js             # NEW — component base

src/public/js/thousand/    # game-specific objects (future)
  ThousandGame.js
  stages/
    BiddingStage.js
    PlayingStage.js
    ScoringStage.js
  objects/
    Card.js
    CardHand.js
    PlayerZone.js
    BidDisplay.js
    BidButton.js
    ...
```

---

## 9. Future: Canvas Support

The architecture supports canvas without restructuring:

- `GameObject` has no rendering opinion — pure state + lifecycle
- Future `CanvasGameObject extends GameObject` adds `draw(ctx)` instead of DOM
- Future `CanvasContainer extends CanvasGameObject` manages children same way
- `Scene` detects rendering mode and calls `render()` (HTML) or `draw(ctx)` (canvas)
- Mixed mode possible — `HtmlContainer` with a `<canvas>` child element

---

## 10. Lobby Migration

The existing lobby (static HTML + ThousandApp/ThousandRenderer) continues working
unchanged. The game object system is for the card game and future features.

Optional migration path:
1. Add game object classes to `antlion/` — lobby code unchanged
2. Build the card game using game objects
3. (Optional) Migrate lobby screens to HtmlContainer subclasses
