'use strict';

const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

// ---------------------------------------------------------------------------
// jsdom setup — DealAnimation only needs CardSprite (+ its cardSymbols dep).
// ---------------------------------------------------------------------------

let dom;

before(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  loadModule(dom, 'thousand/cardSymbols.js');
  loadModule(dom, 'thousand/CardSprite.js');
  loadModule(dom, 'thousand/DealAnimation.js');
});

// A controllable clock: DealAnimation/CardSprite both read performance.now().
let now = 0;
beforeEach(() => {
  now = 0;
  dom.window.performance.now = () => now;
});
afterEach(() => {
  delete dom.window.performance.now;
});

// Antlion stub: capture the registered tick handler so the test can pump it.
function makeMockAntlion() {
  let tickHandler = null;
  return {
    onTick(handler) {
      tickHandler = handler;
      return () => { tickHandler = null; };
    },
    _tick() { if (tickHandler) {tickHandler();} },
    get _hasTick() { return tickHandler !== null; },
  };
}

// Fake CardTable that records every slotsForSeat call and returns a real
// 4-seat mapping (mirrors CardTable's own 4-player layout) so we can assert
// the across seat resolves to a defined, distinct destination slot.
function makeSpyCardTable() {
  const slotPositions = {
    deckOrigin: { x: 500, y: 0 },
    talon: { x: 500, y: 250 },
    self: { x: 500, y: 500 },
    left: { x: 100, y: 250 },
    across: { x: 500, y: 50 },
    right: { x: 900, y: 250 },
  };
  const calls = [];
  return {
    calls,
    getSlot(name) { return slotPositions[name]; },
    slotsForSeat(viewerSeat, playerCount) {
      calls.push({ viewerSeat, playerCount });
      if (playerCount === 4) {
        return {
          [viewerSeat]: slotPositions.self,
          [(viewerSeat + 1) % 4]: slotPositions.left,
          [(viewerSeat + 2) % 4]: slotPositions.across,
          [(viewerSeat + 3) % 4]: slotPositions.right,
        };
      }
      return {
        [viewerSeat]: slotPositions.self,
        [(viewerSeat + 1) % 3]: slotPositions.left,
        [(viewerSeat + 2) % 3]: slotPositions.right,
      };
    },
    _slotPositions: slotPositions,
  };
}

// Pump ticks until the animation reports it is no longer running. Advances the
// shared clock generously per tick so card moves (200ms) and the 80ms-spaced
// launch schedule both complete.
function runToCompletion(antlion, animation) {
  let guard = 0;
  while (animation.isRunning && guard < 1000) {
    now += 100;
    antlion._tick();
    guard += 1;
  }
}

describe('DealAnimation — four-player across-seat slot (FR-018)', () => {
  it('requests slots for playerCount=4 and includes the across seat key', () => {
    // per FR-018: viewer at seat 1 in a 4-player game; across is seat 3.
    const antlion = makeMockAntlion();
    const table = makeSpyCardTable();
    const container = dom.window.document.createElement('div');

    // One card destined for the across seat (seat 3 relative to viewer seat 1).
    const sequence = [{ id: 'c-across', to: 'seat3' }];
    const cardsById = {};

    const animation = new dom.window.DealAnimation(
      antlion, sequence, cardsById, 1, 4, table, () => {},
    );
    animation.start(container);
    runToCompletion(antlion, animation);

    // per FR-018: the deal must consult slotsForSeat with the real player count.
    assert.ok(table.calls.length > 0, 'slotsForSeat was consulted');
    assert.ok(
      table.calls.every((c) => c.playerCount === 4),
      'slotsForSeat always called with playerCount=4',
    );

    // per FR-018: the across seat (3) must be a key in the returned mapping.
    const mapping = table.slotsForSeat(1, 4);
    assert.ok(Object.prototype.hasOwnProperty.call(mapping, 3), 'across seat 3 has a slot');
    assert.equal(mapping[3], table._slotPositions.across);
  });

  it('flies the across-seat card to the across slot, not the deck origin', () => {
    // per FR-018: previously the across card got an undefined dest and stuck at origin.
    const antlion = makeMockAntlion();
    const table = makeSpyCardTable();
    const container = dom.window.document.createElement('div');

    const sequence = [{ id: 'c-across', to: 'seat3' }];
    const animation = new dom.window.DealAnimation(
      antlion, sequence, {}, 1, 4, table, () => {},
    );
    animation.start(container);
    runToCompletion(antlion, animation);

    const sprite = container.querySelector('.card-sprite');
    assert.ok(sprite, 'a sprite was appended for the across card');

    const finalLeft = parseInt(sprite.style.left, 10);
    const finalTop = parseInt(sprite.style.top, 10);
    const across = table._slotPositions.across;
    const origin = table._slotPositions.deckOrigin;

    // per FR-018: the card lands at the across slot...
    assert.equal(finalLeft, across.x, 'across card x matches across slot');
    assert.equal(finalTop, across.y, 'across card y matches across slot');
    // ...and is NOT left stranded at the deck origin (the pre-fix bug).
    assert.notEqual(finalTop, origin.y, 'across card did not stay at deck origin');
  });
});
