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
    offInput() {},
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

function makeMockHandView(cardIds = []) {
  const state = { disabledIds: [], interactive: false, cardIds: [...cardIds] };
  return {
    setDisabledIds(ids) { state.disabledIds = ids; },
    setInteractive(v) { state.interactive = v; },
    setSingleSelected() {},
    markLeaving() {},
    getCardIds() { return [...state.cardIds]; },
    _setCardIds(ids) { state.cardIds = [...ids]; },
    _state: state,
  };
}

const DEFAULT_SEATS = { self: 0, left: 1, right: 2 };

function makeTrickPlayView(seats) {
  const doc = dom.window.document;
  const el = doc.createElement('div');
  doc.body.appendChild(el);
  const antlion = makeMockAntlion();
  const dispatcher = makeMockDispatcher();
  const handView = makeMockHandView();
  const view = new dom.window.TrickPlayView(el, {
    antlion, dispatcher, seats: seats || DEFAULT_SEATS, handView,
  });
  return { view, el, antlion, dispatcher, handView };
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

// gameStatus shape used by TrickPlayView.render — mirrors the server view-model
// (viewerIsActive, legalCardIds, collectedTrickCounts, trickNumber).
function makeGameStatus(overrides = {}) {
  return {
    trickNumber: 1,
    collectedTrickCounts: { 0: 0, 1: 0, 2: 0 },
    viewerIsActive: true,
    currentTrumpSuit: null,
    legalCardIds: [0, 1, 2, 3, 4, 5, 6],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// T010 — TrickPlayView: FR-007 / FR-008
// Disabled state is now managed via HandView.setDisabledIds, not rendered in el.
// ---------------------------------------------------------------------------

describe('TrickPlayView — legal cards do not have .card--disabled (FR-007)', () => {
  it('setDisabledIds is called with empty array when all cards are legal', () => {
    const { view, handView } = makeTrickPlayView();
    const handIds = [0, 1, 2, 3];
    handView._setCardIds(handIds);
    view.render(makeGameStatus({ legalCardIds: handIds, viewerIsActive: true }));
    assert.deepEqual(handView._state.disabledIds, [],
      'no cards should be disabled when all are legal');
  });

  it('setDisabledIds receives empty array when all specific cards are legal', () => {
    const { view, handView } = makeTrickPlayView();
    handView._setCardIds([10, 11, 12]);
    view.render(makeGameStatus({ legalCardIds: [10, 11, 12], viewerIsActive: true }));
    assert.deepEqual(handView._state.disabledIds, []);
  });
});

describe('TrickPlayView — illegal cards have .card--disabled (FR-007)', () => {
  it('setDisabledIds receives the non-legal card ids', () => {
    const { view, handView } = makeTrickPlayView();
    handView._setCardIds([0, 1, 2, 3]);
    view.render(makeGameStatus({ legalCardIds: [0], viewerIsActive: true }));
    const disabled = handView._state.disabledIds;
    assert.ok(disabled.includes(1), 'card 1 must be disabled');
    assert.ok(disabled.includes(2), 'card 2 must be disabled');
    assert.ok(disabled.includes(3), 'card 3 must be disabled');
    assert.ok(!disabled.includes(0), 'card 0 (legal) must not be disabled');
  });
});

describe('TrickPlayView — all cards disabled when not my turn (FR-007)', () => {
  it('all card ids are in setDisabledIds when viewerIsActive is false', () => {
    const { view, handView } = makeTrickPlayView();
    const ids = [0, 1, 2, 3, 4];
    handView._setCardIds(ids);
    view.render(makeGameStatus({ legalCardIds: ids, viewerIsActive: false }));
    const disabled = handView._state.disabledIds;
    assert.equal(disabled.length, ids.length, 'every card must be disabled when viewerIsActive is false');
    for (const id of ids) {
      assert.ok(disabled.includes(id), `card ${id} must be disabled`);
    }
  });

  it('even legal cards are disabled when viewerIsActive: false', () => {
    const { view, handView } = makeTrickPlayView();
    const ids = [5, 6, 7];
    handView._setCardIds(ids);
    view.render(makeGameStatus({ legalCardIds: ids, viewerIsActive: false }));
    assert.equal(handView._state.disabledIds.length, ids.length,
      'all cards must be disabled when not my turn');
  });
});

describe('TrickPlayView — collected tricks badge shows count (FR-008)', () => {
  it('.collected-tricks__badge shows "× N" for seat with N tricks', () => {
    const { view, el } = makeTrickPlayView();
    view.render(makeGameStatus({
      collectedTrickCounts: { 0: 2, 1: 0, 2: 1 },
    }));

    const badges = el.querySelectorAll('.collected-tricks__badge');
    assert.ok(badges.length > 0, 'collected-tricks__badge elements must be rendered');
  });

  it('badge text contains the trick count', () => {
    const { view, el } = makeTrickPlayView();
    view.render(makeGameStatus({
      collectedTrickCounts: { 0: 3, 1: 0, 2: 0 },
    }));

    const allBadges = [...el.querySelectorAll('.collected-tricks__badge')];
    assert.ok(allBadges.length > 0, 'precondition: badges exist');
    const hasBadgeWithThree = allBadges.some(b => b.textContent.includes('3'));
    assert.ok(hasBadgeWithThree, 'a badge must display the trick count 3');
  });
});

describe('TrickPlayView — seat 0 badge shows × 3 after render (FR-008)', () => {
  it('after render with collectedTrickCounts: {0: 3, 1: 0, 2: 0}, seat 0 badge shows × 3', () => {
    const { view, el } = makeTrickPlayView();
    view.render(makeGameStatus({
      collectedTrickCounts: { 0: 3, 1: 0, 2: 0 },
    }));

    const selfStack = el.querySelector('[data-seat="0"] .collected-tricks__badge') ||
                      el.querySelector('.collected-tricks--self .collected-tricks__badge') ||
                      el.querySelector('.collected-tricks__badge');

    assert.ok(selfStack, 'seat 0 collected-tricks stack badge must exist');
    assert.ok(selfStack.textContent.includes('3'),
      'seat 0 badge must contain "3"');
  });

  it('seat 0 badge text matches "× 3" format', () => {
    const { view, el } = makeTrickPlayView();
    view.render(makeGameStatus({
      collectedTrickCounts: { 0: 3, 1: 0, 2: 0 },
    }));

    const badges = [...el.querySelectorAll('.collected-tricks__badge')];
    const seat0Badge = badges.find(b => b.textContent.includes('3'));
    assert.ok(seat0Badge, 'a badge with value 3 must exist for seat 0');
    assert.match(seat0Badge.textContent, /[×x]\s*3/, 'badge must show "× 3" or "x 3"');
  });
});
