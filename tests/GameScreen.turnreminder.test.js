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
    'thousand/TrumpBox.js',
    'thousand/RoundReadyScreen.js',
    'thousand/CardExchangeView.js',
    'thousand/CollectedTricksStack.js',
    'thousand/MarriageDeclarationPrompt.js',
    'thousand/CrawlControls.js',
    'thousand/CardFlightAnimator.js',
    'thousand/TrickPlayView.js',
    'thousand/RoundSummaryScreen.js',
    'thousand/GameScreenControls.js',
    'thousand/SellPhaseView.js',
    'thousand/statusText.js',
    'thousand/ScoreboardPanel.js',
    'thousand/historyEntryText.js',
    'thousand/HistoryPanel.js',
    'thousand/FourNinesPrompt.js',
    'thousand/MarriageNotice.js',
    'thousand/TurnReminder.js',
    'thousand/GameScreen.js',
  ];
  for (const mod of modules) {
    loadModule(dom, mod);
  }
});

// ---------------------------------------------------------------------------
// Recording Antlion — records scheduleInterval/cancelInterval so the test can
// observe whether the TurnReminder is armed.
// ---------------------------------------------------------------------------

function makeRecordingAntlion() {
  const inputs = {};
  const intervals = new Map();
  let nextId = 1;
  return {
    intervals,
    bindInput() { return () => {}; },
    onInput(type, handler) { inputs[type] = handler; },
    offInput(type, handler) { if (inputs[type] === handler) { delete inputs[type]; } },
    onTick() {},
    schedule() { return 0; },
    cancelScheduled() {},
    scheduleInterval(delay, cb) {
      const id = nextId++;
      intervals.set(id, { delay, cb });
      return id;
    },
    cancelInterval(id) { intervals.delete(id); },
    emit() {},
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

function makeGameScreen() {
  const doc = dom.window.document;
  const container = doc.createElement('div');
  doc.body.appendChild(container);

  const antlion = makeRecordingAntlion();
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
// GameScreen ↔ TurnReminder seam
// ---------------------------------------------------------------------------

describe('GameScreen turn reminder', () => {
  it('arms the reminder when it becomes the viewer\'s turn', () => {
    const { gs, antlion } = makeGameScreen();
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 0, declarerSeat: 0 }));
    assert.equal(antlion.intervals.size, 1);
    const [{ delay }] = antlion.intervals.values();
    assert.equal(delay, 30000);
  });

  it('disarms the reminder when it is no longer the viewer\'s turn', () => {
    const { gs, antlion } = makeGameScreen();
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 1, declarerSeat: 0 }));
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 0, declarerSeat: 0 }));
    assert.equal(antlion.intervals.size, 1);
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 1, declarerSeat: 0 }));
    assert.equal(antlion.intervals.size, 0);
  });

  it('stopTurnReminder() disarms an armed reminder (leave-game teardown)', () => {
    const { gs, antlion } = makeGameScreen();
    gs.updateStatus(declarerDecidingStatus({ viewerSeat: 0, declarerSeat: 0 }));
    assert.equal(antlion.intervals.size, 1);
    gs.stopTurnReminder();
    assert.equal(antlion.intervals.size, 0);
  });
});
