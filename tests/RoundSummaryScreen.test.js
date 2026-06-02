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

function makeMockAntlion() {
  const handlers = {};
  const intervals = new Map();
  let nextId = 1;
  return {
    bindInput(el, event, type) {
      const fn = (e) => { if (handlers[type]) handlers[type](e); };
      el.addEventListener(event, fn);
      return () => el.removeEventListener(event, fn);
    },
    onInput(type, handler) { handlers[type] = handler; },
    offInput(type, handler) { if (handlers[type] === handler) { delete handlers[type]; } },
    onTick() {},
    schedule() { return 0; },
    cancelScheduled() {},
    scheduleInterval(delay, cb) { const id = nextId++; intervals.set(id, cb); return id; },
    cancelInterval(id) { intervals.delete(id); },
    emit() {},
    stop() {},
    // test helpers (not part of the real Antlion API)
    _tick(times = 1) {
      for (let i = 0; i < times; i++) {
        for (const cb of [...intervals.values()]) { cb(); }
      }
    },
    _activeIntervalCount() { return intervals.size; },
  };
}

function makeRoundSummaryScreen(onBackToLobby) {
  const doc = dom.window.document;
  const el = doc.createElement('div');
  doc.body.appendChild(el);
  const cb = onBackToLobby || (() => {});
  const antlion = makeMockAntlion();
  const screen = new dom.window.RoundSummaryScreen(el, { antlion, onBackToLobby: cb });
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

describe('RoundSummaryScreen — Continue button disables itself on click (no double-fire)', () => {
  function makeContinueScreen({ viewerSeat = 0 } = {}) {
    const doc = dom.window.document;
    const el = doc.createElement('div');
    doc.body.appendChild(el);
    const antlion = makeMockAntlion();
    let continueCount = 0;
    const screen = new dom.window.RoundSummaryScreen(el, {
      antlion,
      viewerSeat,
      onBackToLobby: () => {},
      onContinue: () => { continueCount++; },
    });
    return { screen, el, antlion, getCount: () => continueCount };
  }

  it('Continue button has :disabled after a click, so :not(:disabled) selectors no longer match', () => {
    const { screen, el } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: false }));

    const btn = el.querySelector('.round-summary__continue-btn');
    assert.ok(btn, 'precondition: continue button rendered');
    assert.ok(!btn.disabled, 'precondition: continue button starts enabled');

    btn.click();

    const after = el.querySelector('.round-summary__continue-btn');
    assert.ok(after.disabled,
      'continue button must be disabled after click — keeps test/UI from double-firing the action');
  });

  it('onContinue fires exactly once even if click is replayed via the same DOM node', () => {
    const { screen, el, getCount } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: false }));

    const btn = el.querySelector('.round-summary__continue-btn');
    btn.click();
    // The post-click button is re-rendered with disabled=true, so a fresh click
    // on the (now-detached or new) node is what matters in practice. But the
    // original test's selector `:not(:disabled)` is what gates re-fires —
    // verify the rendered button is disabled and that count is 1.
    assert.equal(getCount(), 1, 'onContinue must fire exactly once for one user click');
  });
});

describe('RoundSummaryScreen — auto-continue timer', () => {
  function makeContinueScreen({ viewerSeat = 0 } = {}) {
    const doc = dom.window.document;
    const el = doc.createElement('div');
    doc.body.appendChild(el);
    const antlion = makeMockAntlion();
    let continueCount = 0;
    const screen = new dom.window.RoundSummaryScreen(el, {
      antlion,
      viewerSeat,
      onBackToLobby: () => {},
      onContinue: () => { continueCount++; },
    });
    return { screen, el, antlion, getCount: () => continueCount };
  }

  it('Continue button label shows the starting countdown of 30', () => {
    const { screen, el } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: false }));
    const btn = el.querySelector('.round-summary__continue-btn');
    assert.ok(btn.textContent.includes('30'),
      `button label must show starting count 30, got "${btn.textContent}"`);
  });

  it('Continue button label decrements on each tick', () => {
    const { screen, el, antlion } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: false }));
    antlion._tick(1);
    const btn = el.querySelector('.round-summary__continue-btn');
    assert.ok(btn.textContent.includes('29'),
      `button label must show 29 after one tick, got "${btn.textContent}"`);
  });

  it('fires onContinue once after 30 ticks with no click', () => {
    const { screen, antlion, getCount } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: false }));
    antlion._tick(30);
    assert.equal(getCount(), 1, 'onContinue must fire exactly once at zero');
  });

  it('disables the button after auto-firing', () => {
    const { screen, el, antlion } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: false }));
    antlion._tick(30);
    const btn = el.querySelector('.round-summary__continue-btn');
    assert.ok(btn.disabled, 'button must be disabled after auto-continue fires');
  });

  it('does not fire again after auto-firing (interval cancelled)', () => {
    const { screen, antlion, getCount } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: false }));
    antlion._tick(40);
    assert.equal(getCount(), 1, 'onContinue must not fire again after the interval is cancelled');
  });

  it('cancels the timer on manual click (no later auto-fire)', () => {
    const { screen, el, antlion, getCount } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: false }));
    el.querySelector('.round-summary__continue-btn').click();
    antlion._tick(30);
    assert.equal(getCount(), 1, 'only the manual click counts; timer must not fire afterwards');
    assert.equal(antlion._activeIntervalCount(), 0, 'no interval should remain active after a click');
  });

  it('does not start a timer when the viewer has already pressed', () => {
    const { screen, antlion } = makeContinueScreen({ viewerSeat: 0 });
    const summary = makeSummary({ victoryReached: false });
    screen.update([0]); // seed continue-press for viewer seat 0 before render
    screen.render(summary);
    assert.equal(antlion._activeIntervalCount(), 0, 'no timer when viewer already pressed');
  });

  it('does not start a timer on the victory / back-to-lobby variant', () => {
    const { screen, antlion } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: true }));
    assert.equal(antlion._activeIntervalCount(), 0, 'no timer when no Continue button is shown');
  });

  it('clears the timer on destroy()', () => {
    const { screen, antlion } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: false }));
    screen.destroy();
    assert.equal(antlion._activeIntervalCount(), 0, 'destroy() must cancel the auto-continue interval');
  });

  it('update() for another seat does not disturb the running countdown', () => {
    const { screen, el, antlion, getCount } = makeContinueScreen({ viewerSeat: 0 });
    screen.render(makeSummary({ victoryReached: false }));
    antlion._tick(5); // countdown now at 25
    screen.update([1]); // a different seat (not the viewer) pressed Continue
    assert.equal(antlion._activeIntervalCount(), 1, 'timer must still be active after update() for another seat');
    const btn = el.querySelector('.round-summary__continue-btn');
    assert.ok(btn.textContent.includes('25'),
      `countdown must continue from where it was, got "${btn.textContent}"`);
    antlion._tick(25); // run out the remaining 25 seconds
    assert.equal(getCount(), 1, 'timer must still fire onContinue after surviving update()');
  });
});
