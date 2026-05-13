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
  for (const mod of [
    'thousand/constants.js',
    'utils/HtmlUtil.js',
    'thousand/BiddingControls.js',
    'thousand/BidControls.js',
  ]) {
    loadModule(dom, mod);
  }
});

// Minimal Antlion mock: stores onInput handlers; bindInput is a no-op
// (tests trigger handlers directly via antlion._fire(type)).
function makeMockAntlion() {
  const handlers = {};
  return {
    bindInput() {},
    onInput(type, handler) { handlers[type] = handler; },
    _fire(type) { if (handlers[type]) handlers[type](); },
  };
}

function makeControls({ currentHighBid = undefined, isActiveBidder = true, isEligible = true } = {}) {
  const container = dom.window.document.createElement('div');
  const antlion = makeMockAntlion();
  const sent = { bids: [], passes: [] };
  const dispatcher = {
    sendBid(amount) { sent.bids.push(amount); },
    sendPass() { sent.passes.push(true); },
  };
  const bc = new dom.window.BidControls(container, antlion, dispatcher);
  if (currentHighBid !== undefined) {
    bc.setCurrentHighBid(currentHighBid);
  }
  bc.setActiveState({ isActiveBidder, isEligible });
  return { bc, antlion, sent };
}

describe('BidControls — smallestLegalBid and initial input value', () => {
  it('with currentHighBid = null (no bid yet) the field initialises to 100', () => {
    const { bc } = makeControls({ currentHighBid: null });
    assert.equal(bc._input.value, '100');
    assert.equal(bc._smallestLegalBid, 100);
  });

  it('with currentHighBid = 100 (a bid of 100 accepted) the field initialises to 105', () => {
    const { bc } = makeControls({ currentHighBid: 100 });
    assert.equal(bc._input.value, '105');
    assert.equal(bc._smallestLegalBid, 105);
  });

  it('with currentHighBid = 295 the field initialises to 300 (+5 clamps to cap)', () => {
    const { bc } = makeControls({ currentHighBid: 295 });
    assert.equal(bc._input.value, '300');
    assert.equal(bc._smallestLegalBid, 300);
  });
});

describe('BidControls — cap reached (currentHighBid = 300)', () => {
  it('numeric input, both steppers, and Bid are disabled; only Pass remains operable', () => {
    const { bc } = makeControls({ currentHighBid: 300 });
    assert.ok(bc._input.disabled, 'input must be disabled at cap');
    assert.ok(bc._decreaseBtn.disabled, 'decrease button must be disabled at cap');
    assert.ok(bc._increaseBtn.disabled, 'increase button must be disabled at cap');
    assert.ok(bc._bidBtn.disabled, 'Bid button must be disabled at cap');
    assert.equal(bc._passBtn.disabled, false, 'Pass must remain operable at cap');
  });
});

describe('BidControls — stepper clamps', () => {
  it('decrease clamps to smallestLegalBid', () => {
    const { bc, antlion } = makeControls({ currentHighBid: null }); // smallest = 100
    bc._input.value = '100'; // already at floor
    antlion._fire('bid-decrease-click');
    assert.equal(bc._input.value, '100', 'should not go below 100');
  });

  it('decrease steps down by 5 when above the floor', () => {
    const { bc, antlion } = makeControls({ currentHighBid: null });
    bc._input.value = '120';
    antlion._fire('bid-decrease-click');
    assert.equal(bc._input.value, '115');
  });

  it('increase clamps to 300', () => {
    const { bc, antlion } = makeControls({ currentHighBid: null });
    bc._input.value = '300';
    antlion._fire('bid-increase-click');
    assert.equal(bc._input.value, '300', 'should not exceed 300');
  });

  it('increase steps up by 5', () => {
    const { bc, antlion } = makeControls({ currentHighBid: null });
    bc._input.value = '100';
    antlion._fire('bid-increase-click');
    assert.equal(bc._input.value, '105');
  });
});

describe('BidControls — Bid button validity based on typed input', () => {
  it('typing 107 (non-multiple of 5) disables the Bid button', () => {
    const { bc, antlion } = makeControls({ currentHighBid: null });
    bc._input.value = '107';
    antlion._fire('bid-input-change');
    assert.ok(bc._bidBtn.disabled, 'Bid must be disabled for non-multiple-of-5');
  });

  it('typing 200 (valid) enables the Bid button', () => {
    const { bc, antlion } = makeControls({ currentHighBid: null });
    bc._input.value = '200';
    antlion._fire('bid-input-change');
    assert.equal(bc._bidBtn.disabled, false, 'Bid must be enabled for a valid value');
  });

  it('typing below smallestLegalBid disables Bid', () => {
    const { bc, antlion } = makeControls({ currentHighBid: 100 }); // smallest = 105
    bc._input.value = '100';
    antlion._fire('bid-input-change');
    assert.ok(bc._bidBtn.disabled, 'Bid must be disabled below smallestLegalBid');
  });
});

describe('BidControls — Pass is always operable for the active bidder', () => {
  it('Pass is clickable at initial state', () => {
    const { bc } = makeControls({ currentHighBid: null });
    assert.equal(bc._passBtn.disabled, false);
  });

  it('Pass is clickable when cap is reached (currentHighBid = 300)', () => {
    const { bc } = makeControls({ currentHighBid: 300 });
    assert.equal(bc._passBtn.disabled, false);
  });

  it('Pass is clickable when an invalid value is typed', () => {
    const { bc, antlion } = makeControls({ currentHighBid: null });
    bc._input.value = '107';
    antlion._fire('bid-input-change');
    assert.equal(bc._passBtn.disabled, false);
  });
});

describe('BidControls — visibility states (setActiveState)', () => {
  it('hidden when isEligible is false', () => {
    const { bc } = makeControls({ currentHighBid: null, isActiveBidder: false, isEligible: false });
    assert.ok(bc._el.classList.contains('hidden'));
  });

  it('disabled when eligible-but-not-active-bidder', () => {
    const { bc } = makeControls({ currentHighBid: null, isActiveBidder: false, isEligible: true });
    assert.ok(!bc._el.classList.contains('hidden'), 'element must not be hidden');
    assert.ok(bc._input.disabled, 'input disabled in waiting state');
    assert.ok(bc._bidBtn.disabled, 'Bid disabled in waiting state');
  });

  it('operable when isActiveBidder and isEligible are both true', () => {
    const { bc } = makeControls({ currentHighBid: null, isActiveBidder: true, isEligible: true });
    assert.ok(!bc._el.classList.contains('hidden'));
    assert.equal(bc._input.disabled, false);
  });
});

describe('BidControls — submit actions', () => {
  it('clicking Bid dispatches sendBid with the current valid input value', () => {
    const { bc, antlion, sent } = makeControls({ currentHighBid: null });
    bc._input.value = '120';
    antlion._fire('bid-input-change'); // re-validate so button is enabled
    antlion._fire('bid-submit-click');
    assert.deepEqual(sent.bids, [120]);
  });

  it('clicking Pass dispatches sendPass', () => {
    const { antlion, sent } = makeControls({ currentHighBid: null });
    antlion._fire('bid-pass-click');
    assert.equal(sent.passes.length, 1);
  });
});
