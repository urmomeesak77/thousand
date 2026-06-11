'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');
const { makeT } = require('./helpers/loadI18n');

let dom;

before(() => {
  dom = new JSDOM('<html><body></body></html>', { runScripts: 'dangerously', url: 'http://localhost' });
  try {
    loadModule(dom, 'thousand/FourNinesPrompt.js');
  } catch (_) {
    // Expected during TDD red phase — component file not yet written.
  }
});

function makeMockDispatcher() {
  const calls = [];
  return { sendAcknowledgeFourNines() { calls.push(true); }, _calls: calls };
}

// antlion mock: captures the named click handler and records offInput calls.
function makePrompt() {
  const doc = dom.window.document;
  const el = doc.createElement('div');
  doc.body.appendChild(el);
  const dispatcher = makeMockDispatcher();
  const Ctor = dom.window.FourNinesPrompt;
  if (!Ctor) throw new Error('FourNinesPrompt is not defined');
  let capturedHandler = null;
  let intervalCb = null;
  const offCalls = [];
  const intervalCancels = [];
  const antlion = {
    bindInput: () => {},
    onInput: (name, handler) => { capturedHandler = handler; },
    offInput: (name, handler) => { offCalls.push({ name, handler }); },
    scheduleInterval: (_delay, cb) => { intervalCb = cb; return 42; },
    cancelInterval: (id) => { intervalCancels.push(id); },
  };
  const prompt = new Ctor(el, { antlion, dispatcher, t: makeT(dom) });
  const simulateClick = (btn) => capturedHandler({ target: btn });
  const tick = () => intervalCb && intervalCb();
  return { prompt, el, dispatcher, simulateClick, offCalls, tick, intervalCancels };
}

function findButton(el, textFragment) {
  return [...el.querySelectorAll('button')].find((b) => b.textContent.includes(textFragment)) || null;
}

describe('FourNinesPrompt — render (FR-003)', () => {
  it('show() renders "{nickname} holds four nines: +100"', () => { // per FR-003
    const { prompt, el } = makePrompt();
    prompt.show('kashka', 100);
    assert.ok(el.textContent.includes('kashka'), 'must name the awarded player');
    assert.ok(el.textContent.includes('four nines'), 'must mention four nines');
    assert.ok(el.textContent.includes('100'), 'must show the +100 amount');
  });

  it('show() renders an Acknowledge button', () => { // per FR-003
    const { prompt, el } = makePrompt();
    prompt.show('kashka', 100);
    assert.ok(findButton(el, 'Acknowledge'), 'an Acknowledge button must be rendered');
  });
});

describe('FourNinesPrompt — countdown auto-acknowledge', () => {
  it('show() starts a visible 5-second countdown on the button', () => {
    const { prompt, el } = makePrompt();
    prompt.show('kashka', 100);
    assert.ok(findButton(el, 'Acknowledge (5)'), 'button must show the starting countdown');
  });

  it('countdown ticks decrement the visible label', () => {
    const { prompt, el, tick } = makePrompt();
    prompt.show('kashka', 100);
    tick();
    assert.ok(findButton(el, 'Acknowledge (4)'), 'a tick must decrement the label');
  });

  it('countdown reaching zero auto-dispatches acknowledge once', () => {
    const { prompt, dispatcher, tick } = makePrompt();
    prompt.show('kashka', 100);
    for (let i = 0; i < 5; i += 1) { tick(); }
    assert.equal(dispatcher._calls.length, 1, 'must auto-acknowledge at zero');
    // A further tick must not re-dispatch (interval already cancelled / sticky).
    tick();
    assert.equal(dispatcher._calls.length, 1, 'must not re-dispatch after auto-acknowledge');
  });

  it('clicking Acknowledge cancels the countdown', () => {
    const { prompt, el, simulateClick, intervalCancels } = makePrompt();
    prompt.show('kashka', 100);
    simulateClick(findButton(el, 'Acknowledge'));
    assert.equal(intervalCancels.length, 1, 'manual ack must cancel the countdown interval');
  });
});

describe('FourNinesPrompt — acknowledge dispatch (FR-003)', () => {
  it('clicking Acknowledge dispatches acknowledge_four_nines exactly once', () => { // per FR-003
    const { prompt, el, dispatcher, simulateClick } = makePrompt();
    prompt.show('kashka', 100);
    const btn = findButton(el, 'Acknowledge');
    simulateClick(btn);
    assert.equal(dispatcher._calls.length, 1, 'must dispatch once');
    // A second click must not re-dispatch (sticky / idempotent local press).
    simulateClick(btn);
    assert.equal(dispatcher._calls.length, 1, 'must not re-dispatch on a second click');
  });
});

describe('FourNinesPrompt — teardown (FR-003)', () => {
  it('destroy() unbinds the Antlion input handler (no leak)', () => { // per FR-003
    const { prompt, offCalls } = makePrompt();
    prompt.destroy();
    assert.equal(offCalls.length, 1, 'destroy() must offInput exactly the handler it registered');
    assert.equal(typeof offCalls[0].handler, 'function');
  });
});
