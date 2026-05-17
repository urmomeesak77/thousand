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
  const scheduled = [];
  let nextScheduleId = 1;
  return {
    bindInput(el, event, type) {
      el.addEventListener(event, (e) => { if (handlers[type]) handlers[type](e); });
    },
    onInput(type, handler) { handlers[type] = handler; },
    offInput() {},
    onTick() { return () => {}; },
    schedule(delay, cb) {
      const id = nextScheduleId++;
      scheduled.push({ id, delay, cb });
      return id;
    },
    cancelScheduled(id) {
      const idx = scheduled.findIndex((s) => s.id === id);
      if (idx !== -1) { scheduled.splice(idx, 1); }
    },
    emit() {},
    stop() {},
    _scheduled: scheduled,
    _fireScheduled() {
      const entries = scheduled.splice(0, scheduled.length);
      for (const { cb } of entries) { cb(); }
    },
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

function makeTrickPlayView(seats, opts = {}) {
  const doc = dom.window.document;
  const el = doc.createElement('div');
  doc.body.appendChild(el);
  const trickCenterEl = doc.createElement('div');
  doc.body.appendChild(trickCenterEl);
  const seatEls = {
    [DEFAULT_SEATS.self]: (() => { const e = doc.createElement('div'); doc.body.appendChild(e); return e; })(),
    [DEFAULT_SEATS.left]: (() => { const e = doc.createElement('div'); doc.body.appendChild(e); return e; })(),
    [DEFAULT_SEATS.right]: (() => { const e = doc.createElement('div'); doc.body.appendChild(e); return e; })(),
  };
  const lockCalls = [];
  const antlion = makeMockAntlion();
  const dispatcher = makeMockDispatcher();
  const handView = makeMockHandView();
  const view = new dom.window.TrickPlayView(el, {
    antlion,
    dispatcher,
    seats: seats || DEFAULT_SEATS,
    handView,
    cardsById: opts.cardsById ?? {},
    trickCenterEl,
    getSeatEl: (s) => seatEls[s] ?? null,
    setControlsLocked: (v) => lockCalls.push(v),
  });
  return { view, el, antlion, dispatcher, handView, trickCenterEl, seatEls, lockCalls };
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

// ---------------------------------------------------------------------------
// Trick centre — visible animated card play (this work)
// ---------------------------------------------------------------------------

describe('TrickPlayView — trick centre renders cards from gameStatus.currentTrick', () => {
  it('on initial render with currentTrick, centre slots receive face-up card sprites', () => {
    const { view, trickCenterEl } = makeTrickPlayView();
    view.render(makeGameStatus({
      currentTrick: [
        { seat: 0, cardId: 12, rank: 'A', suit: '♥' },
        { seat: 1, cardId: 5, rank: '10', suit: '♣' },
      ],
    }));

    const sprites = trickCenterEl.querySelectorAll('.trick-center__slot .card-sprite');
    assert.equal(sprites.length, 2, 'expected 2 card sprites in centre slots');

    const selfSlot = trickCenterEl.querySelector('.trick-center__slot--self .card-sprite');
    const leftSlot = trickCenterEl.querySelector('.trick-center__slot--left .card-sprite');
    assert.ok(selfSlot, 'self slot must hold the self card');
    assert.ok(leftSlot, 'left slot must hold the left-opponent card');
  });

  it('three slots (self, left, right) exist in the centre container', () => {
    const { trickCenterEl } = makeTrickPlayView();
    assert.ok(trickCenterEl.querySelector('.trick-center__slot--self'));
    assert.ok(trickCenterEl.querySelector('.trick-center__slot--left'));
    assert.ok(trickCenterEl.querySelector('.trick-center__slot--right'));
  });
});

describe('TrickPlayView — opponent card_played spawns a flight clone', () => {
  it('notifyCardPlayed + render with cardsById entry creates a card-flight-clone in document.body', () => {
    const doc = dom.window.document;
    const cardsById = { 7: { id: 7, rank: 'K', suit: '♠' } };
    const { view, trickCenterEl } = makeTrickPlayView(DEFAULT_SEATS, { cardsById });

    // Opponent (seat 1 / left) plays card 7. No prior centre cards.
    view.notifyCardPlayed(1, 7);
    view.render(makeGameStatus({
      currentTrick: [{ seat: 1, cardId: 7, rank: 'K', suit: '♠' }],
    }));

    const clones = doc.querySelectorAll('.card-flight-clone');
    assert.equal(clones.length, 1, 'one in-flight clone must exist');
    // The centre slot is reserved (committed) but hidden until flight lands.
    const leftSlotSprite = trickCenterEl.querySelector('.trick-center__slot--left .card-sprite');
    assert.ok(leftSlotSprite, 'destination slot must hold a placeholder card');
    view.destroy();
    assert.equal(doc.querySelectorAll('.card-flight-clone').length, 0,
      'destroy() must clean up flight clones');
  });
});

describe('TrickPlayView — trick resolve schedules collect-flight after pause', () => {
  it('counts diff triggers controls-lock, 350ms pause holds 3 cards, then spawns collect-flight', () => {
    const doc = dom.window.document;
    const cardsById = {
      1: { id: 1, rank: 'A', suit: '♣' },
      2: { id: 2, rank: 'K', suit: '♣' },
      3: { id: 3, rank: 'Q', suit: '♣' },
    };
    const { view, trickCenterEl, antlion, lockCalls } = makeTrickPlayView(DEFAULT_SEATS, { cardsById });

    // Render with 2 cards already on the table (first 2 plays of the trick).
    view.render(makeGameStatus({
      currentTrick: [
        { seat: 0, cardId: 1, rank: 'A', suit: '♣' },
        { seat: 1, cardId: 2, rank: 'K', suit: '♣' },
      ],
    }));
    // Baseline: no flight clones outstanding at this point.
    const clonesBefore = doc.querySelectorAll('.card-flight-clone').length;

    // Now the 3rd card (seat 2) is played and resolves the trick.
    // Server clears currentTrick and bumps collectedTrickCounts[0] → winner=seat 0.
    view.notifyCardPlayed(2, 3);
    view.render(makeGameStatus({
      currentTrick: [],
      collectedTrickCounts: { 0: 1, 1: 0, 2: 0 },
    }));

    assert.deepEqual(lockCalls, [true], 'controls must be locked when trick resolves');
    assert.equal(antlion._scheduled.length, 2,
      'two schedules: 350ms pause for the collect-flight and a setTimeout-based safety-net release');
    assert.equal(trickCenterEl.querySelectorAll('.card-sprite').length, 3,
      '3 cards must be visible during the resolve pause');

    // Fire the pause callback in isolation so we can assert flights spawned before
    // the safety-net fires and clears the centre.
    const pauseEntry = antlion._scheduled.shift();
    pauseEntry.cb();

    const clonesAfter = doc.querySelectorAll('.card-flight-clone').length;
    assert.equal(clonesAfter - clonesBefore, 3,
      'pause callback must spawn 3 collect-flight clones (one per centre card)');

    // Now drain the remaining safety-net schedule.
    antlion._fireScheduled();

    // destroy cleans up the clones and tears down the centre.
    view.destroy();
    assert.equal(doc.querySelectorAll('.card-flight-clone').length, clonesBefore,
      'destroy must remove the collect-flight clones');
  });
});

describe('TrickPlayView — destroy clears centre and removes class', () => {
  it('clears trick-center class and DOM children', () => {
    const { view, trickCenterEl } = makeTrickPlayView();
    view.render(makeGameStatus({
      currentTrick: [{ seat: 0, cardId: 1, rank: 'A', suit: '♥' }],
    }));
    assert.ok(trickCenterEl.classList.contains('trick-center'));

    view.destroy();
    assert.ok(!trickCenterEl.classList.contains('trick-center'),
      'trick-center class must be removed');
    assert.equal(trickCenterEl.children.length, 0,
      'trick centre must be empty after destroy');
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
