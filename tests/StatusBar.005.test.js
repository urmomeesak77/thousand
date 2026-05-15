'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

// ---------------------------------------------------------------------------
// jsdom setup — load StatusBar dependencies in dependency order
// ---------------------------------------------------------------------------

let dom;

before(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });

  loadModule(dom, 'thousand/constants.js');
  loadModule(dom, 'thousand/StatusBar.js');
});

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeStatusBar() {
  const el = dom.window.document.createElement('div');
  return new dom.window.StatusBar(el);
}

// Full default view-model with both old and new Phase 3 fields
function status(overrides = {}) {
  return {
    phase: 'Trick play',
    activePlayer: null,
    viewerIsActive: false,
    currentHighBid: null,
    declarer: null,
    passedPlayers: [],
    sellAttempt: null,
    disconnectedPlayers: [],
    trickNumber: null,
    exchangePassesCommitted: null,
    cumulativeScores: { 0: 0, 1: 0, 2: 0 },
    collectedTrickCounts: { 0: 0, 1: 0, 2: 0 },
    ...overrides,
  };
}

// DOM query helpers
function text(sb, selector) {
  return sb._el.querySelector(selector)?.textContent ?? null;
}

function all(sb, selector) {
  return [...sb._el.querySelectorAll(selector)];
}

// ---------------------------------------------------------------------------
// T012 — StatusBar FR-018: new Phase 3 fields
// ---------------------------------------------------------------------------

// trickNumber field
describe('StatusBar — trickNumber field (FR-018)', () => {
  it('renders "Trick 5 of 8" in .status-bar__trick-number when trickNumber is 5', () => {
    const sb = makeStatusBar();
    sb.render(status({ trickNumber: 5 }));
    const el = sb._el.querySelector('.status-bar__trick-number');
    assert.ok(el, '.status-bar__trick-number must exist when trickNumber is set');
    assert.ok(el.textContent.includes('5'), 'trick number element must include "5"');
    assert.ok(el.textContent.includes('8'), 'trick number element must include total tricks "8"');
  });

  it('renders "Trick 1 of 8" when trickNumber is 1', () => {
    const sb = makeStatusBar();
    sb.render(status({ trickNumber: 1 }));
    const el = sb._el.querySelector('.status-bar__trick-number');
    assert.ok(el, '.status-bar__trick-number must exist when trickNumber is 1');
    assert.equal(el.textContent, 'Trick 1 of 8');
  });

  it('renders "Trick 8 of 8" when trickNumber is 8', () => {
    const sb = makeStatusBar();
    sb.render(status({ trickNumber: 8 }));
    const el = sb._el.querySelector('.status-bar__trick-number');
    assert.ok(el, '.status-bar__trick-number must exist when trickNumber is 8');
    assert.equal(el.textContent, 'Trick 8 of 8');
  });

  it('does not render .status-bar__trick-number when trickNumber is null', () => {
    const sb = makeStatusBar();
    sb.render(status({ trickNumber: null }));
    assert.equal(sb._el.querySelector('.status-bar__trick-number'), null,
      '.status-bar__trick-number must not exist when trickNumber is null');
  });

  it('trick number element is absent when phase is Bidding (trickNumber is null)', () => {
    const sb = makeStatusBar();
    sb.render(status({ phase: 'Bidding', trickNumber: null }));
    assert.equal(sb._el.querySelector('.status-bar__trick-number'), null,
      'no trick number during Bidding phase');
  });

  it('re-render clears trick number when trickNumber goes from 5 to null', () => {
    const sb = makeStatusBar();
    sb.render(status({ trickNumber: 5 }));
    assert.ok(sb._el.querySelector('.status-bar__trick-number'), 'precondition: trick number present');
    sb.render(status({ trickNumber: null }));
    assert.equal(sb._el.querySelector('.status-bar__trick-number'), null,
      'trick number must be gone after re-render with null');
  });
});

// exchangePassesCommitted field
describe('StatusBar — exchangePassesCommitted field (FR-018)', () => {
  it('renders "0/2 cards passed" in .status-bar__exchange-passes when exchangePassesCommitted is 0', () => {
    const sb = makeStatusBar();
    sb.render(status({ exchangePassesCommitted: 0 }));
    const el = sb._el.querySelector('.status-bar__exchange-passes');
    assert.ok(el, '.status-bar__exchange-passes must exist when exchangePassesCommitted is set');
    assert.ok(el.textContent.includes('0'), 'must show "0" cards passed');
    assert.ok(el.textContent.includes('2'), 'must show "2" total passes required');
  });

  it('renders "1/2 cards passed" when exchangePassesCommitted is 1', () => {
    const sb = makeStatusBar();
    sb.render(status({ exchangePassesCommitted: 1 }));
    const el = sb._el.querySelector('.status-bar__exchange-passes');
    assert.ok(el, '.status-bar__exchange-passes must exist when exchangePassesCommitted is 1');
    assert.ok(el.textContent.includes('1'), 'must show "1" cards passed');
    assert.ok(el.textContent.includes('2'), 'must show "2" total');
  });

  it('renders "2/2 cards passed" when exchangePassesCommitted is 2', () => {
    const sb = makeStatusBar();
    sb.render(status({ exchangePassesCommitted: 2 }));
    const el = sb._el.querySelector('.status-bar__exchange-passes');
    assert.ok(el, '.status-bar__exchange-passes must exist when exchangePassesCommitted is 2');
    assert.ok(el.textContent.includes('2'), 'must show "2" cards passed');
  });

  it('does not render .status-bar__exchange-passes when exchangePassesCommitted is null', () => {
    const sb = makeStatusBar();
    sb.render(status({ exchangePassesCommitted: null }));
    assert.equal(sb._el.querySelector('.status-bar__exchange-passes'), null,
      '.status-bar__exchange-passes must not exist when exchangePassesCommitted is null');
  });

  it('re-render clears exchange passes element when it goes from 1 to null', () => {
    const sb = makeStatusBar();
    sb.render(status({ exchangePassesCommitted: 1 }));
    assert.ok(sb._el.querySelector('.status-bar__exchange-passes'), 'precondition: element present');
    sb.render(status({ exchangePassesCommitted: null }));
    assert.equal(sb._el.querySelector('.status-bar__exchange-passes'), null,
      'exchange passes element must be gone after re-render with null');
  });
});

// cumulativeScores field
describe('StatusBar — cumulativeScores field (FR-018)', () => {
  it('renders cumulative scores for all 3 seats when cumulativeScores is {0:0, 1:0, 2:0}', () => {
    const sb = makeStatusBar();
    sb.render(status({ cumulativeScores: { 0: 0, 1: 0, 2: 0 } }));
    const scoreEls = all(sb, '.status-bar__cumulative-score');
    assert.equal(scoreEls.length, 3, 'must render 3 cumulative score elements');
  });

  it('renders correct values for cumulativeScores: {0: 150, 1: -50, 2: 200}', () => {
    const sb = makeStatusBar();
    sb.render(status({ cumulativeScores: { 0: 150, 1: -50, 2: 200 } }));
    const scoreEls = all(sb, '.status-bar__cumulative-score');
    assert.equal(scoreEls.length, 3, 'must render 3 cumulative score elements');

    const texts = scoreEls.map(el => el.textContent);
    const hasPositive150 = texts.some(t => t.includes('150'));
    const hasNegative50 = texts.some(t => t.includes('-50') || t.includes('−50'));
    const hasPositive200 = texts.some(t => t.includes('200'));

    assert.ok(hasPositive150, 'seat 0 score of 150 must be shown');
    assert.ok(hasNegative50, 'seat 1 score of -50 (negative) must be shown');
    assert.ok(hasPositive200, 'seat 2 score of 200 must be shown');
  });

  it('score for seat 0 is visible and shows the correct value', () => {
    const sb = makeStatusBar();
    sb.render(status({ cumulativeScores: { 0: 75, 1: 30, 2: 45 } }));
    const scores = all(sb, '.status-bar__cumulative-score');
    assert.ok(scores.length > 0, 'precondition: score elements exist');
    const allText = sb._el.textContent;
    assert.ok(allText.includes('75'), 'seat 0 score of 75 must appear in rendered output');
    assert.ok(allText.includes('30'), 'seat 1 score of 30 must appear in rendered output');
    assert.ok(allText.includes('45'), 'seat 2 score of 45 must appear in rendered output');
  });

  it('re-render updates cumulative scores correctly', () => {
    const sb = makeStatusBar();
    sb.render(status({ cumulativeScores: { 0: 0, 1: 0, 2: 0 } }));
    sb.render(status({ cumulativeScores: { 0: 100, 1: 50, 2: 75 } }));

    const allText = sb._el.textContent;
    assert.ok(allText.includes('100'), 'updated seat 0 score of 100 must appear');
    assert.ok(allText.includes('50'), 'updated seat 1 score of 50 must appear');
    assert.ok(allText.includes('75'), 'updated seat 2 score of 75 must appear');
  });

  it('cumulativeScores zero values are shown for all seats', () => {
    const sb = makeStatusBar();
    sb.render(status({ cumulativeScores: { 0: 0, 1: 0, 2: 0 } }));
    const scoreEls = all(sb, '.status-bar__cumulative-score');
    // All three seats must show 0
    const allShowZero = scoreEls.every(el => el.textContent.includes('0'));
    assert.ok(allShowZero, 'all seats must show 0 when all cumulative scores are 0');
  });
});
