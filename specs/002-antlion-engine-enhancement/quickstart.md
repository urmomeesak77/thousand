# Quickstart: Antlion Engine Enhancement

**Date**: 2026-04-16

## Prerequisites

- Node.js v18+
- `npm install` (for `ws` package and dev dependencies)

## Development

```bash
npm start          # Start server at http://localhost:3000
npm test           # Run all tests (59 backend tests)
npm run lint       # ESLint check
```

## New Engine Classes

After this feature, the Antlion engine adds 5 files to `src/public/js/antlion/`:

| Class | File | Lines | Purpose |
|-------|------|-------|---------|
| Behaviour | Behaviour.js | ~40 | Attachable component base |
| GameObject | GameObject.js | ~80 | Base: state, lifecycle, behaviours |
| HtmlGameObject | HtmlGameObject.js | ~70 | DOM element + dirty-flag rendering |
| HtmlContainer | HtmlContainer.js | ~90 | Children management + tree traversal |
| Scene | Scene.js | ~60 | Bridge engine tick loop to object tree |

## Usage Pattern

```js
// 1. Create engine and scene
const antlion = new Antlion();
const scene = new Scene(antlion, document.getElementById('app'));

// 2. Create game objects
const panel = new HtmlContainer('panel');
const label = new HtmlGameObject('label', 'span');

// 3. Build tree
scene.root.addChild(panel);
panel.addChild(label);

// 4. Start
scene.start();
antlion.start();
```

## Lobby Migration

The lobby (ThousandApp, ThousandRenderer, ModalController) is refactored to use engine objects. The HTML and CSS remain unchanged. ThousandRenderer is deleted — its logic moves into HtmlGameObject subclasses.

## Verification Checklist

1. `npm test` — all 59 tests pass
2. `npm run lint` — no errors
3. Open http://localhost:3000 — full lobby flow works
4. No `addEventListener`, `setTimeout`, `setInterval`, or `requestAnimationFrame` calls outside Antlion
