'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// jsdom setup — load SellSelectionControls and HandView into a shared window
// ---------------------------------------------------------------------------

let dom;

before(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });

  for (const name of ['SellSelectionControls', 'HandView']) {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'public', 'js', 'thousand', `${name}.js`),
      'utf8'
    );
    const stripped = src
      .replace(/^import\s+\S.*$/gm, '')
      .replace(/^export default\s+(\w+);\s*$/gm, 'window.$1 = $1;');
    dom.window.eval(stripped);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Antlion mock whose emit() routes directly to registered onInput handlers,
// simulating the engine event bus within a single synchronous test.
function makeMockAntlion() {
  const handlers = {};
  return {
    bindInput() {},
    onInput(type, handler) { handlers[type] = handler; },
    emit(type, data) { if (handlers[type]) handlers[type](data); },
    _fire(type, data) { if (handlers[type]) handlers[type](data); },
  };
}

function makeControls(antlion) {
  const a = antlion ?? makeMockAntlion();
  const container = dom.window.document.createElement('div');
  const sent = { selects: [], cancels: [] };
  const dispatcher = {
    sendSellSelect(ids) { sent.selects.push(ids); },
    sendSellCancel() { sent.cancels.push(true); },
  };
  const sc = new dom.window.SellSelectionControls(container, a, dispatcher);
  sc.show(); // make visible so event handlers fire
  return { sc, antlion: a, sent, container };
}

function makeHandView(antlion) {
  const a = antlion ?? makeMockAntlion();
  const container = dom.window.document.createElement('div');
  const hv = new dom.window.HandView(container, a);
  return { hv, antlion: a, container };
}

// ---------------------------------------------------------------------------
// T074 — SellSelectionControls: Sell button enabled only at exactly 3 selected
// ---------------------------------------------------------------------------

describe('SellSelectionControls — Sell button state by selection count', () => {
  it('Sell is disabled when 0 cards are selected', () => {
    const { sc, antlion } = makeControls();
    antlion._fire('selectionchanged', []);
    assert.ok(sc._sellBtn.disabled, 'Sell must be disabled at 0 selected');
  });

  it('Sell is disabled when 1 card is selected', () => {
    const { sc, antlion } = makeControls();
    antlion._fire('selectionchanged', [5]);
    assert.ok(sc._sellBtn.disabled, 'Sell must be disabled at 1 selected');
  });

  it('Sell is disabled when 2 cards are selected', () => {
    const { sc, antlion } = makeControls();
    antlion._fire('selectionchanged', [5, 6]);
    assert.ok(sc._sellBtn.disabled, 'Sell must be disabled at 2 selected');
  });

  it('Sell is enabled when exactly 3 cards are selected', () => {
    const { sc, antlion } = makeControls();
    antlion._fire('selectionchanged', [5, 6, 7]);
    assert.equal(sc._sellBtn.disabled, false, 'Sell must be enabled at exactly 3 selected');
  });

  it('Sell is disabled when 4 cards are selected', () => {
    const { sc, antlion } = makeControls();
    antlion._fire('selectionchanged', [5, 6, 7, 8]);
    assert.ok(sc._sellBtn.disabled, 'Sell must be disabled at 4 selected');
  });

  it('Sell is disabled when 5 cards are selected', () => {
    const { sc, antlion } = makeControls();
    antlion._fire('selectionchanged', [5, 6, 7, 8, 9]);
    assert.ok(sc._sellBtn.disabled, 'Sell must be disabled at 5 selected');
  });

  it('counter text reflects the current selection count', () => {
    const { sc, antlion } = makeControls();
    antlion._fire('selectionchanged', [5, 6]);
    assert.equal(sc._counter.textContent, 'Selected: 2 / 3');
  });

  it('counter text shows 3 / 3 when 3 are selected', () => {
    const { sc, antlion } = makeControls();
    antlion._fire('selectionchanged', [5, 6, 7]);
    assert.equal(sc._counter.textContent, 'Selected: 3 / 3');
  });
});

// ---------------------------------------------------------------------------
// T074 — SellSelectionControls: Cancel is always clickable
// ---------------------------------------------------------------------------

describe('SellSelectionControls — Cancel is always clickable', () => {
  it('Cancel is not disabled after show()', () => {
    const { sc } = makeControls();
    assert.equal(sc._cancelBtn.disabled, false, 'Cancel must never be disabled');
  });

  it('Cancel is not disabled even when 0 cards are selected', () => {
    const { sc, antlion } = makeControls();
    antlion._fire('selectionchanged', []);
    assert.equal(sc._cancelBtn.disabled, false);
  });

  it('Cancel is not disabled when Sell is disabled (e.g. 2 selected)', () => {
    const { sc, antlion } = makeControls();
    antlion._fire('selectionchanged', [5, 6]);
    assert.equal(sc._cancelBtn.disabled, false);
  });

  it('clicking Cancel dispatches sendSellCancel', () => {
    const { antlion, sent } = makeControls();
    antlion._fire('sell-cancel-click');
    assert.equal(sent.cancels.length, 1);
  });
});

// ---------------------------------------------------------------------------
// T074 — SellSelectionControls: Sell dispatches selectedIds
// ---------------------------------------------------------------------------

describe('SellSelectionControls — Sell dispatches selected ids', () => {
  it('clicking Sell dispatches sendSellSelect with current 3 selected ids', () => {
    const { antlion, sent } = makeControls();
    antlion._fire('selectionchanged', [5, 6, 7]);
    antlion._fire('sell-confirm-click');
    assert.equal(sent.selects.length, 1, 'sendSellSelect must be called once');
    assert.deepEqual([...sent.selects[0]], [5, 6, 7]);
  });

  it('clicking Sell when fewer than 3 selected does nothing', () => {
    const { antlion, sent } = makeControls();
    antlion._fire('selectionchanged', [5, 6]);
    antlion._fire('sell-confirm-click');
    assert.equal(sent.selects.length, 0, 'sendSellSelect must not be called with < 3 selected');
  });
});

// ---------------------------------------------------------------------------
// T074 — HandView: taps toggle selection state visible in the DOM
// ---------------------------------------------------------------------------

describe('HandView — selection mode: taps toggle selected CSS class in DOM', () => {
  it('tapping a card adds hand-view__card--selected class', () => {
    const { hv, container, antlion } = makeHandView();
    hv.setHand([{ id: 5, rank: 'A', suit: '♣' }]);
    hv.setSelectionMode(true);

    const cardEl = container.querySelector('[data-card-id="5"]');
    assert.ok(cardEl, 'card element must be in DOM');

    antlion._fire('hand-card-click', { target: cardEl });
    assert.ok(
      cardEl.classList.contains('hand-view__card--selected'),
      'card must have selected class after first tap'
    );
  });

  it('tapping the same card again removes the selected CSS class (toggle)', () => {
    const { hv, container, antlion } = makeHandView();
    hv.setHand([{ id: 5, rank: 'A', suit: '♣' }]);
    hv.setSelectionMode(true);

    const cardEl = container.querySelector('[data-card-id="5"]');
    antlion._fire('hand-card-click', { target: cardEl }); // select
    antlion._fire('hand-card-click', { target: cardEl }); // deselect
    assert.ok(
      !cardEl.classList.contains('hand-view__card--selected'),
      'selected class must be removed after second tap'
    );
  });

  it('tapping cards in selection mode emits selectionchanged with the current selected ids', () => {
    const { hv, container, antlion } = makeHandView();
    hv.setHand([
      { id: 3, rank: '9', suit: '♣' },
      { id: 7, rank: 'K', suit: '♠' },
    ]);
    hv.setSelectionMode(true);

    let lastEmitted = null;
    const origEmit = antlion.emit.bind(antlion);
    antlion.emit = (type, data) => {
      if (type === 'selectionchanged') lastEmitted = data;
      origEmit(type, data);
    };

    const card3El = container.querySelector('[data-card-id="3"]');
    antlion._fire('hand-card-click', { target: card3El });
    assert.deepEqual([...lastEmitted], [3], 'selectionchanged must carry [3] after tapping card 3');

    const card7El = container.querySelector('[data-card-id="7"]');
    antlion._fire('hand-card-click', { target: card7El });
    assert.deepEqual([...lastEmitted].sort((a, b) => a - b), [3, 7]);
  });

  it('HandView taps reach SellSelectionControls when they share an antlion (integration)', () => {
    const antlion = makeMockAntlion();
    const { hv, container } = makeHandView(antlion);
    const { sc } = makeControls(antlion); // shares same antlion

    hv.setHand([
      { id: 1, rank: '9', suit: '♣' },
      { id: 2, rank: '10', suit: '♣' },
      { id: 3, rank: 'J', suit: '♣' },
    ]);
    hv.setSelectionMode(true);

    // Tap 3 cards — selectionchanged propagates through shared antlion
    for (const id of [1, 2, 3]) {
      const el = container.querySelector(`[data-card-id="${id}"]`);
      antlion._fire('hand-card-click', { target: el });
    }

    assert.equal(sc._sellBtn.disabled, false, 'Sell must be enabled when 3 cards are tapped');
  });

  it('disabling selection mode clears the selected class on all cards', () => {
    const { hv, container, antlion } = makeHandView();
    hv.setHand([{ id: 5, rank: 'A', suit: '♣' }]);
    hv.setSelectionMode(true);

    const cardEl = container.querySelector('[data-card-id="5"]');
    antlion._fire('hand-card-click', { target: cardEl }); // select
    assert.ok(cardEl.classList.contains('hand-view__card--selected'));

    hv.setSelectionMode(false);
    assert.ok(
      !cardEl.classList.contains('hand-view__card--selected'),
      'selected class must be removed when selection mode is disabled'
    );
  });

  it('tapping a card when selection mode is off has no effect', () => {
    const { hv, container, antlion } = makeHandView();
    hv.setHand([{ id: 5, rank: 'A', suit: '♣' }]);
    // selection mode NOT enabled (default)

    const cardEl = container.querySelector('[data-card-id="5"]');
    antlion._fire('hand-card-click', { target: cardEl });
    assert.ok(
      !cardEl.classList.contains('hand-view__card--selected'),
      'no selection when selection mode is off'
    );
  });
});
