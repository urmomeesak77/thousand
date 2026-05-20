'use strict';

// Regression: UI controls register Antlion input handlers (EventBus `onInput`
// and DOM `bindInput`) in their constructors but are recreated every round.
// Without a symmetric teardown the handlers accumulate for the lifetime of the
// (session-scoped) Antlion instance — an unbounded leak — and because
// EventBus.emit fires ALL handlers for a type, a single live click also invokes
// every stale instance's handler. destroy() must return both registries to
// baseline.

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
    'antlion/EventBus.js',
    'antlion/Antlion.js',
    'thousand/constants.js',
    'thousand/cardSymbols.js',
    'utils/HtmlUtil.js',
    'thousand/BiddingControls.js',
    'thousand/BidControls.js',
    'thousand/SellBidControls.js',
    'thousand/DeclarerDecisionControls.js',
    'thousand/SellSelectionControls.js',
    'thousand/RoundSummaryScreen.js',
    'thousand/RoundReadyScreen.js',
  ];
  for (const mod of modules) { loadModule(dom, mod); }
});

function busHandlerCount(antlion) {
  let n = 0;
  for (const arr of antlion._bus._handlers.values()) { n += arr.length; }
  return n;
}

function makeDispatcher() {
  return {
    sendBid() {}, sendPass() {}, sendSellBid() {}, sendSellPass() {},
    sendSellStart() {}, sendStartGame() {}, sendSellSelect() {}, sendSellCancel() {},
  };
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

// Each entry builds a control and exercises any per-render binding, so destroy()
// must clean up everything it ever registered. `dom` is read lazily inside each
// factory (all of which run at test time, after before() populates it) so this
// function is safe to invoke during suite collection — Node 18's test runner
// builds describe bodies before running top-level before() hooks.
function controlFactories() {
  const newContainer = () => {
    const doc = dom.window.document;
    const c = doc.createElement('div');
    doc.body.appendChild(c);
    return c;
  };
  return {
    BidControls: (antlion) =>
      new dom.window.BidControls(newContainer(), antlion, makeDispatcher()),
    SellBidControls: (antlion) =>
      new dom.window.SellBidControls(newContainer(), antlion, makeDispatcher()),
    DeclarerDecisionControls: (antlion) =>
      new dom.window.DeclarerDecisionControls(newContainer(), antlion, makeDispatcher()),
    SellSelectionControls: (antlion) =>
      new dom.window.SellSelectionControls(newContainer(), antlion, makeDispatcher()),
    RoundSummaryScreen: (antlion) => {
      const s = new dom.window.RoundSummaryScreen(newContainer(), {
        antlion, viewerSeat: 0, onBackToLobby() {}, onContinue() {},
      });
      s.render(summaryPayload()); // exercises per-render button bindInput
      return s;
    },
    RoundReadyScreen: (antlion) =>
      new dom.window.RoundReadyScreen(newContainer(), antlion, { mode: 'ready', context: {} }, () => {}),
  };
}

describe('input-handler leaks — destroy() returns Antlion registries to baseline', () => {
  for (const [name, make] of Object.entries(controlFactories())) {
    it(`${name}: a mount/destroy cycle leaves no residual handlers`, () => {
      const antlion = new dom.window.Antlion();
      const baseBus = busHandlerCount(antlion);
      const baseDom = antlion._domListeners.length;

      const c = make(antlion);
      assert.ok(
        busHandlerCount(antlion) > baseBus || antlion._domListeners.length > baseDom,
        `${name} must register at least one handler`,
      );

      c.destroy();
      assert.equal(busHandlerCount(antlion), baseBus, `${name}: EventBus handlers must be removed`);
      assert.equal(antlion._domListeners.length, baseDom, `${name}: DOM listeners must be removed`);
    });

    it(`${name}: repeated mount/destroy does not accumulate handlers`, () => {
      const antlion = new dom.window.Antlion();
      const baseBus = busHandlerCount(antlion);
      const baseDom = antlion._domListeners.length;
      for (let i = 0; i < 5; i++) {
        const c = make(antlion);
        c.destroy();
      }
      assert.equal(busHandlerCount(antlion), baseBus, `${name}: bus handlers must not grow across cycles`);
      assert.equal(antlion._domListeners.length, baseDom, `${name}: DOM listeners must not grow across cycles`);
    });
  }
});

describe('Antlion.stop() clears tick handlers', () => {
  it('removes registered tick handlers so a restart does not re-run stale callbacks', () => {
    const antlion = new dom.window.Antlion();
    antlion.onTick(() => {});
    antlion.onTick(() => {});
    assert.equal(antlion._tickHandlers.length, 2);
    antlion.stop();
    assert.equal(antlion._tickHandlers.length, 0, 'stop() must clear tick handlers');
  });
});

describe('Antlion.bindInput returns a working disposer', () => {
  it('disposer removes the listener and its _domListeners entry', () => {
    const antlion = new dom.window.Antlion();
    const el = dom.window.document.createElement('button');
    const base = antlion._domListeners.length;
    const dispose = antlion.bindInput(el, 'click', 'x-click');
    assert.equal(antlion._domListeners.length, base + 1);
    assert.equal(typeof dispose, 'function', 'bindInput must return a disposer');
    dispose();
    assert.equal(antlion._domListeners.length, base, 'disposer must remove the _domListeners entry');
  });
});
