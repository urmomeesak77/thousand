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

// cumulativeScores removed from status bar (per 2026-05-20 design); barrel markers stay
describe('StatusBar — cumulative scores removed, barrel markers kept', () => {
  it('does not render any .status-bar__cumulative-score spans', () => {
    const sb = makeStatusBar();
    sb.render(status({ cumulativeScores: { 0: 150, 1: -50, 2: 200 } }));
    assert.equal(all(sb, '.status-bar__cumulative-score').length, 0,
      'cumulative score spans must no longer be rendered');
  });

  it('does not show the score numbers in the bar text', () => {
    const sb = makeStatusBar();
    sb.render(status({ cumulativeScores: { 0: 150, 1: 0, 2: 0 } }));
    assert.ok(!sb._el.textContent.includes('150 pts'),
      'cumulative "150 pts" must not appear');
  });

  it('still renders a barrel marker when a seat is on barrel', () => {
    const sb = makeStatusBar();
    sb.render(status({
      cumulativeScores: { 0: 900, 1: 0, 2: 0 },
      barrelMarkers: { 0: { onBarrel: true, barrelRoundsUsed: 0 }, 1: null, 2: null },
    }));
    const marker = sb._el.querySelector('.status-bar__barrel-marker');
    assert.ok(marker, 'barrel marker must still render');
    assert.ok(marker.textContent.includes('barrel'), 'marker text mentions barrel');
  });
});
