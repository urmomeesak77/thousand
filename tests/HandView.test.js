'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

let dom;

before(() => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'public', 'js', 'thousand', 'HandView.js'),
    'utf8'
  );
  const stripped = src
    .replace(/^import\s+\S.*$/gm, '')
    .replace(/^export default\s+(\w+);\s*$/gm, 'window.$1 = $1;');

  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  dom.window.eval(stripped);
});

function makeHandView() {
  const container = dom.window.document.createElement('div');
  return new dom.window.HandView(container);
}

function cardIds(hv) {
  return [...hv._container.querySelectorAll('[data-card-id]')].map((el) =>
    Number(el.dataset.cardId)
  );
}

describe('HandView — FR-005 sort order (♣→♠→♥→♦, 9→A within each suit)', () => {
  it('setHand renders cards in left-to-right suit-then-rank order', () => {
    const hv = makeHandView();
    // Deliberately provided in reverse order to test sorting
    hv.setHand([
      { id: 1, rank: 'A', suit: '♦' },   // ♦A → (3,5)
      { id: 2, rank: '9', suit: '♥' },   // ♥9 → (2,0)
      { id: 3, rank: 'K', suit: '♠' },   // ♠K → (1,4)
      { id: 4, rank: '9', suit: '♣' },   // ♣9 → (0,0)  ← first
      { id: 5, rank: 'A', suit: '♠' },   // ♠A → (1,5)
      { id: 6, rank: 'Q', suit: '♦' },   // ♦Q → (3,3)
      { id: 7, rank: '10', suit: '♣' },  // ♣10 → (0,1)
    ]);
    // Expected order: ♣9=4, ♣10=7, ♠K=3, ♠A=5, ♥9=2, ♦Q=6, ♦A=1
    assert.deepEqual(cardIds(hv), [4, 7, 3, 5, 2, 6, 1]);
  });

  it('suits are ordered ♣ < ♠ < ♥ < ♦', () => {
    const hv = makeHandView();
    hv.setHand([
      { id: 1, rank: '9', suit: '♦' },
      { id: 2, rank: '9', suit: '♥' },
      { id: 3, rank: '9', suit: '♠' },
      { id: 4, rank: '9', suit: '♣' },
    ]);
    assert.deepEqual(cardIds(hv), [4, 3, 2, 1]);
  });

  it('ranks within a suit are ordered 9 < 10 < J < Q < K < A', () => {
    const hv = makeHandView();
    hv.setHand([
      { id: 1, rank: 'A', suit: '♣' },
      { id: 2, rank: 'K', suit: '♣' },
      { id: 3, rank: 'Q', suit: '♣' },
      { id: 4, rank: 'J', suit: '♣' },
      { id: 5, rank: '10', suit: '♣' },
      { id: 6, rank: '9', suit: '♣' },
    ]);
    assert.deepEqual(cardIds(hv), [6, 5, 4, 3, 2, 1]);
  });

  it('re-sorting on a second setHand call replaces old content', () => {
    const hv = makeHandView();
    hv.setHand([
      { id: 10, rank: 'A', suit: '♦' },
      { id: 11, rank: '9', suit: '♣' },
    ]);
    assert.deepEqual(cardIds(hv), [11, 10], 'first hand: ♣9 then ♦A');

    hv.setHand([
      { id: 20, rank: 'K', suit: '♠' },
      { id: 21, rank: '9', suit: '♥' },
    ]);
    assert.deepEqual(cardIds(hv), [20, 21], 'second hand: ♠K then ♥9');

    // Old ids must be gone
    const allIds = new Set(cardIds(hv));
    assert.ok(!allIds.has(10), 'old card id 10 must not appear after re-sort');
    assert.ok(!allIds.has(11), 'old card id 11 must not appear after re-sort');
  });

  it('setHand with an empty array clears the container', () => {
    const hv = makeHandView();
    hv.setHand([{ id: 1, rank: '9', suit: '♣' }]);
    hv.setHand([]);
    assert.equal(hv._container.querySelectorAll('[data-card-id]').length, 0);
  });
});
