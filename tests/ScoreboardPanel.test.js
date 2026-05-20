'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

let dom;

function makeMockAntlion() {
  const handlers = {};
  return {
    bindInput(el, event, type) {
      el.addEventListener(event, (e) => { if (handlers[type]) handlers[type](e); });
    },
    onInput(type, handler) { handlers[type] = handler; },
    onTick() {}, schedule() { return 0; }, cancelScheduled() {}, emit() {}, stop() {},
  };
}

function setup(innerWidth = 1024) {
  dom = new JSDOM('<html><body></body></html>', { runScripts: 'dangerously', url: 'http://localhost' });
  Object.defineProperty(dom.window, 'innerWidth', { value: innerWidth, configurable: true });
  dom.window.localStorage.clear();
  loadModule(dom, 'thousand/ScoreboardPanel.js');
}

function makePanel() {
  const el = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(el);
  const panel = new dom.window.ScoreboardPanel(el, makeMockAntlion());
  return { panel, el };
}

describe('ScoreboardPanel chrome + collapse', () => {
  beforeEach(() => setup());

  it('renders a header with a title and a toggle button', () => {
    const { el } = makePanel();
    assert.ok(el.querySelector('.scoreboard__header'));
    assert.equal(el.querySelector('.scoreboard__title').textContent, 'Scoreboard');
    assert.ok(el.querySelector('.scoreboard__toggle'));
  });

  it('defaults to open on a wide screen (not collapsed)', () => {
    const { el } = makePanel();
    assert.equal(el.classList.contains('scoreboard--collapsed'), false);
  });

  it('toggles collapsed state when the toggle button is clicked', () => {
    const { el } = makePanel();
    const btn = el.querySelector('.scoreboard__toggle');
    btn.dispatchEvent(new dom.window.Event('click'));
    assert.equal(el.classList.contains('scoreboard--collapsed'), true);
    assert.equal(btn.textContent, '+');
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    btn.dispatchEvent(new dom.window.Event('click'));
    assert.equal(el.classList.contains('scoreboard--collapsed'), false);
    assert.equal(btn.textContent, '–');
    assert.equal(btn.getAttribute('aria-expanded'), 'true');
  });

  it('persists the collapsed choice to localStorage', () => {
    const { el } = makePanel();
    el.querySelector('.scoreboard__toggle').dispatchEvent(new dom.window.Event('click'));
    assert.equal(dom.window.localStorage.getItem('thousand_scoreboard_open'), 'false');
  });

  it('honors a stored open=false state on construction', () => {
    dom.window.localStorage.setItem('thousand_scoreboard_open', 'false');
    const { el } = makePanel();
    assert.equal(el.classList.contains('scoreboard--collapsed'), true);
  });

  it('defaults to collapsed on a small screen when no stored state exists', () => {
    setup(400);
    const { el } = makePanel();
    assert.equal(el.classList.contains('scoreboard--collapsed'), true);
  });
});

describe('ScoreboardPanel render', () => {
  beforeEach(() => setup());

  const seats = {
    self: 0,
    players: [
      { seat: 1, nickname: 'Bob' },
      { seat: 0, nickname: 'Alice' },
      { seat: 2, nickname: 'Carol' },
    ],
  };

  const history = [
    { roundNumber: 1, perPlayer: { 0: { delta: 120, cumulativeAfter: 120 }, 1: { delta: 0, cumulativeAfter: 0 }, 2: { delta: 60, cumulativeAfter: 60 } } },
    { roundNumber: 2, perPlayer: { 0: { delta: 60, cumulativeAfter: 180 }, 1: { delta: -60, cumulativeAfter: -60 }, 2: { delta: 60, cumulativeAfter: 120 } } },
  ];

  function headerTexts(el) {
    return [...el.querySelectorAll('.scoreboard__col-head')].map((th) => th.textContent);
  }

  it('renders one column header per player in seat order (0,1,2)', () => {
    const { panel, el } = makePanel();
    panel.render(history, { 0: 180, 1: -60, 2: 120 }, seats);
    assert.deepEqual(headerTexts(el), ['Alice', 'Bob', 'Carol']);
  });

  it('renders a cum and a rnd row per round with values in seat order', () => {
    const { panel, el } = makePanel();
    panel.render(history, { 0: 180, 1: -60, 2: 120 }, seats);

    const cumRows = el.querySelectorAll('.scoreboard__cum');
    const rndRows = el.querySelectorAll('.scoreboard__rnd');
    assert.equal(cumRows.length, 2);
    assert.equal(rndRows.length, 2);

    const cum2 = [...cumRows[1].querySelectorAll('.scoreboard__val')].map((td) => td.textContent);
    assert.deepEqual(cum2, ['180', '-60', '120']);

    const rnd2 = [...rndRows[1].querySelectorAll('.scoreboard__val')].map((td) => td.textContent);
    assert.deepEqual(rnd2, ['+60', '-60', '+60']);

    const rnd1 = [...rndRows[0].querySelectorAll('.scoreboard__val')].map((td) => td.textContent);
    assert.deepEqual(rnd1, ['+120', '0', '+60']);
  });

  it('renders a pinned TOTAL row from cumulativeScores in seat order', () => {
    const { panel, el } = makePanel();
    panel.render(history, { 0: 180, 1: -60, 2: 120 }, seats);
    const total = el.querySelector('.scoreboard__total');
    assert.ok(total.textContent.includes('TOTAL'));
    const vals = [...total.querySelectorAll('.scoreboard__val')].map((td) => td.textContent);
    assert.deepEqual(vals, ['180', '-60', '120']);
  });

  it('empty history renders headers + zero TOTAL and no round rows', () => {
    const { panel, el } = makePanel();
    panel.render([], { 0: 0, 1: 0, 2: 0 }, seats);
    assert.deepEqual(headerTexts(el), ['Alice', 'Bob', 'Carol']);
    assert.equal(el.querySelectorAll('.scoreboard__cum').length, 0);
    const vals = [...el.querySelector('.scoreboard__total').querySelectorAll('.scoreboard__val')].map((td) => td.textContent);
    assert.deepEqual(vals, ['0', '0', '0']);
  });

  it('re-render replaces previous rows (no duplication)', () => {
    const { panel, el } = makePanel();
    panel.render(history, { 0: 180, 1: -60, 2: 120 }, seats);
    panel.render(history, { 0: 180, 1: -60, 2: 120 }, seats);
    assert.equal(el.querySelectorAll('.scoreboard__cum').length, 2);
  });
});
