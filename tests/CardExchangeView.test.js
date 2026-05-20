'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

// ---------------------------------------------------------------------------
// jsdom setup — load CardExchangeView dependencies in dependency order
// ---------------------------------------------------------------------------

let dom;

before(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });

  loadModule(dom, 'thousand/constants.js');
  loadModule(dom, 'thousand/cardSymbols.js');
  loadModule(dom, 'utils/HtmlUtil.js');
  loadModule(dom, 'thousand/CardSprite.js');
  loadModule(dom, 'thousand/CardExchangeView.js');
});

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeMockAntlion() {
  const inputHandlers = {};
  return {
    bindInput(el, event, type) {
      el.addEventListener(event, (e) => { if (inputHandlers[type]) { inputHandlers[type](e); } });
    },
    onInput(type, handler) {
      if (!inputHandlers[type]) { inputHandlers[type] = handler; }
      else {
        const prev = inputHandlers[type];
        inputHandlers[type] = (e) => { prev(e); handler(e); };
      }
    },
    offInput(type, handler) {
      // simplified: not needed for these unit tests
    },
    onTick() {},
    schedule() { return 0; },
    cancelScheduled() {},
    emit() {},
    stop() {},
    _fire(type, data) { if (inputHandlers[type]) { inputHandlers[type](data); } },
  };
}

function makeMockDispatcher() {
  const calls = [];
  return {
    sendExchangePass(cardId, toSeat) { calls.push({ cardId, toSeat }); },
    _calls: calls,
  };
}

function makeMockHandView() {
  return {
    setSingleSelected: () => {},
    setInteractive: () => {},
    setDisabledIds: () => {},
    markLeaving: () => {},
    removeLeaving: () => {},
  };
}

const SEATS = { self: 0, left: 1, right: 2, declarerSeat: 0 };

function makeCardExchangeView(overrideSeats) {
  const doc = dom.window.document;
  const el = doc.createElement('div');
  doc.body.appendChild(el);
  const antlion = makeMockAntlion();
  const dispatcher = makeMockDispatcher();
  const handView = makeMockHandView();
  const seats = overrideSeats || SEATS;
  const view = new dom.window.CardExchangeView(el, { antlion, dispatcher, seats, handView });
  return { view, el, antlion, dispatcher, handView };
}

function makeHand(count = 10) {
  const suits = ['♣', '♠', '♥', '♦'];
  const ranks = ['9', 'J', 'Q', 'K', '10', 'A'];
  const cards = [];
  for (let i = 0; i < count; i++) {
    cards.push({ id: i, rank: ranks[i % ranks.length], suit: suits[i % suits.length] });
  }
  return cards;
}

function makeDeclarerSnapshot(overrides = {}) {
  return {
    myHand: makeHand(10),
    exchangePassesCommitted: 0,
    isDeclarerView: true,
    ...overrides,
  };
}

function makeOpponentSnapshot(overrides = {}) {
  return {
    myHand: makeHand(7),
    exchangePassesCommitted: 0,
    isDeclarerView: false,
    ...overrides,
  };
}

// Simulate a card click via the hand-card-click antlion event
function fireHandCardClick(antlion, cardId, doc) {
  const fakeCardEl = doc.createElement('div');
  fakeCardEl.dataset.cardId = String(cardId);
  // wrap in a fake event whose target.closest('[data-card-id]') returns the card el
  const fakeEvent = { target: { closest: (sel) => sel === '[data-card-id]' ? fakeCardEl : null } };
  antlion._fire('hand-card-click', fakeEvent);
}

// ---------------------------------------------------------------------------
// T009 — CardExchangeView: FR-002 / FR-020
// ---------------------------------------------------------------------------

describe('CardExchangeView — declarer view calls setInteractive(true) (FR-002)', () => {
  it('setInteractive is called with true when isDeclarerView: true', () => {
    const { view, handView } = makeCardExchangeView();
    let interactiveValue = null;
    handView.setInteractive = (v) => { interactiveValue = v; };
    view.render(makeDeclarerSnapshot());
    assert.equal(interactiveValue, true, 'setInteractive must be called with true for declarer');
  });

  it('no .card-exchange__waiting element when isDeclarerView: true', () => {
    const { view, el } = makeCardExchangeView();
    view.render(makeDeclarerSnapshot());
    assert.equal(el.querySelector('.card-exchange__waiting'), null,
      'declarer view must not show waiting message');
  });
});

describe('CardExchangeView — opponent view shows waiting message (FR-020)', () => {
  it('renders .card-exchange__waiting element when isDeclarerView: false', () => {
    const { view, el } = makeCardExchangeView({ self: 1, left: 2, right: 0, declarerSeat: 0 });
    view.render(makeOpponentSnapshot());
    const waiting = el.querySelector('.card-exchange__waiting');
    assert.ok(waiting, 'opponent view must render .card-exchange__waiting');
  });

  it('setInteractive is called with false when isDeclarerView: false', () => {
    const { view, handView } = makeCardExchangeView({ self: 1, left: 2, right: 0, declarerSeat: 0 });
    let interactiveValue = null;
    handView.setInteractive = (v) => { interactiveValue = v; };
    view.render(makeOpponentSnapshot());
    assert.equal(interactiveValue, false, 'setInteractive must be called with false for opponent');
  });
});

describe('CardExchangeView — after first pass, remaining dest btn is for other opponent (FR-002)', () => {
  it('after exchangePassesCommitted: 1, tapping a card shows only 1 destination button', () => {
    const { view, el, antlion } = makeCardExchangeView();
    const hand = makeHand(10);
    view.render(makeDeclarerSnapshot({
      myHand: hand, exchangePassesCommitted: 1, exchangePassesToSeats: [1],
    }));

    fireHandCardClick(antlion, hand[0].id, dom.window.document);

    const destBtns = el.querySelectorAll('.card-exchange__dest-btn');
    assert.equal(destBtns.length, 1,
      'after first pass, only one destination button must be shown');
  });

  it('after exchangePassesCommitted: 0, tapping a card shows 2 destination buttons', () => {
    const { view, el, antlion } = makeCardExchangeView();
    const hand = makeHand(10);
    view.render(makeDeclarerSnapshot({ myHand: hand, exchangePassesCommitted: 0 }));

    fireHandCardClick(antlion, hand[0].id, dom.window.document);

    const destBtns = el.querySelectorAll('.card-exchange__dest-btn');
    assert.equal(destBtns.length, 2,
      'before any pass, two destination buttons must be shown');
  });

  // Regression: previously the client used `[left, right].slice(committed)`,
  // which assumed passes were always made in left→right order. When the declarer
  // passed to `right` (seat 2) first, the remaining button incorrectly pointed at
  // the already-used seat, producing "Already passed to that opponent" on the next click.
  it('when right (seat 2) was passed first, remaining button targets the still-available left (seat 1)', () => {
    const { view, el, antlion } = makeCardExchangeView();
    const hand = makeHand(10);
    view.render(makeDeclarerSnapshot({
      myHand: hand, exchangePassesCommitted: 1, exchangePassesToSeats: [2],
    }));

    fireHandCardClick(antlion, hand[0].id, dom.window.document);

    const destBtns = el.querySelectorAll('.card-exchange__dest-btn');
    assert.equal(destBtns.length, 1, 'one button must remain');
    assert.equal(destBtns[0].dataset.seat, '1',
      'remaining button must target the unused opponent (left, seat 1), not the already-used right');
  });
});

describe('CardExchangeView — tapping card then dest btn calls dispatcher.sendExchangePass (FR-002)', () => {
  it('clicking a card then a destination button calls sendExchangePass with correct args', () => {
    const { view, el, antlion, dispatcher } = makeCardExchangeView();
    const snapshot = makeDeclarerSnapshot({ exchangePassesCommitted: 0 });
    view.render(snapshot);

    fireHandCardClick(antlion, snapshot.myHand[0].id, dom.window.document);

    const destBtns = el.querySelectorAll('.card-exchange__dest-btn');
    assert.ok(destBtns.length > 0, 'precondition: dest buttons rendered after card tap');

    destBtns[0].click();

    assert.equal(dispatcher._calls.length, 1, 'sendExchangePass must be called once');
    const call = dispatcher._calls[0];
    assert.equal(typeof call.cardId, 'number', 'cardId must be a number');
    assert.ok(call.toSeat === 1 || call.toSeat === 2, 'toSeat must be a non-declarer seat');
  });

  it('sendExchangePass is called with the selected card id', () => {
    const { view, el, antlion, dispatcher } = makeCardExchangeView();
    const hand = makeHand(10);
    view.render(makeDeclarerSnapshot({ myHand: hand, exchangePassesCommitted: 0 }));

    fireHandCardClick(antlion, hand[3].id, dom.window.document);

    const destBtns = el.querySelectorAll('.card-exchange__dest-btn');
    destBtns[0].click();

    assert.equal(dispatcher._calls[0].cardId, hand[3].id,
      'sendExchangePass must be called with the selected card id');
  });
});
