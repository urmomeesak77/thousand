'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// jsdom setup — load all GameScreen dependencies in dependency order
// ---------------------------------------------------------------------------

let dom;

function loadModule(domInstance, filename) {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'public', 'js', 'thousand', filename),
    'utf8'
  );
  const stripped = src
    .replace(/^import\s+\S.*$/gm, '')
    .replace(/^export default\s+(\w+);\s*$/gm, 'window.$1 = $1;');
  domInstance.window.eval(stripped);
}

before(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });

  // Load in dependency order: leaf modules first, GameScreen last
  const modules = [
    'CardSprite.js',
    'CardTable.js',
    'StatusBar.js',
    'HandView.js',
    'OpponentView.js',
    'TalonView.js',
    'DealAnimation.js',
    'BidControls.js',
    'DeclarerDecisionControls.js',
    'RoundReadyScreen.js',
    'GameScreen.js',
  ];
  for (const mod of modules) {
    loadModule(dom, mod);
  }
});

// ---------------------------------------------------------------------------
// Mock Antlion and dispatcher
// ---------------------------------------------------------------------------

function makeMockAntlion() {
  const inputs = {};
  const ticks = [];
  return {
    bindInput() {},
    onInput(type, handler) { inputs[type] = handler; },
    onTick(handler) { ticks.push(handler); },
    schedule() { return 0; },
    cancelScheduled() {},
    scheduleInterval() { return 0; },
    cancelInterval() {},
    emit() {},
    _fire(type) { if (inputs[type]) inputs[type](); },
    _inputs: inputs,
  };
}

function makeMockDispatcher() {
  return {
    sendBid() {},
    sendPass() {},
    sendSellStart() {},
    sendStartGame() {},
  };
}

// ---------------------------------------------------------------------------
// GameScreen factory for gating tests
// (skips init()/deal animation — calls updateStatus directly)
// ---------------------------------------------------------------------------

function makeGameScreen() {
  const doc = dom.window.document;
  const container = doc.createElement('div');
  doc.body.appendChild(container);

  const antlion = makeMockAntlion();
  const dispatcher = makeMockDispatcher();
  const gs = new dom.window.GameScreen(antlion, container, dispatcher);
  return { gs, antlion, dispatcher };
}

// Builds a minimal Declarer deciding GameStatus view-model.
function declarerDecidingStatus({
  viewerSeat = 0,
  declarerSeat = 0,
  sellAttempt = null,
  passedPlayers = [],
  disconnectedPlayers = [],
} = {}) {
  const names = ['Alice', 'Bob', 'Carol'];
  return {
    phase: 'Declarer deciding',
    activePlayer: { seat: declarerSeat, nickname: names[declarerSeat] },
    viewerIsActive: viewerSeat === declarerSeat,
    currentHighBid: 100,
    declarer: { seat: declarerSeat, nickname: names[declarerSeat] },
    passedPlayers,
    sellAttempt,
    disconnectedPlayers,
  };
}

// ---------------------------------------------------------------------------
// T057 — FR-026: Declarer deciding — DeclarerDecisionControls visibility
// ---------------------------------------------------------------------------

describe('GameScreen.gating — Declarer deciding: declarer sees full controls (FR-026)', () => {
  it('declarer (viewerIsActive) gets DeclarerDecisionControls created', () => {
    const { gs } = makeGameScreen();
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 0, declarerSeat: 0 }));

    assert.ok(gs._declarerControls !== null, 'DeclarerDecisionControls must be created for the declarer');
  });

  it('declarer controls are not hidden (mode = full)', () => {
    const { gs } = makeGameScreen();
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 0, declarerSeat: 0 }));

    assert.equal(gs._declarerControls._mode, 'full');
    assert.ok(
      !gs._declarerControls._el.classList.contains('hidden'),
      'declarer controls must be visible'
    );
  });

  it('Sell button is enabled and Start button is enabled in full mode', () => {
    const { gs } = makeGameScreen();
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 0, declarerSeat: 0, sellAttempt: null }));

    assert.equal(gs._declarerControls._sellBtn.disabled, false, 'Sell must be enabled');
    assert.equal(gs._declarerControls._startBtn.disabled, false, 'Start must be enabled');
  });
});

describe('GameScreen.gating — Declarer deciding: opponents see .waiting div (FR-026)', () => {
  it('non-declarer gets no DeclarerDecisionControls', () => {
    const { gs } = makeGameScreen();
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 1, declarerSeat: 0 }));

    assert.equal(gs._declarerControls, null, 'DeclarerDecisionControls must not exist for a non-declarer');
  });

  it('non-declarer sees a .waiting div with the declarer\'s nickname', () => {
    const { gs } = makeGameScreen();
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 1, declarerSeat: 0 }));

    const waitDiv = gs._controlsEl.querySelector('.waiting');
    assert.ok(waitDiv, '.waiting div must be rendered for non-declarer');
    assert.ok(
      waitDiv.textContent.includes('Alice'),
      '.waiting text must include the declarer\'s name'
    );
  });

  it('seat 2 opponent also renders .waiting and no controls', () => {
    const { gs } = makeGameScreen();
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 2, declarerSeat: 0 }));

    assert.equal(gs._declarerControls, null);
    assert.ok(gs._controlsEl.querySelector('.waiting'), '.waiting must exist for seat 2');
  });
});

describe('GameScreen.gating — Declarer deciding: 3 failed attempts disables Sell (FR-018)', () => {
  it('sellAttempt === 3 sets mode to sell-disabled', () => {
    const { gs } = makeGameScreen();
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 0, declarerSeat: 0, sellAttempt: 3 }));

    assert.equal(gs._declarerControls._mode, 'sell-disabled');
  });

  it('Sell button is disabled and Start button is still operable when sellAttempt === 3', () => {
    const { gs } = makeGameScreen();
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 0, declarerSeat: 0, sellAttempt: 3 }));

    assert.equal(gs._declarerControls._sellBtn.disabled, true, 'Sell must be disabled after 3 attempts');
    assert.equal(gs._declarerControls._startBtn.disabled, false, 'Start must still be operable');
  });
});

describe('GameScreen.gating — controls swap correctly across phase transitions', () => {
  it('switching from Bidding to Declarer deciding replaces BidControls with DeclarerDecisionControls', () => {
    const { gs } = makeGameScreen();

    // First: viewer is the active bidder in Bidding phase
    gs.updateStatus({
      phase: 'Bidding',
      activePlayer: { seat: 0, nickname: 'Alice' },
      viewerIsActive: true,
      currentHighBid: null,
      declarer: null,
      passedPlayers: [],
      sellAttempt: null,
      disconnectedPlayers: [],
    });
    assert.ok(gs._bidControls !== null, 'BidControls must exist during Bidding');

    // Then: phase shifts to Declarer deciding (viewer is declarer)
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 0, declarerSeat: 0 }));

    assert.equal(gs._bidControls, null, 'BidControls must be removed when phase changes to Declarer deciding');
    assert.ok(gs._declarerControls !== null, 'DeclarerDecisionControls must appear');
  });

  it('.waiting text updates when the declarer seat changes', () => {
    const { gs } = makeGameScreen();

    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 1, declarerSeat: 0 }));
    assert.ok(gs._controlsEl.querySelector('.waiting').textContent.includes('Alice'));

    // A second update (same viewer, different declarer after selling — not a normal game flow
    // but we verify the text updates to the new nickname)
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 1, declarerSeat: 2 }));
    assert.ok(gs._controlsEl.querySelector('.waiting').textContent.includes('Carol'));
  });
});
