'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');
const { makeT } = require('./helpers/loadI18n');

// ---------------------------------------------------------------------------
// jsdom setup — load MarriageNotice (auto-closing opponent notification)
// ---------------------------------------------------------------------------

let dom;

before(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  try {
    loadModule(dom, 'thousand/MarriageNotice.js');
  } catch (_) {
    // Expected during TDD red phase — component file not yet written.
  }
});

// ---------------------------------------------------------------------------
// Mock helpers — capture the click handler and the countdown interval callback
// so the test can drive them synchronously without real timers.
// ---------------------------------------------------------------------------

function makeNotice() {
  const doc = dom.window.document;
  const el = doc.createElement('div');
  doc.body.appendChild(el);
  const Ctor = dom.window.MarriageNotice;
  if (!Ctor) throw new Error('MarriageNotice is not defined');

  let clickHandler = null;
  const intervals = [];
  let nextId = 1;
  const antlion = {
    bindInput: () => {},
    onInput: (name, handler) => { clickHandler = handler; },
    offInput: () => {},
    scheduleInterval: (delay, cb) => {
      const id = nextId++;
      intervals.push({ id, cb });
      return id;
    },
    cancelInterval: (id) => {
      const i = intervals.findIndex((t) => t.id === id);
      if (i !== -1) intervals.splice(i, 1);
    },
  };
  const notice = new Ctor(el, { antlion, t: makeT(dom) });
  function simulateClick(target) { clickHandler({ target }); }
  function tick() { intervals.forEach((t) => t.cb()); }
  function intervalCount() { return intervals.length; }
  return { notice, el, simulateClick, tick, intervalCount };
}

function isVisible(el) {
  return el.style.display !== 'none' && el.querySelector('button') !== null;
}

// ---------------------------------------------------------------------------
// show() content
// ---------------------------------------------------------------------------

describe('MarriageNotice.show — renders declarer, suit and bonus', () => {
  it('surfaces the declarer nickname, suit symbol and bonus value', () => {
    const { notice, el } = makeNotice();
    notice.show('Robo-Ada', '♥', 100, 5);
    assert.ok(el.textContent.includes('Robo-Ada'), 'must show declarer nickname');
    assert.ok(el.textContent.includes('♥'), 'must show suit symbol');
    assert.ok(el.textContent.includes('100'), 'must show bonus value');
  });

  it('renders a single OK/dismiss button showing the initial countdown', () => {
    const { notice, el } = makeNotice();
    notice.show('Bo', '♠', 40, 5);
    const buttons = [...el.querySelectorAll('button')];
    assert.equal(buttons.length, 1, 'exactly one dismiss button');
    assert.ok(buttons[0].textContent.includes('5'), 'button shows the starting count');
  });
});

// ---------------------------------------------------------------------------
// Countdown auto-close
// ---------------------------------------------------------------------------

describe('MarriageNotice — countdown auto-closes after the configured seconds', () => {
  it('decrements the button label on each tick', () => {
    const { notice, el, tick } = makeNotice();
    notice.show('Bo', '♦', 60, 5);
    tick();
    const btn = el.querySelector('button');
    assert.ok(btn.textContent.includes('4'), 'button shows 4 after one tick');
  });

  it('hides the notice once the countdown reaches zero', () => {
    const { notice, el, tick } = makeNotice();
    notice.show('Bo', '♣', 80, 5);
    for (let i = 0; i < 5; i += 1) tick();
    assert.equal(isVisible(el), false, 'notice auto-closes at zero');
  });

  it('cancels the interval after auto-close (no leaked timer)', () => {
    const { notice, tick, intervalCount } = makeNotice();
    notice.show('Bo', '♥', 80, 5);
    assert.equal(intervalCount(), 1, 'one interval while visible');
    for (let i = 0; i < 5; i += 1) tick();
    assert.equal(intervalCount(), 0, 'interval cancelled on auto-close');
  });
});

// ---------------------------------------------------------------------------
// Manual dismiss
// ---------------------------------------------------------------------------

describe('MarriageNotice — OK button dismisses immediately', () => {
  it('clicking OK hides the notice and cancels the countdown', () => {
    const { notice, el, simulateClick, intervalCount } = makeNotice();
    notice.show('Bo', '♠', 40, 5);
    simulateClick(el.querySelector('button'));
    assert.equal(isVisible(el), false, 'OK hides the notice');
    assert.equal(intervalCount(), 0, 'OK cancels the countdown interval');
  });
});

// ---------------------------------------------------------------------------
// Re-show resets state (no overlapping intervals across declarations)
// ---------------------------------------------------------------------------

describe('MarriageNotice — re-showing resets the countdown', () => {
  it('does not accumulate intervals when shown twice', () => {
    const { notice, intervalCount } = makeNotice();
    notice.show('Bo', '♥', 80, 5);
    notice.show('Ada', '♣', 60, 5);
    assert.equal(intervalCount(), 1, 'only one active interval after re-show');
  });
});
