'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

// ---------------------------------------------------------------------------
// jsdom setup — load all GameScreen dependencies in dependency order
// (mirrors tests/GameScreen.roundstats.test.js)
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
// Mock Antlion and dispatcher (mirrors roundstats test)
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
  return new dom.window.GameScreen(antlion, container, dispatcher);
}

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

// 4-player layout from the viewer at seat 0: left=1, across=2, right=3.
function fourPlayerSeats() {
  return {
    self: 0,
    left: 1,
    across: 2,
    right: 3,
    dealer: 0,
    players: [
      { seat: 0, playerId: 'p0', nickname: 'Me' },
      { seat: 1, playerId: 'p1', nickname: 'Lefty' },
      { seat: 2, playerId: 'p2', nickname: 'Acer' },
      { seat: 3, playerId: 'p3', nickname: 'Righty' },
    ],
  };
}

describe('GameScreen — four-player layout', () => {
  it('renders THREE opponent views (left, across, right) per FR-018', () => {
    const gs = makeGameScreen();
    gs.initFromSnapshot({
      seats: fourPlayerSeats(),
      myHand: [],
      opponentHandSizes: { 1: 7, 2: 6, 3: 5 },
      gameStatus: makeStatus(),
    });
    // per FR-018 — exactly three opponent containers exist in the DOM
    const opponents = [...gs._container.querySelectorAll('.opponent-view')];
    assert.equal(opponents.length, 3, 'three opponent views render for 4 players');
  });

  it('maps nicknames to each opponent seat per FR-019', () => {
    const gs = makeGameScreen();
    gs.initFromSnapshot({
      seats: fourPlayerSeats(),
      myHand: [],
      opponentHandSizes: { 1: 7, 2: 6, 3: 5 },
      gameStatus: makeStatus(),
    });
    const nicks = [...gs._container.querySelectorAll('.opponent-view__nickname')]
      .map((el) => el.textContent);
    // per FR-019 — every opponent seat's nickname is shown
    assert.ok(nicks.includes('Lefty'), 'left (seat 1) nickname rendered');
    assert.ok(nicks.includes('Acer'), 'across (seat 2) nickname rendered');
    assert.ok(nicks.includes('Righty'), 'right (seat 3) nickname rendered');
  });

  it('maps hand sizes to each opponent seat per FR-018', () => {
    const gs = makeGameScreen();
    gs.initFromSnapshot({
      seats: fourPlayerSeats(),
      myHand: [],
      opponentHandSizes: { 1: 7, 2: 6, 3: 5 },
      gameStatus: makeStatus(),
    });
    // per FR-018 — each opponent view's count badge reflects its seat's hand size
    const counts = [...gs._container.querySelectorAll('.opponent-view__count')]
      .map((el) => el.textContent)
      .sort();
    assert.deepEqual(counts, ['5', '6', '7'], 'three distinct opponent hand sizes shown');
  });

  it('maps round-stats to each opponent seat per FR-019', () => {
    const gs = makeGameScreen();
    gs._seats = fourPlayerSeats();
    gs.updateStatus(makeStatus({
      phase: 'Trick play',
      collectedTrickCounts: { 0: 3, 1: 2, 2: 1, 3: 0 },
      roundPoints: { 0: 45, 1: 30, 2: 18, 3: 0 },
    }));
    const selfLine = gs._container.querySelector('.self-round-stats');
    // per FR-019 — viewer's own row reflects seat 0
    assert.ok(selfLine && !selfLine.classList.contains('hidden'), 'self stat row visible');
    assert.ok(selfLine.textContent.includes('3') && selfLine.textContent.includes('45'),
      'self shows tricks 3 / points 45');

    const oppText = [...gs._container.querySelectorAll('.opponent-view__round-stats')]
      .map((el) => el.textContent);
    // per FR-019 — all THREE opponents render their own seat's stats
    assert.equal(oppText.length, 3, 'three opponents render a stat line');
    assert.ok(oppText.some((t) => t.includes('Tricks 2') && t.includes('Points 30')),
      'left opponent (seat 1) stats');
    assert.ok(oppText.some((t) => t.includes('Tricks 1') && t.includes('Points 18')),
      'across opponent (seat 2) stats');
    assert.ok(oppText.some((t) => t.includes('Tricks 0') && t.includes('Points 0')),
      'right opponent (seat 3) stats');
  });
});
