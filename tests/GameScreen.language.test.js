'use strict';

// US2 (FR-005): switching language re-renders every visible in-round label from
// retained state, without dispatching any round action or touching the socket.

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');
const { loadI18n } = require('./helpers/loadI18n');

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

// A real Antlion-ish bus so i18n.setLanguage's emit reaches GameScreen's
// language:changed subscriber. Records every emitted event for assertions.
function makeBus() {
  const inputs = {};
  const emitted = [];
  return {
    bindInput() { return () => {}; },
    onInput(type, handler) { (inputs[type] = inputs[type] || []).push(handler); },
    offInput(type, handler) {
      inputs[type] = (inputs[type] || []).filter((h) => h !== handler);
    },
    onTick() {},
    schedule() { return 0; },
    cancelScheduled() {},
    scheduleInterval() { return 0; },
    cancelInterval() {},
    emit(type, data) {
      emitted.push({ type, data });
      (inputs[type] || []).forEach((h) => h(data));
    },
    _emitted: emitted,
  };
}

// Dispatcher that records every call, so the test can prove no round action fires.
function makeRecordingDispatcher() {
  const calls = [];
  const rec = (name) => (...args) => calls.push({ name, args });
  return {
    calls,
    sendBid: rec('sendBid'), sendPass: rec('sendPass'),
    sendSellStart: rec('sendSellStart'), sendStartGame: rec('sendStartGame'),
    sendSellBid: rec('sendSellBid'), sendSellPass: rec('sendSellPass'),
    sendSellSelect: rec('sendSellSelect'), sendSellCancel: rec('sendSellCancel'),
  };
}

function makeGameScreen() {
  const doc = dom.window.document;
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  const antlion = makeBus();
  const dispatcher = makeRecordingDispatcher();
  const i18n = loadI18n(dom, { language: 'en', antlion });
  const gs = new dom.window.GameScreen(antlion, container, dispatcher, i18n);
  return { gs, antlion, dispatcher, i18n, container };
}

function biddingStatus(overrides = {}) {
  return {
    phase: 'Bidding',
    activePlayer: { seat: 1, nickname: 'Bob' },
    viewerIsActive: false,
    currentHighBid: 100,
    declarer: null,
    passedPlayers: [],
    sellAttempt: null,
    disconnectedPlayers: [],
    roundPoints: null,
    ...overrides,
  };
}

const seats = {
  self: 0, left: 1, right: 2,
  players: [
    { seat: 0, playerId: 'p0', nickname: 'Me' },
    { seat: 1, playerId: 'p1', nickname: 'Bob' },
    { seat: 2, playerId: 'p2', nickname: 'Cara' },
  ],
};

describe('GameScreen — live language switch (FR-005)', () => {
  it('re-renders the status bar phase label in the new language', () => {
    const { gs, i18n, container } = makeGameScreen();
    gs._seats = seats;
    gs.updateStatus(biddingStatus());
    assert.ok(container.querySelector('.status-bar__phase').textContent.includes('Bidding'));

    i18n.setLanguage('ru');
    const phase = container.querySelector('.status-bar__phase').textContent;
    assert.equal(phase, 'Торговля', 'phase label re-rendered in Russian');
  });

  it('re-renders the status box (turn label) in the new language', () => {
    const { gs, i18n, container } = makeGameScreen();
    gs._seats = seats;
    gs.updateStatus(biddingStatus({ viewerIsActive: true }));
    i18n.setLanguage('ru');
    assert.equal(container.querySelector('.game-status-box').textContent, 'Ваш ход');
  });

  it('re-renders the scoreboard title in the new language', () => {
    const { gs, i18n, container } = makeGameScreen();
    gs._seats = seats;
    gs.updateStatus(biddingStatus());
    i18n.setLanguage('ru');
    assert.equal(container.querySelector('.scoreboard__title').textContent, 'Счёт');
  });

  it('re-renders the bidding controls button labels in the new language', () => {
    const { gs, i18n, container } = makeGameScreen();
    gs._seats = seats;
    gs.updateStatus(biddingStatus({ viewerIsActive: true }));
    assert.equal(container.querySelector('.bid-controls__bid').textContent, 'Bid');
    i18n.setLanguage('ru');
    assert.equal(container.querySelector('.bid-controls__bid').textContent, 'Заказать');
  });

  it('does not dispatch any round action or change game state on switch', () => {
    const { gs, i18n, dispatcher } = makeGameScreen();
    gs._seats = seats;
    gs.updateStatus(biddingStatus({ viewerIsActive: true }));
    const statusBefore = gs._lastGameStatus;
    i18n.setLanguage('ru');
    assert.deepEqual(dispatcher.calls, [], 'no dispatcher calls on language switch');
    assert.equal(gs._lastGameStatus, statusBefore, 'retained game status object is untouched');
  });

  it('switches back to English on a second toggle', () => {
    const { gs, i18n, container } = makeGameScreen();
    gs._seats = seats;
    gs.updateStatus(biddingStatus());
    i18n.setLanguage('ru');
    i18n.setLanguage('en');
    assert.ok(container.querySelector('.status-bar__phase').textContent.includes('Bidding'));
  });
});
