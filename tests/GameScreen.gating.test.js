'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

// ---------------------------------------------------------------------------
// jsdom setup — load all GameScreen dependencies in dependency order
// ---------------------------------------------------------------------------

let dom;

before(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });

  // Load in dependency order: leaf modules first, GameScreen last
  const modules = [
    'thousand/constants.js',
    'thousand/cardSymbols.js',
    'utils/HtmlUtil.js',
    'thousand/CardSprite.js',
    'thousand/CardTable.js',
    'thousand/StatusBar.js',
    'thousand/HandView.js',
    'thousand/roundStatsText.js',
    'thousand/OpponentView.js',
    'thousand/TalonView.js',
    'thousand/DealAnimation.js',
    'thousand/BiddingControls.js',
    'thousand/BidControls.js',
    'thousand/SellBidControls.js',
    'thousand/DeclarerDecisionControls.js',
    'thousand/SellSelectionControls.js',
    'thousand/GameStatusBox.js',
    'thousand/RoundReadyScreen.js',
    'thousand/CardExchangeView.js',
    'thousand/CollectedTricksStack.js',
    'thousand/MarriageDeclarationPrompt.js',
    'thousand/CrawlControls.js',
    'thousand/TrickPlayView.js',
    'thousand/RoundSummaryScreen.js',
    'thousand/GameScreenControls.js',
    'thousand/SellPhaseView.js',
    'thousand/statusText.js',
    'thousand/ScoreboardPanel.js',
    'thousand/FourNinesPrompt.js',
    'thousand/GameScreen.js',
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
    bindInput() { return () => {}; },
    onInput(type, handler) { inputs[type] = handler; },
    offInput(type, handler) { if (inputs[type] === handler) { delete inputs[type]; } },
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

    assert.ok(gs._controls._declarerControls !== null, 'DeclarerDecisionControls must be created for the declarer');
  });

  it('declarer controls are not hidden (mode = full)', () => {
    const { gs } = makeGameScreen();
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 0, declarerSeat: 0 }));

    assert.equal(gs._controls._declarerControls._mode, 'full');
    assert.ok(
      !gs._controls._declarerControls._el.classList.contains('hidden'),
      'declarer controls must be visible'
    );
  });

  it('Sell button is enabled and Start button is enabled in full mode', () => {
    const { gs } = makeGameScreen();
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 0, declarerSeat: 0, sellAttempt: null }));

    assert.equal(gs._controls._declarerControls._sellBtn.disabled, false, 'Sell must be enabled');
    assert.equal(gs._controls._declarerControls._startBtn.disabled, false, 'Start must be enabled');
  });
});

describe('GameScreen.gating — Declarer deciding: opponents see .waiting div (FR-026)', () => {
  it('non-declarer gets no DeclarerDecisionControls', () => {
    const { gs } = makeGameScreen();
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 1, declarerSeat: 0 }));

    assert.equal(gs._controls._declarerControls, null, 'DeclarerDecisionControls must not exist for a non-declarer');
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

    assert.equal(gs._controls._declarerControls, null);
    assert.ok(gs._controlsEl.querySelector('.waiting'), '.waiting must exist for seat 2');
  });
});

describe('GameScreen.gating — Declarer deciding: 3 failed attempts disables Sell (FR-018)', () => {
  it('sellAttempt === 3 sets mode to sell-disabled', () => {
    const { gs } = makeGameScreen();
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 0, declarerSeat: 0, sellAttempt: 3 }));

    assert.equal(gs._controls._declarerControls._mode, 'sell-disabled');
  });

  it('Sell button is disabled and Start button is still operable when sellAttempt === 3', () => {
    const { gs } = makeGameScreen();
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 0, declarerSeat: 0, sellAttempt: 3 }));

    assert.equal(gs._controls._declarerControls._sellBtn.disabled, true, 'Sell must be disabled after 3 attempts');
    assert.equal(gs._controls._declarerControls._startBtn.disabled, false, 'Start must still be operable');
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
    assert.ok(gs._controls._bidControls !== null, 'BidControls must exist during Bidding');

    // Then: phase shifts to Declarer deciding (viewer is declarer)
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 0, declarerSeat: 0 }));

    assert.equal(gs._controls._bidControls, null, 'BidControls must be removed when phase changes to Declarer deciding');
    assert.ok(gs._controls._declarerControls !== null, 'DeclarerDecisionControls must appear');
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

// ---------------------------------------------------------------------------
// updateStatus propagates gameStatus.opponentHandSizes to opponent views
// ---------------------------------------------------------------------------

function makeGameScreenForUpdate(opts = {}) {
  const doc = dom.window.document;
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  const antlion = makeMockAntlion();
  const dispatcher = makeMockDispatcher();
  const gameScreen = new dom.window.GameScreen(antlion, container, dispatcher);
  if (!opts.skipSeats) {
    gameScreen._seats = {
      self: 0, left: 1, right: 2,
      players: [
        { seat: 0, playerId: 'p0', nickname: 'Self' },
        { seat: 1, playerId: 'p1', nickname: 'Left' },
        { seat: 2, playerId: 'p2', nickname: 'Right' },
      ],
    };
  }
  const captureOpponentCounts = () => {
    const left = []; const right = [];
    gameScreen._leftOpponent.setCardCount  = (n) => left.push(n);
    gameScreen._rightOpponent.setCardCount = (n) => right.push(n);
    return { left, right };
  };
  return { gameScreen, captureOpponentCounts };
}

describe('GameScreen — updateStatus forwards to TrickPlayView only on transition out of Trick play', () => {
  it('forwards on Trick play → Round complete transition (last-trick resolve)', () => {
    const { gameScreen } = makeGameScreenForUpdate();
    // Pretend Trick play was the previously-mounted phase.
    gameScreen._lastMountedPhase = 'Trick play';
    const forwardCalls = [];
    gameScreen._controls.forwardStatusToTrickPlayView = (gs) => forwardCalls.push(gs.phase);

    gameScreen.updateStatus({
      phase: 'Round complete',
      opponentHandSizes: { 1: 0, 2: 0 },
      collectedTrickCounts: { 0: 8, 1: 1, 2: 1 },
    });

    assert.deepEqual(forwardCalls, ['Round complete'],
      'forward must fire exactly once on Trick play → Round complete');
  });

  it('does NOT forward on same-phase Trick play updates (mid-trick)', () => {
    const { gameScreen } = makeGameScreenForUpdate();
    gameScreen._lastMountedPhase = 'Trick play';
    const forwardCalls = [];
    gameScreen._controls.forwardStatusToTrickPlayView = (gs) => forwardCalls.push(gs.phase);

    gameScreen.updateStatus({
      phase: 'Trick play',
      opponentHandSizes: { 1: 5, 2: 5 },
      collectedTrickCounts: { 0: 1, 1: 0, 2: 0 },
    });

    assert.deepEqual(forwardCalls, [],
      'forward must NOT fire when phase stays Trick play — mountForPhase already re-renders');
  });

  it('does NOT forward when not transitioning out of Trick play', () => {
    const { gameScreen } = makeGameScreenForUpdate();
    gameScreen._lastMountedPhase = 'Bidding';
    const forwardCalls = [];
    gameScreen._controls.forwardStatusToTrickPlayView = (gs) => forwardCalls.push(gs.phase);

    gameScreen.updateStatus({
      phase: 'Declarer deciding',
      opponentHandSizes: { 1: 10, 2: 10 },
      collectedTrickCounts: { 0: 0, 1: 0, 2: 0 },
    });

    assert.deepEqual(forwardCalls, [],
      'forward must not fire outside trick-play context');
  });
});

describe('GameScreen — updateStatus applies opponentHandSizes to opponent views', () => {
  it('setCardCount is called for left and right opponents from gameStatus.opponentHandSizes', () => {
    const { gameScreen, captureOpponentCounts } = makeGameScreenForUpdate();
    const counts = captureOpponentCounts();
    gameScreen.updateStatus({
      phase: 'Trick play',
      opponentHandSizes: { 1: 6, 2: 7 },
      collectedTrickCounts: { 0: 0, 1: 0, 2: 0 },
    });
    assert.deepEqual(counts.left, [6], 'left opponent setCardCount must receive 6');
    assert.deepEqual(counts.right, [7], 'right opponent setCardCount must receive 7');
  });

  it('no setCardCount calls when seats are not yet known', () => {
    const { gameScreen, captureOpponentCounts } = makeGameScreenForUpdate({ skipSeats: true });
    const counts = captureOpponentCounts();
    gameScreen.updateStatus({
      phase: 'Bidding',
      opponentHandSizes: { 1: 6, 2: 7 },
    });
    assert.deepEqual(counts.left, [], 'no calls before seats are set');
    assert.deepEqual(counts.right, []);
  });
});
