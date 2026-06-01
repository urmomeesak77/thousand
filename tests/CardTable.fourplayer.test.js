'use strict';

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
  loadModule(dom, 'thousand/CardTable.js');
});

// Minimal antlion stub: CardTable's constructor only needs bindInput + onInput.
function makeMockAntlion() {
  return {
    bindInput() {},
    onInput() {},
  };
}

function makeCardTable() {
  const container = dom.window.document.createElement('div');
  return new dom.window.CardTable(makeMockAntlion(), container);
}

describe('CardTable.slotsForSeat — 4-player support (FR-018)', () => {
  it('returns 4 distinct slots for a 4-player table (self + left + across + right)', () => {
    const table = makeCardTable();
    const slots = table.slotsForSeat(0, 4);

    // per FR-018: four seats must each map to a slot
    assert.equal(Object.keys(slots).length, 4);

    // per FR-018: clockwise from self → left=(s+1), across=(s+2), right=(s+3)
    assert.equal(slots[0], table.getSlot('self'));
    assert.equal(slots[1], table.getSlot('left'));
    assert.equal(slots[2], table.getSlot('across'));
    assert.equal(slots[3], table.getSlot('right'));

    // per FR-018: the four slot positions must be distinct objects
    const positions = [slots[0], slots[1], slots[2], slots[3]];
    const unique = new Set(positions);
    assert.equal(unique.size, 4);
    for (const pos of positions) {
      assert.ok(pos, 'slot position object must exist');
    }
  });

  it('rotates the 4-player mapping with the viewer seat', () => {
    const table = makeCardTable();
    const slots = table.slotsForSeat(2, 4);

    // per FR-018: viewer at seat 2 → left=3, across=0, right=1
    assert.equal(slots[2], table.getSlot('self'));
    assert.equal(slots[3], table.getSlot('left'));
    assert.equal(slots[0], table.getSlot('across'));
    assert.equal(slots[1], table.getSlot('right'));
  });

  it('returns 3 distinct slots for a 3-player table (self + left + right, no across)', () => {
    const table = makeCardTable();
    const slots = table.slotsForSeat(0, 3);

    // per FR-018: three seats, no across slot
    assert.equal(Object.keys(slots).length, 3);
    assert.equal(slots[0], table.getSlot('self'));
    assert.equal(slots[1], table.getSlot('left'));
    assert.equal(slots[2], table.getSlot('right'));

    // per FR-018: no across slot present in a 3-player layout
    const positions = Object.values(slots);
    assert.ok(!positions.includes(table.getSlot('across')));
    assert.equal(new Set(positions).size, 3);
  });

  it('defaults to 3-player behavior when playerCount is omitted', () => {
    const table = makeCardTable();
    const slots = table.slotsForSeat(1);

    // per FR-018: omitted playerCount preserves legacy 3-seat layout
    assert.equal(Object.keys(slots).length, 3);
    assert.equal(slots[1], table.getSlot('self'));
    assert.equal(slots[2], table.getSlot('left'));
    assert.equal(slots[0], table.getSlot('right'));
  });
});
