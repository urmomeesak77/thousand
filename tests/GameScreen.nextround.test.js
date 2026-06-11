'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');
const { loadI18n } = require('./helpers/loadI18n');

// ---------------------------------------------------------------------------
// jsdom setup — load all GameScreen dependencies in dependency order
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

function makeMockAntlion() {
  const inputs = {};
  const ticks = [];
  return {
    bindInput() { return () => {}; },
    onInput(type, handler) { inputs[type] = handler; },
    offInput(type, handler) { if (inputs[type] === handler) { delete inputs[type]; } },
    onTick(handler) { ticks.push(handler); return () => {}; },
    schedule() { return 0; },
    cancelScheduled() {},
    scheduleInterval() { return 0; },
    cancelInterval() {},
    emit() {},
    _inputs: inputs,
  };
}

function makeMockDispatcher() {
  return {
    sendBid() {}, sendPass() {}, sendSellStart() {}, sendStartGame() {},
    sendContinueToNextRound() {},
  };
}

function makeGameScreen() {
  const doc = dom.window.document;
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  const antlion = makeMockAntlion();
  const dispatcher = makeMockDispatcher();
  const gs = new dom.window.GameScreen(antlion, container, dispatcher, loadI18n(dom));
  return { gs };
}

const SEATS = {
  self: 0, left: 1, right: 2,
  players: [
    { seat: 0, playerId: 'p0', nickname: 'Alice' },
    { seat: 1, playerId: 'p1', nickname: 'Bob' },
    { seat: 2, playerId: 'p2', nickname: 'Carol' },
  ],
};

function roundCompleteSummary() {
  return {
    declarerMadeBid: true,
    victoryReached: false,
    perPlayer: {
      0: { nickname: 'Alice', seat: 0, trickPoints: 60, roundTotal: 60, delta: 100, cumulativeAfter: 100 },
      1: { nickname: 'Bob', seat: 1, trickPoints: 30, roundTotal: 30, delta: 30, cumulativeAfter: 30 },
      2: { nickname: 'Carol', seat: 2, trickPoints: 30, roundTotal: 30, delta: 30, cumulativeAfter: 30 },
    },
  };
}

function nextRoundMsg() {
  return {
    seats: SEATS,
    dealSequence: [
      { to: 'seat0', id: 1, rank: 'A', suit: '♠' },
      { to: 'seat1', id: 2 },
      { to: 'talon', id: 3 },
    ],
    gameStatus: {
      phase: 'Bidding',
      activePlayer: { seat: 0, nickname: 'Alice' },
      viewerIsActive: true,
      currentHighBid: null,
      declarer: null,
      passedPlayers: [],
      sellAttempt: null,
      disconnectedPlayers: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Bug: the round-summary overlay must be torn down BEFORE the next round's
// deal animation begins, otherwise the deal plays behind the still-visible
// summary and the summary only disappears after the deal completes.
// ---------------------------------------------------------------------------

describe('GameScreen — next round tears down the round summary before dealing', () => {
  it('removes the round-summary overlay from _controlsEl when init() starts the deal', () => {
    const { gs } = makeGameScreen();

    // Mount the round summary as it would be on Round complete.
    gs._seats = SEATS;
    gs._lastSnapshot = { summary: roundCompleteSummary() };
    gs.updateStatus({
      phase: 'Round complete',
      opponentHandSizes: { 1: 0, 2: 0 },
      collectedTrickCounts: { 0: 8, 1: 0, 2: 0 },
    });
    assert.ok(
      gs._controlsEl.querySelector('.round-summary'),
      'precondition: round summary overlay is mounted on Round complete',
    );

    // Next round arrives. The deal animation is now running (ticks never fire
    // in the mock, so controls stay locked) — the summary must already be gone.
    gs.init(nextRoundMsg());

    assert.equal(
      gs._controlsEl.querySelector('.round-summary'),
      null,
      'round-summary overlay must be removed before the deal animation runs',
    );
    assert.equal(
      gs._controls._roundSummaryScreen,
      null,
      'RoundSummaryScreen reference must be cleared on the next round',
    );
  });
});
