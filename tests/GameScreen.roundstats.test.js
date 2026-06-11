'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');
const { loadI18n } = require('./helpers/loadI18n');

// ---------------------------------------------------------------------------
// jsdom setup — load all GameScreen dependencies in dependency order
// (mirrors tests/GameScreen.gating.test.js)
// ---------------------------------------------------------------------------

let dom;

before(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });

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
// Mock Antlion and dispatcher (mirrors gating test)
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

function makeGameScreen() {
  const doc = dom.window.document;
  const container = doc.createElement('div');
  doc.body.appendChild(container);

  const antlion = makeMockAntlion();
  const dispatcher = makeMockDispatcher();
  return new dom.window.GameScreen(antlion, container, dispatcher, loadI18n(dom));
}

// Status factory — default includes roundPoints: null (pre-trick-play).
function makeStatus(overrides = {}) {
  return {
    phase: 'Bidding',
    activePlayer: { seat: 0, nickname: 'Me' },
    viewerIsActive: false,
    currentHighBid: null,
    declarer: null,
    passedPlayers: [],
    sellAttempt: null,
    disconnectedPlayers: [],
    roundPoints: null,
    ...overrides,
  };
}

describe('GameScreen — self round-stats row', () => {
  it('shows "N tricks, M points" above the hand during trick-play', () => {
    const gs = makeGameScreen();
    gs._seats = { self: 0, left: 1, right: 2, players: [
      { seat: 0, playerId: 'p0', nickname: 'Me' },
      { seat: 1, playerId: 'p1', nickname: 'L' },
      { seat: 2, playerId: 'p2', nickname: 'R' },
    ] };
    gs.updateStatus(makeStatus({
      phase: 'Trick play',
      collectedTrickCounts: { 0: 3, 1: 1, 2: 0 },
      roundPoints: { 0: 45, 1: 12, 2: 0 },
    }));
    const selfLine = gs._container.querySelector('.self-round-stats');
    assert.ok(selfLine && !selfLine.classList.contains('hidden'), 'self stat row visible');
    assert.ok(selfLine.textContent.includes('3'), 'shows own trick count');
    assert.ok(selfLine.textContent.includes('45'), 'shows own points');

    // Opponents are fed from the same gameStatus: left=seat 1 (Tricks 1, Points 12),
    // right=seat 2 (Tricks 0, Points 0).
    const oppLines = [...gs._container.querySelectorAll('.opponent-view__round-stats')];
    assert.equal(oppLines.length, 2, 'both opponents render a stat line');
    const oppText = oppLines.map((el) => el.textContent);
    assert.ok(oppText.some((t) => t.includes('1 trick') && t.includes('12 points')),
      'left opponent (seat 1) shows its tricks/points');
    assert.ok(oppText.some((t) => t.includes('0 tricks') && t.includes('0 points')),
      'right opponent (seat 2) shows its tricks/points');
  });

  it('hides the self row when roundPoints is null (pre-trick-play)', () => {
    const gs = makeGameScreen();
    gs._seats = { self: 0, left: 1, right: 2, players: [] };
    gs.updateStatus(makeStatus({ phase: 'Bidding', roundPoints: null }));
    const selfLine = gs._container.querySelector('.self-round-stats');
    assert.ok(!selfLine || selfLine.classList.contains('hidden'), 'self stat row hidden');
  });
});
