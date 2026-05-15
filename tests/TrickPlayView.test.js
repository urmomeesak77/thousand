'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

// ---------------------------------------------------------------------------
// jsdom setup — load TrickPlayView dependencies in dependency order
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
  loadModule(dom, 'thousand/MarriageDeclarationPrompt.js');
  loadModule(dom, 'thousand/TrickPlayView.js');
});

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeMockAntlion() {
  const handlers = {};
  return {
    bindInput(el, event, type) {
      el.addEventListener(event, (e) => { if (handlers[type]) handlers[type](e); });
    },
    onInput(type, handler) { handlers[type] = handler; },
    onTick() {},
    schedule() { return 0; },
    cancelScheduled() {},
    emit() {},
    stop() {},
  };
}

function makeMockDispatcher() {
  const calls = [];
  return {
    sendPlayCard(cardId) { calls.push({ cardId }); },
    _calls: calls,
  };
}

const DEFAULT_SEATS = { self: 0, left: 1, right: 2 };

function makeTrickPlayView(seats) {
  const doc = dom.window.document;
  const el = doc.createElement('div');
  doc.body.appendChild(el);
  const antlion = makeMockAntlion();
  const dispatcher = makeMockDispatcher();
  const view = new dom.window.TrickPlayView(el, { antlion, dispatcher, seats: seats || DEFAULT_SEATS });
  return { view, el, antlion, dispatcher };
}

function makeHand(ids) {
  const suits = ['♣', '♠', '♥', '♦'];
  const ranks = ['9', 'J', 'Q', 'K', '10', 'A'];
  return ids.map((id) => ({
    id,
    rank: ranks[id % ranks.length],
    suit: suits[id % suits.length],
  }));
}

function makeSnapshot(overrides = {}) {
  return {
    myHand: makeHand([0, 1, 2, 3, 4, 5, 6]),
    currentTrick: [],
    currentTrickLeaderSeat: 0,
    trickNumber: 1,
    collectedTrickCounts: { 0: 0, 1: 0, 2: 0 },
    isMyTurn: true,
    ledSuit: null,
    currentTrumpSuit: null,
    legalCardIds: [0, 1, 2, 3, 4, 5, 6],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// T010 — TrickPlayView: FR-007 / FR-008
// ---------------------------------------------------------------------------

describe('TrickPlayView — legal cards do not have .card--disabled (FR-007)', () => {
  it('cards in legalCardIds do not have .card--disabled class', () => {
    const { view, el } = makeTrickPlayView();
    const handIds = [0, 1, 2, 3];
    view.render(makeSnapshot({
      myHand: makeHand(handIds),
      legalCardIds: handIds,
      isMyTurn: true,
    }));

    const cards = el.querySelectorAll('.hand-card, .card');
    assert.ok(cards.length > 0, 'precondition: cards must be rendered');
    for (const card of cards) {
      assert.ok(!card.classList.contains('card--disabled'),
        'legal card must not have .card--disabled class');
    }
  });

  it('a specific legal card does not have .card--disabled', () => {
    const { view, el } = makeTrickPlayView();
    view.render(makeSnapshot({
      myHand: makeHand([10, 11, 12]),
      legalCardIds: [10, 11, 12],
      isMyTurn: true,
    }));
    const disabled = el.querySelectorAll('.card--disabled');
    assert.equal(disabled.length, 0, 'no cards should be disabled when all are legal');
  });
});

describe('TrickPlayView — illegal cards have .card--disabled (FR-007)', () => {
  it('cards not in legalCardIds have .card--disabled class', () => {
    const { view, el } = makeTrickPlayView();
    view.render(makeSnapshot({
      myHand: makeHand([0, 1, 2, 3]),
      legalCardIds: [0], // only card 0 is legal; 1, 2, 3 are not
      isMyTurn: true,
    }));

    // Cards with data-id not in legalCardIds should be disabled
    const allCards = el.querySelectorAll('[data-card-id]');
    assert.ok(allCards.length > 0, 'precondition: cards must be rendered with data-card-id');

    let disabledCount = 0;
    for (const card of allCards) {
      const id = Number(card.dataset.cardId);
      if (id !== 0) {
        assert.ok(card.classList.contains('card--disabled'),
          `card ${id} (not legal) must have .card--disabled`);
        disabledCount++;
      }
    }
    assert.ok(disabledCount > 0, 'at least one card must be disabled');
  });
});

describe('TrickPlayView — all cards disabled when not my turn (FR-007)', () => {
  it('all cards have .card--disabled when isMyTurn is false', () => {
    const { view, el } = makeTrickPlayView();
    view.render(makeSnapshot({
      myHand: makeHand([0, 1, 2, 3, 4]),
      legalCardIds: [0, 1, 2, 3, 4],
      isMyTurn: false,
    }));

    const allCards = el.querySelectorAll('[data-card-id]');
    assert.ok(allCards.length > 0, 'precondition: cards must be rendered');
    for (const card of allCards) {
      assert.ok(card.classList.contains('card--disabled'),
        'every card must be disabled when isMyTurn is false');
    }
  });

  it('even legal cards are disabled when isMyTurn: false', () => {
    const { view, el } = makeTrickPlayView();
    view.render(makeSnapshot({
      myHand: makeHand([5, 6, 7]),
      legalCardIds: [5, 6, 7],
      isMyTurn: false,
    }));

    const disabled = el.querySelectorAll('.card--disabled');
    const allCards = el.querySelectorAll('[data-card-id]');
    assert.equal(disabled.length, allCards.length,
      'all cards must be disabled when not my turn');
  });
});

describe('TrickPlayView — collected tricks badge shows count (FR-008)', () => {
  it('.collected-tricks__badge shows "× N" for seat with N tricks', () => {
    const { view, el } = makeTrickPlayView();
    view.render(makeSnapshot({
      collectedTrickCounts: { 0: 2, 1: 0, 2: 1 },
    }));

    const badges = el.querySelectorAll('.collected-tricks__badge');
    assert.ok(badges.length > 0, 'collected-tricks__badge elements must be rendered');
  });

  it('badge text contains the trick count', () => {
    const { view, el } = makeTrickPlayView();
    view.render(makeSnapshot({
      collectedTrickCounts: { 0: 3, 1: 0, 2: 0 },
    }));

    const allBadges = [...el.querySelectorAll('.collected-tricks__badge')];
    assert.ok(allBadges.length > 0, 'precondition: badges exist');
    // At least one badge should contain "3"
    const hasBadgeWithThree = allBadges.some(b => b.textContent.includes('3'));
    assert.ok(hasBadgeWithThree, 'a badge must display the trick count 3');
  });
});

describe('TrickPlayView — seat 0 badge shows × 3 after render (FR-008)', () => {
  it('after render with collectedTrickCounts: {0: 3, 1: 0, 2: 0}, seat 0 badge shows × 3', () => {
    const { view, el } = makeTrickPlayView();
    view.render(makeSnapshot({
      collectedTrickCounts: { 0: 3, 1: 0, 2: 0 },
    }));

    // Seat 0 is self in this view; find the self/seat-0 stack badge
    const selfStack = el.querySelector('[data-seat="0"] .collected-tricks__badge') ||
                      el.querySelector('.collected-tricks--self .collected-tricks__badge') ||
                      el.querySelector('.collected-tricks__badge');

    assert.ok(selfStack, 'seat 0 collected-tricks stack badge must exist');
    assert.ok(selfStack.textContent.includes('3'),
      'seat 0 badge must contain "3"');
  });

  it('seat 0 badge text matches "× 3" format', () => {
    const { view, el } = makeTrickPlayView();
    view.render(makeSnapshot({
      collectedTrickCounts: { 0: 3, 1: 0, 2: 0 },
    }));

    const badges = [...el.querySelectorAll('.collected-tricks__badge')];
    const seat0Badge = badges.find(b => b.textContent.includes('3'));
    assert.ok(seat0Badge, 'a badge with value 3 must exist for seat 0');
    assert.match(seat0Badge.textContent, /[×x]\s*3/, 'badge must show "× 3" or "x 3"');
  });
});
