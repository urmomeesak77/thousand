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
  return {
    bindInput() {},
    onInput() {},
    onTick() {},
    schedule() { return 0; },
    cancelScheduled() {},
    emit() {},
  };
}

function makeMockDispatcher() {
  const calls = [];
  return {
    sendExchangePass(cardId, toSeat) { calls.push({ cardId, toSeat }); },
    _calls: calls,
  };
}

const SEATS = { self: 0, left: 1, right: 2, declarerSeat: 0 };

function makeCardExchangeView(overrideSeats) {
  const doc = dom.window.document;
  const el = doc.createElement('div');
  doc.body.appendChild(el);
  const antlion = makeMockAntlion();
  const dispatcher = makeMockDispatcher();
  const seats = overrideSeats || SEATS;
  const view = new dom.window.CardExchangeView(el, { antlion, dispatcher, seats });
  return { view, el, antlion, dispatcher };
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

// ---------------------------------------------------------------------------
// T009 — CardExchangeView: FR-002 / FR-020
// ---------------------------------------------------------------------------

// Test 1: Declarer view shows 10 cards with .card-exchange__card elements
describe('CardExchangeView — declarer view shows 10 cards (FR-002)', () => {
  it('renders 10 .card-exchange__card elements when isDeclarerView: true', () => {
    const { view, el } = makeCardExchangeView();
    view.render(makeDeclarerSnapshot());
    const cards = el.querySelectorAll('.card-exchange__card');
    assert.equal(cards.length, 10, 'declarer view must render 10 cards');
  });

  it('no .card-exchange__waiting element when isDeclarerView: true', () => {
    const { view, el } = makeCardExchangeView();
    view.render(makeDeclarerSnapshot());
    assert.equal(el.querySelector('.card-exchange__waiting'), null,
      'declarer view must not show waiting message');
  });
});

// Test 2: Opponent view shows .card-exchange__waiting
describe('CardExchangeView — opponent view shows waiting message (FR-020)', () => {
  it('renders .card-exchange__waiting element when isDeclarerView: false', () => {
    const { view, el } = makeCardExchangeView({ self: 1, left: 2, right: 0, declarerSeat: 0 });
    view.render(makeOpponentSnapshot());
    const waiting = el.querySelector('.card-exchange__waiting');
    assert.ok(waiting, 'opponent view must render .card-exchange__waiting');
  });

  it('does not render card elements when isDeclarerView: false', () => {
    const { view, el } = makeCardExchangeView({ self: 1, left: 2, right: 0, declarerSeat: 0 });
    view.render(makeOpponentSnapshot());
    const cards = el.querySelectorAll('.card-exchange__card');
    assert.equal(cards.length, 0, 'opponent view must not render individual cards');
  });
});

// Test 3: After first pass, destination buttons only show the other opponent's seat
describe('CardExchangeView — after first pass, remaining dest btn is for other opponent (FR-002)', () => {
  it('after exchangePassesCommitted: 1, tapping a card shows only 1 destination button', () => {
    const { view, el } = makeCardExchangeView();
    // First pass already committed: only one destination remains
    view.render(makeDeclarerSnapshot({ exchangePassesCommitted: 1 }));
    const cards = el.querySelectorAll('.card-exchange__card');
    assert.ok(cards.length > 0, 'precondition: cards are rendered');

    // Simulate tapping the first card
    cards[0].click();

    const destBtns = el.querySelectorAll('.card-exchange__dest-btn');
    assert.equal(destBtns.length, 1,
      'after first pass, only one destination button must be shown');
  });

  it('after exchangePassesCommitted: 0, tapping a card shows 2 destination buttons', () => {
    const { view, el } = makeCardExchangeView();
    view.render(makeDeclarerSnapshot({ exchangePassesCommitted: 0 }));
    const cards = el.querySelectorAll('.card-exchange__card');
    assert.ok(cards.length > 0, 'precondition: cards are rendered');

    // Simulate tapping the first card
    cards[0].click();

    const destBtns = el.querySelectorAll('.card-exchange__dest-btn');
    assert.equal(destBtns.length, 2,
      'before any pass, two destination buttons must be shown');
  });
});

// Test 4: Tapping a card + destination button calls dispatcher.sendExchangePass
describe('CardExchangeView — tapping card then dest btn calls dispatcher.sendExchangePass (FR-002)', () => {
  it('clicking a card then a destination button calls sendExchangePass with correct args', () => {
    const { view, el, dispatcher } = makeCardExchangeView();
    const snapshot = makeDeclarerSnapshot({ exchangePassesCommitted: 0 });
    view.render(snapshot);

    const cards = el.querySelectorAll('.card-exchange__card');
    assert.ok(cards.length > 0, 'precondition: cards rendered');

    // Tap first card to select it
    cards[0].click();

    const destBtns = el.querySelectorAll('.card-exchange__dest-btn');
    assert.ok(destBtns.length > 0, 'precondition: dest buttons rendered after card tap');

    // Tap first destination button
    destBtns[0].click();

    assert.equal(dispatcher._calls.length, 1, 'sendExchangePass must be called once');
    const call = dispatcher._calls[0];
    assert.equal(typeof call.cardId, 'number', 'cardId must be a number');
    assert.ok(call.toSeat === 1 || call.toSeat === 2, 'toSeat must be a non-declarer seat');
  });

  it('sendExchangePass is called with the selected card id', () => {
    const { view, el, dispatcher } = makeCardExchangeView();
    const hand = makeHand(10);
    view.render(makeDeclarerSnapshot({ myHand: hand, exchangePassesCommitted: 0 }));

    const cards = el.querySelectorAll('.card-exchange__card');
    cards[0].click();

    const destBtns = el.querySelectorAll('.card-exchange__dest-btn');
    destBtns[0].click();

    // The first card's id should be passed
    assert.equal(dispatcher._calls[0].cardId, hand[0].id,
      'sendExchangePass must be called with the selected card id');
  });
});
