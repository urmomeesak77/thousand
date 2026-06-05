'use strict';

// Regression: the last trick's resolve animation defers the RoundSummaryScreen
// mount until _finalizeTrickResolve releases the controls-lock. The release and
// the deferred mount run synchronously inside _finalizeTrickResolve, after which
// a trailing TrickPlayView.render() does `_el.textContent = ''` on the SAME
// controlsEl the summary was just mounted into — wiping the Continue button and
// stranding all three players on "Round complete". See temp/view.png.

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

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
    'thousand/FourNinesPrompt.js',
    'thousand/MarriageNotice.js',
    'thousand/GameScreen.js',
  ];
  for (const mod of modules) { loadModule(dom, mod); }
});

// Antlion that captures scheduled callbacks so the test can fire the trick-resolve
// finalize deterministically. onTick is a no-op (flights never "land"); the
// setTimeout-based safety net schedule is what drives _finalizeTrickResolve.
function makeFiringAntlion() {
  const inputs = {};
  const scheduled = [];
  let id = 1;
  return {
    bindInput(el, ev, type) {
      const fn = (e) => inputs[type]?.(e);
      el.addEventListener(ev, fn);
      return () => el.removeEventListener(ev, fn);
    },
    onInput(type, h) { inputs[type] = h; },
    offInput(type) { delete inputs[type]; },
    onTick() { return () => {}; },
    schedule(delay, cb) { const sid = id++; scheduled.push({ sid, cb }); return sid; },
    cancelScheduled(sid) { const i = scheduled.findIndex((s) => s.sid === sid); if (i >= 0) { scheduled.splice(i, 1); } },
    scheduleInterval() { return 0; },
    cancelInterval() {},
    emit() {},
    stop() {},
    _fireScheduled() {
      const entries = scheduled.splice(0, scheduled.length);
      for (const { cb } of entries) { cb(); }
    },
  };
}

function makeGameScreen() {
  const doc = dom.window.document;
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  const antlion = makeFiringAntlion();
  const dispatcher = {
    sendBid() {}, sendPass() {}, sendSellStart() {}, sendStartGame() {},
    sendPlayCard() {}, sendContinueToNextRound() {}, sendRequestSnapshot() {},
  };
  const gs = new dom.window.GameScreen(antlion, container, dispatcher);
  gs._seats = {
    self: 0, left: 1, right: 2,
    players: [
      { seat: 0, playerId: 'p0', nickname: 'Alice' },
      { seat: 1, playerId: 'p1', nickname: 'Bob' },
      { seat: 2, playerId: 'p2', nickname: 'Carol' },
    ],
  };
  return { gs, antlion };
}

function summaryPayload() {
  const row = (seat, nickname) => ({
    nickname, seat, trickPoints: 40, roundTotal: 40, delta: 40,
    cumulativeAfter: 40, marriageBonus: 0, penalties: [],
  });
  return {
    roundNumber: 1, declarerSeat: 0, declarerNickname: 'Alice', bid: 100,
    declarerMadeBid: true, victoryReached: false,
    perPlayer: { 0: row(0, 'Alice'), 1: row(1, 'Bob'), 2: row(2, 'Carol') },
  };
}

describe('GameScreen — last-trick resolve must not wipe the RoundSummaryScreen', () => {
  it('Continue button survives the deferred summary mount inside _finalizeTrickResolve', () => {
    const { gs, antlion } = makeGameScreen();
    gs._cardsById = { 30: { id: 30, rank: 'A', suit: '♣' } };

    // Trick 8 in progress: two opponents have played; TrickPlayView mounts and
    // records baseline collectedTrickCounts {0:7}.
    gs.updateStatus({
      phase: 'Trick play', viewerIsActive: false, legalCardIds: [],
      collectedTrickCounts: { 0: 7, 1: 0, 2: 0 },
      opponentHandSizes: { 1: 1, 2: 0 }, trickNumber: 8,
      currentTrick: [
        { seat: 1, cardId: 31, rank: 'K', suit: '♣' },
        { seat: 2, cardId: 32, rank: 'Q', suit: '♣' },
      ],
    });
    assert.equal(gs._lastMountedPhase, 'Trick play', 'precondition: trick play mounted');

    // Self plays the 3rd card → trick 8 resolves (winner seat 0), round complete.
    // This engages the trick-resolve lock and defers the RoundSummaryScreen mount.
    gs.notifyCardPlayed(0, 30);
    const roundComplete = {
      phase: 'Round complete', viewerIsActive: false,
      collectedTrickCounts: { 0: 8, 1: 0, 2: 0 },
      opponentHandSizes: { 1: 0, 2: 0 }, trickNumber: 8, currentTrick: [],
    };
    gs.updateStatus(roundComplete);
    assert.ok(gs.isControlsLocked, 'precondition: controls locked during trick-resolve');

    // round_summary arrives: summary stashed in _lastSnapshot, mount still deferred.
    gs.updateSnapshot({ summary: summaryPayload() });
    gs.updateStatus(roundComplete);

    // Fire the resolve schedules (hold → collect-flight → safety-net finalize).
    antlion._fireScheduled();

    const btn = gs._controlsEl.querySelector('.round-summary__continue-btn');
    assert.ok(btn, 'Continue to Next Round button must be present after the last trick resolves');
  });
});

// Regression: pressing Continue then refreshing dropped the ticks and re-enabled
// the Continue button. The reconnect snapshot carries continuePressedSeats, but
// _mountRoundSummary only rendered summary — it never seeded the fresh screen, so
// it started with an empty set. See temp/view.png.
describe('GameScreen — RoundSummaryScreen restores continue-press state on reconnect', () => {
  it('seeds ticks + disables the viewer\'s Continue button from snapshot.continuePressedSeats', () => {
    const { gs } = makeGameScreen();
    // initFromSnapshot sets _lastSnapshot before the summary mounts; mirror that
    // ordering so the snapshot (with prior presses) is known at creation time.
    gs._lastSnapshot = { summary: summaryPayload(), continuePressedSeats: [0] };
    gs.updateStatus({
      phase: 'Round complete', viewerIsActive: false,
      collectedTrickCounts: { 0: 8, 1: 0, 2: 0 },
      opponentHandSizes: { 1: 0, 2: 0 }, trickNumber: 8, currentTrick: [],
    });

    const row0 = gs._controlsEl.querySelector('.round-summary__player-row[data-seat="0"]');
    assert.ok(row0?.querySelector('.round-summary__continued-indicator'),
      'tick must be restored for a seat that already pressed Continue');

    const btn = gs._controlsEl.querySelector('.round-summary__continue-btn');
    assert.ok(btn, 'precondition: continue button rendered');
    assert.ok(btn.disabled,
      'viewer who already pressed Continue must see a disabled button after reconnect');
  });
});
