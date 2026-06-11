'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');
const { makeT } = require('./helpers/loadI18n');

// ---------------------------------------------------------------------------
// jsdom setup — load WaitingRoom + its antlion base classes in dependency order
// ---------------------------------------------------------------------------

let dom;

// The DOM nodes WaitingRoom.renderContent() reads/writes.
function buildWaitingRoomDom(document) {
  document.body.innerHTML = `
    <section id="game-screen">
      <div class="card">
        <p id="game-id-display"></p>
        <div class="hidden" id="invite-display"></div>
        <span id="invite-code-value"></span>
        <ul id="player-list"></ul>
        <p class="waiting-hint">Waiting for players…</p>
      </div>
    </section>`;
}

beforeEach(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  loadModule(dom, 'antlion/EventBus.js');
  loadModule(dom, 'antlion/GameObject.js');
  loadModule(dom, 'antlion/HtmlGameObject.js');
  loadModule(dom, 'antlion/HtmlContainer.js');
  loadModule(dom, 'utils/HtmlUtil.js');
  loadModule(dom, 'screens/WaitingRoom.js');
  buildWaitingRoomDom(dom.window.document);
});

function makeWaitingRoom() {
  const card = dom.window.document.querySelector('.card');
  return new dom.window.WaitingRoom(card, makeT(dom, { language: 'en' }));
}

function players(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nickname: `P${i}` }));
}

function hintText() {
  return dom.window.document.querySelector('.waiting-hint').textContent;
}

// ---------------------------------------------------------------------------
// per FR-003 — required-player threshold is player-count-aware
// ---------------------------------------------------------------------------

describe('WaitingRoom — required-player threshold (FR-003)', () => {
  it('shows "(3 needed to start)" for a 3-player room', () => {
    const wr = makeWaitingRoom();
    wr.load('g1', null, players(1), 3);
    assert.ok(hintText().includes('(3 needed to start)'));
  });

  it('shows "(4 needed to start)" for a 4-player room', () => {
    const wr = makeWaitingRoom();
    wr.load('g1', null, players(2), 4);
    // per FR-020 — waiting hint reflects the configured player count, not a fixed "3"
    assert.ok(hintText().includes('(4 needed to start)'));
  });
});

// ---------------------------------------------------------------------------
// per FR-003 — join progress (joined / required)
// ---------------------------------------------------------------------------

describe('WaitingRoom — join progress (FR-003)', () => {
  it('renders "2 / 4 joined" when 2 of 4 players have joined', () => {
    const wr = makeWaitingRoom();
    wr.load('g1', null, players(2), 4);
    assert.ok(hintText().includes('2 / 4 joined'), `got: ${hintText()}`);
  });

  it('renders "1 / 3 joined" for a 3-player room with one player', () => {
    const wr = makeWaitingRoom();
    wr.load('g1', null, players(1), 3);
    assert.ok(hintText().includes('1 / 3 joined'), `got: ${hintText()}`);
  });

  it('updates the progress count when updatePlayers() adds a player', () => {
    const wr = makeWaitingRoom();
    wr.load('g1', null, players(1), 4);
    assert.ok(hintText().includes('1 / 4 joined'));
    wr.updatePlayers(players(3));
    assert.ok(hintText().includes('3 / 4 joined'), `got: ${hintText()}`);
  });
});
