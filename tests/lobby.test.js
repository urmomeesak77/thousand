'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const publicDir = path.join(__dirname, '..', 'src', 'public');
let inlinedHTML;

before(() => {
  // Read source files
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(publicDir, 'css', 'index.css'), 'utf8');

  // Files in dependency order — mirrors the import graph in the ES modules
  const jsFiles = [
    path.join(publicDir, 'js', 'antlion', 'EventBus.js'),
    path.join(publicDir, 'js', 'antlion', 'Antlion.js'),
    path.join(publicDir, 'js', 'antlion', 'Behaviour.js'),
    path.join(publicDir, 'js', 'antlion', 'GameObject.js'),
    path.join(publicDir, 'js', 'antlion', 'HtmlGameObject.js'),
    path.join(publicDir, 'js', 'antlion', 'HtmlContainer.js'),
    path.join(publicDir, 'js', 'antlion', 'Scene.js'),
    path.join(publicDir, 'js', 'Toast.js'),
    path.join(publicDir, 'js', 'utils', 'HtmlUtil.js'),
    path.join(publicDir, 'js', 'IdentityStore.js'),
    path.join(publicDir, 'js', 'ReconnectOverlay.js'),
    path.join(publicDir, 'js', 'ThousandSocket.js'),
    path.join(publicDir, 'js', 'GameApi.js'),
    path.join(publicDir, 'js', 'ModalController.js'),
    path.join(publicDir, 'js', 'NicknameScreen.js'),
    path.join(publicDir, 'js', 'GameList.js'),
    path.join(publicDir, 'js', 'PlayerTooltip.js'),
    path.join(publicDir, 'js', 'WaitingRoom.js'),
    path.join(publicDir, 'js', 'ThousandApp.js'),
    path.join(publicDir, 'js', 'index.js'),
  ];

  // Strip ES module syntax for jsdom inline execution.
  // Each file is wrapped in an IIFE so local `const` declarations (e.g. $)
  // don't collide across files. `export default Foo` → `window.Foo = Foo`;
  // `export class Foo` → `class Foo` + `window.Foo = Foo` appended inside IIFE.
  const combinedJs = jsFiles.map((filePath) => {
    const js = fs.readFileSync(filePath, 'utf8');
    const exportedClasses = [];
    const stripped = js
      .replace(/^import\s+(?:\{[^}]+\}|\w+)\s+from\s+['"][^'"]+['"];\s*$/gm, '')
      .replace(/^export default\s+(\w+);\s*$/gm, (_, name) => `window.${name} = ${name};`)
      .replace(/^export class (\w+)/gm, (_, name) => { exportedClasses.push(name); return `class ${name}`; });
    const windowAssignments = exportedClasses.map((n) => `window.${n} = ${n};`).join('\n');
    return `(function () {\n${stripped}\n${windowAssignments}\n})();`;
  }).join('\n');

  inlinedHTML = html
    .replace(/<link[^>]+index\.css[^>]*>/i, `<style>${css}</style>`)
    .replace(/<script[^>]+src="[^"]*index\.js"[^>]*><\/script>/i, `<script>${combinedJs}</script>`);
});

/**
 * Creates a fresh JSDOM instance with inlined lobby HTML.
 * Returns { window, document, close } — call close() at the end of each test
 * to release JSDOM-managed timers and prevent the event loop from hanging.
 */
function createLobbyDOM() {
  const dom = new JSDOM(inlinedHTML, {
    runScripts: 'dangerously',
    url: 'http://localhost:3000',
    beforeParse(window) {
      // Mock WebSocket — deferred so DOMContentLoaded fires first
      window.WebSocket = class MockWebSocket {
        constructor(url) {
          this.url = url;
          this.readyState = 1; // OPEN
          // Register on window so tests can reach it
          window._lobbyWS = this;
          // Defer open so event listeners are attached first
          setTimeout(() => { if (this.onopen) this.onopen(); }, 0);
        }
        send() {}
        close() { this.readyState = 3; }
      };

      // Stub fetch
      window.fetch = async (url, opts = {}) => ({
        ok: true,
        status: 200,
        json: async () => ({ gameId: 'test-game', inviteCode: null }),
      });
    },
  });

  return { window: dom.window, document: dom.window.document, close: () => dom.window.close() };
}

// Deliver a WS message to the mock socket
function deliverWS(window, msg) {
  const ws = window._lobbyWS;
  if (ws && ws.onmessage) {
    ws.onmessage({ data: JSON.stringify(msg) });
  }
}

// ---------------------------------------------------------------------------
// T016 – Lobby game-list rendering from lobby_update WS message
// ---------------------------------------------------------------------------

describe('Lobby game-list rendering', () => {
  it('renders game rows when lobby_update arrives with games', async () => {
    const { window, document, close } = createLobbyDOM();
    await new Promise((r) => setTimeout(r, 50));

    deliverWS(window, {
      type: 'lobby_update',
      games: [
        { id: 'g1', playerCount: 1, maxPlayers: 4 },
        { id: 'g2', playerCount: 2, maxPlayers: 4 },
      ],
    });
    await new Promise((r) => setTimeout(r, 20));

    const gameList = document.getElementById('game-list');
    assert.ok(gameList, '#game-list element must exist');
    const items = gameList.querySelectorAll('li');
    assert.equal(items.length, 2, 'should render 2 game rows');
    close();
  });

  it('shows empty state when lobby_update arrives with empty array', async () => {
    const { window, document, close } = createLobbyDOM();
    await new Promise((r) => setTimeout(r, 50));

    deliverWS(window, { type: 'lobby_update', games: [] });
    await new Promise((r) => setTimeout(r, 20));

    const gameList = document.getElementById('game-list');
    const emptyState = document.getElementById('empty-state');
    const hasEmptyMsg = (emptyState && !emptyState.classList.contains('hidden')) ||
      (gameList && gameList.children.length === 0);
    assert.ok(hasEmptyMsg, 'should show empty state when no games');
    close();
  });

  it('clears old rows and re-renders on second lobby_update', async () => {
    const { window, document, close } = createLobbyDOM();
    await new Promise((r) => setTimeout(r, 50));

    deliverWS(window, { type: 'lobby_update', games: [
      { id: 'g1', playerCount: 1, maxPlayers: 4 },
      { id: 'g2', playerCount: 2, maxPlayers: 4 },
    ] });
    await new Promise((r) => setTimeout(r, 20));

    deliverWS(window, { type: 'lobby_update', games: [
      { id: 'g3', playerCount: 3, maxPlayers: 4 },
    ] });
    await new Promise((r) => setTimeout(r, 20));

    const gameList = document.getElementById('game-list');
    assert.equal(gameList.querySelectorAll('li').length, 1);
    close();
  });
});

// ---------------------------------------------------------------------------
// T025 – Create game modal (US2)
// ---------------------------------------------------------------------------

describe('Create game modal', () => {
  it('"New Game" button exists in the DOM', async () => {
    const { document, close } = createLobbyDOM();
    await new Promise((r) => setTimeout(r, 50));
    const btn = document.getElementById('new-game-btn');
    assert.ok(btn, '#new-game-btn must exist');
    close();
  });

  it('modal appears when New Game button is clicked', async () => {
    const { document, close } = createLobbyDOM();
    await new Promise((r) => setTimeout(r, 50));

    const btn = document.getElementById('new-game-btn');
    assert.ok(btn);
    btn.click();
    await new Promise((r) => setTimeout(r, 20));

    const modal = document.getElementById('new-game-modal');
    assert.ok(modal, '#new-game-modal must exist');
    const isVisible = !modal.classList.contains('hidden') && modal.style.display !== 'none' && !modal.hidden;
    assert.ok(isVisible, 'modal should be visible after clicking New Game');
    close();
  });

  it('modal has Public/Private radio buttons', async () => {
    const { document, close } = createLobbyDOM();
    await new Promise((r) => setTimeout(r, 50));

    const publicRadio = document.querySelector('input[name="game-type"][value="public"]');
    const privateRadio = document.querySelector('input[name="game-type"][value="private"]');
    assert.ok(publicRadio, 'Public radio must exist');
    assert.ok(privateRadio, 'Private radio must exist');
    close();
  });
});

// ---------------------------------------------------------------------------
// T044 – Empty state message
// ---------------------------------------------------------------------------

describe('Empty state', () => {
  it('displays empty-state message when game list is empty', async () => {
    const { window, document, close } = createLobbyDOM();
    await new Promise((r) => setTimeout(r, 50));

    deliverWS(window, { type: 'lobby_update', games: [] });
    await new Promise((r) => setTimeout(r, 20));

    const emptyState = document.getElementById('empty-state');
    const gameList = document.getElementById('game-list');
    const hasEmpty = (emptyState && !emptyState.classList.contains('hidden')) ||
      (gameList && gameList.children.length === 0);
    assert.ok(hasEmpty, 'empty state should be shown with no games');
    close();
  });
});
