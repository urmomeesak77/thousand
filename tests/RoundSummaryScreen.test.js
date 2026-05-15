'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

// ---------------------------------------------------------------------------
// jsdom setup — load RoundSummaryScreen dependencies in dependency order
// ---------------------------------------------------------------------------

let dom;

before(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });

  loadModule(dom, 'thousand/constants.js');
  loadModule(dom, 'utils/HtmlUtil.js');
  loadModule(dom, 'thousand/RoundSummaryScreen.js');
});

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeRoundSummaryScreen(onBackToLobby) {
  const doc = dom.window.document;
  const el = doc.createElement('div');
  doc.body.appendChild(el);
  const cb = onBackToLobby || (() => {});
  const screen = new dom.window.RoundSummaryScreen(el, { onBackToLobby: cb });
  return { screen, el };
}

function makeSummary(overrides = {}) {
  return {
    roundNumber: 1,
    declarerSeat: 0,
    declarerNickname: 'Alice',
    bid: 100,
    declarerMadeBid: true,
    perPlayer: {
      0: { nickname: 'Alice', seat: 0, trickPoints: 60, marriageBonus: 0, roundTotal: 60, delta: 100, cumulativeAfter: 100, penalties: [] },
      1: { nickname: 'Bob',   seat: 1, trickPoints: 30, marriageBonus: 0, roundTotal: 30, delta: 30,  cumulativeAfter: 30,  penalties: [] },
      2: { nickname: 'Carol', seat: 2, trickPoints: 30, marriageBonus: 0, roundTotal: 30, delta: 30,  cumulativeAfter: 30,  penalties: [] },
    },
    viewerCollectedCards: [],
    victoryReached: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// T011 — RoundSummaryScreen: FR-015
// ---------------------------------------------------------------------------

// Test 1: declarerMadeBid: true → .round-summary__made-indicator with "Made" text
describe('RoundSummaryScreen — made bid indicator (FR-015)', () => {
  it('renders .round-summary__made-indicator when declarerMadeBid is true', () => {
    const { screen, el } = makeRoundSummaryScreen();
    screen.render(makeSummary({ declarerMadeBid: true }));
    const indicator = el.querySelector('.round-summary__made-indicator');
    assert.ok(indicator, '.round-summary__made-indicator must exist when bid was made');
  });

  it('.round-summary__made-indicator contains "Made" text when declarerMadeBid is true', () => {
    const { screen, el } = makeRoundSummaryScreen();
    screen.render(makeSummary({ declarerMadeBid: true }));
    const indicator = el.querySelector('.round-summary__made-indicator');
    assert.ok(indicator, 'precondition: indicator must exist');
    assert.ok(indicator.textContent.toLowerCase().includes('made'),
      'indicator must say "Made" when bid was made');
  });

  it('no .round-summary__missed-indicator when declarerMadeBid is true', () => {
    const { screen, el } = makeRoundSummaryScreen();
    screen.render(makeSummary({ declarerMadeBid: true }));
    assert.equal(el.querySelector('.round-summary__missed-indicator'), null,
      '.round-summary__missed-indicator must not exist when bid was made');
  });
});

// Test 2: declarerMadeBid: false → .round-summary__missed-indicator with "Missed" text
describe('RoundSummaryScreen — missed bid indicator (FR-015)', () => {
  it('renders .round-summary__missed-indicator when declarerMadeBid is false', () => {
    const { screen, el } = makeRoundSummaryScreen();
    screen.render(makeSummary({ declarerMadeBid: false }));
    const indicator = el.querySelector('.round-summary__missed-indicator');
    assert.ok(indicator, '.round-summary__missed-indicator must exist when bid was missed');
  });

  it('.round-summary__missed-indicator contains "Missed" text when declarerMadeBid is false', () => {
    const { screen, el } = makeRoundSummaryScreen();
    screen.render(makeSummary({ declarerMadeBid: false }));
    const indicator = el.querySelector('.round-summary__missed-indicator');
    assert.ok(indicator, 'precondition: indicator must exist');
    assert.ok(indicator.textContent.toLowerCase().includes('missed'),
      'indicator must say "Missed" when bid was missed');
  });

  it('no .round-summary__made-indicator when declarerMadeBid is false', () => {
    const { screen, el } = makeRoundSummaryScreen();
    screen.render(makeSummary({ declarerMadeBid: false }));
    assert.equal(el.querySelector('.round-summary__made-indicator'), null,
      '.round-summary__made-indicator must not exist when bid was missed');
  });
});

// Test 3: Each player's nickname appears in the rendered output
describe('RoundSummaryScreen — player nicknames shown (FR-015)', () => {
  it('Alice\'s nickname appears in the rendered output', () => {
    const { screen, el } = makeRoundSummaryScreen();
    screen.render(makeSummary());
    assert.ok(el.textContent.includes('Alice'), 'Alice must appear in rendered output');
  });

  it('Bob\'s nickname appears in the rendered output', () => {
    const { screen, el } = makeRoundSummaryScreen();
    screen.render(makeSummary());
    assert.ok(el.textContent.includes('Bob'), 'Bob must appear in rendered output');
  });

  it('Carol\'s nickname appears in the rendered output', () => {
    const { screen, el } = makeRoundSummaryScreen();
    screen.render(makeSummary());
    assert.ok(el.textContent.includes('Carol'), 'Carol must appear in rendered output');
  });

  it('all three player nicknames appear in the rendered output', () => {
    const { screen, el } = makeRoundSummaryScreen();
    screen.render(makeSummary({
      perPlayer: {
        0: { nickname: 'Player1', seat: 0, trickPoints: 40, marriageBonus: 0, roundTotal: 40, delta: 100, cumulativeAfter: 100, penalties: [] },
        1: { nickname: 'Player2', seat: 1, trickPoints: 40, marriageBonus: 0, roundTotal: 40, delta: 40,  cumulativeAfter: 40,  penalties: [] },
        2: { nickname: 'Player3', seat: 2, trickPoints: 40, marriageBonus: 0, roundTotal: 40, delta: 40,  cumulativeAfter: 40,  penalties: [] },
      },
    }));
    assert.ok(el.textContent.includes('Player1'), 'Player1 must appear');
    assert.ok(el.textContent.includes('Player2'), 'Player2 must appear');
    assert.ok(el.textContent.includes('Player3'), 'Player3 must appear');
  });
});

// Test 4: victoryReached: false → Back to Lobby button shown (no Continue to Next Round)
describe('RoundSummaryScreen — back to lobby button shown (FR-015)', () => {
  it('renders .round-summary__back-btn when victoryReached is false', () => {
    const { screen, el } = makeRoundSummaryScreen();
    screen.render(makeSummary({ victoryReached: false }));
    const btn = el.querySelector('.round-summary__back-btn');
    assert.ok(btn, '.round-summary__back-btn must exist when victoryReached is false');
  });

  it('.round-summary__back-btn text indicates Back to Lobby', () => {
    const { screen, el } = makeRoundSummaryScreen();
    screen.render(makeSummary({ victoryReached: false }));
    const btn = el.querySelector('.round-summary__back-btn');
    assert.ok(btn, 'precondition: back-btn must exist');
    assert.ok(
      btn.textContent.toLowerCase().includes('lobby') || btn.textContent.toLowerCase().includes('back'),
      'back-btn must reference lobby or back'
    );
  });

  it('no .round-summary__next-btn when victoryReached is false (US1 scope: no next round)', () => {
    const { screen, el } = makeRoundSummaryScreen();
    screen.render(makeSummary({ victoryReached: false }));
    // In US1 scope there is no "Continue to Next Round" button
    assert.equal(el.querySelector('.round-summary__next-btn'), null,
      'no next-round button in US1 scope');
  });
});

// Test 5: Clicking Back to Lobby button calls onBackToLobby()
describe('RoundSummaryScreen — clicking back btn calls onBackToLobby (FR-015)', () => {
  it('clicking .round-summary__back-btn calls onBackToLobby()', () => {
    let called = false;
    const { screen, el } = makeRoundSummaryScreen(() => { called = true; });
    screen.render(makeSummary({ victoryReached: false }));

    const btn = el.querySelector('.round-summary__back-btn');
    assert.ok(btn, 'precondition: back-btn must exist');
    btn.click();

    assert.ok(called, 'onBackToLobby must be called when back-btn is clicked');
  });

  it('onBackToLobby is not called before the button is clicked', () => {
    let called = false;
    const { screen, el } = makeRoundSummaryScreen(() => { called = true; });
    screen.render(makeSummary({ victoryReached: false }));

    assert.ok(!called, 'onBackToLobby must not be called before the button is clicked');
  });

  it('onBackToLobby is called exactly once per click', () => {
    let callCount = 0;
    const { screen, el } = makeRoundSummaryScreen(() => { callCount++; });
    screen.render(makeSummary({ victoryReached: false }));

    const btn = el.querySelector('.round-summary__back-btn');
    assert.ok(btn, 'precondition: back-btn must exist');
    btn.click();

    assert.equal(callCount, 1, 'onBackToLobby must be called exactly once');
  });
});
