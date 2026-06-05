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
  loadModule(dom, 'thousand/cardSymbols.js');
  loadModule(dom, 'thousand/historyEntryText.js');
  loadModule(dom, 'thousand/HistoryPanel.js');
}

function makePanel() {
  const el = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(el);
  const panel = new dom.window.HistoryPanel(el, makeMockAntlion());
  return { panel, el };
}

const seats = {
  self: 0,
  players: [
    { seat: 0, nickname: 'Ada' },
    { seat: 1, nickname: 'Bot-Eve' },
    { seat: 2, nickname: 'Cara' },
  ],
};

const sampleLog = [
  { seq: 0, kind: 'bid', roundNumber: 1, seat: 1, data: { amount: 100 } },
  { seq: 1, kind: 'pass', roundNumber: 1, seat: 2, data: {} },
  { seq: 2, kind: 'trick', roundNumber: 1, seat: 0, data: { trickNumber: 1 } },
];

function rowTexts(el) {
  return [...el.querySelectorAll('.history-panel__row')].map((r) => r.textContent);
}

describe('HistoryPanel chrome + collapse (US2)', () => {
  beforeEach(() => setup());

  it('renders a header with a title and a toggle button', () => {
    const { el } = makePanel();
    assert.ok(el.querySelector('.history-panel__header'));
    assert.equal(el.querySelector('.history-panel__title').textContent, 'History');
    assert.ok(el.querySelector('.history-panel__toggle'));
  });

  it('defaults to open on a wide screen (not collapsed)', () => {
    const { el } = makePanel();
    assert.equal(el.classList.contains('history-panel--collapsed'), false);
  });

  it('toggling collapse flips the class and aria-expanded', () => {
    const { el } = makePanel();
    const btn = el.querySelector('.history-panel__toggle');
    btn.dispatchEvent(new dom.window.Event('click'));
    assert.equal(el.classList.contains('history-panel--collapsed'), true);
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    btn.dispatchEvent(new dom.window.Event('click'));
    assert.equal(el.classList.contains('history-panel--collapsed'), false);
    assert.equal(btn.getAttribute('aria-expanded'), 'true');
  });

  it('persists the collapsed choice to localStorage and re-reads it on construction', () => {
    const { el } = makePanel();
    el.querySelector('.history-panel__toggle').dispatchEvent(new dom.window.Event('click'));
    assert.equal(dom.window.localStorage.getItem('thousand_history_open'), 'false');

    const { el: el2 } = makePanel();
    assert.equal(el2.classList.contains('history-panel--collapsed'), true);
  });

  it('defaults to collapsed on a small screen when no stored state exists (FR-010a)', () => {
    setup(400);
    const { el } = makePanel();
    assert.equal(el.classList.contains('history-panel--collapsed'), true);
  });
});

describe('HistoryPanel render (US1)', () => {
  beforeEach(() => setup());

  it('mounts one row per entry in array order (newest last)', () => {
    const { panel, el } = makePanel();
    panel.render(sampleLog, seats);
    assert.deepEqual(rowTexts(el), ['Bot-Eve bid 100', 'Cara passed', 'Trick 1 won by Ada']);
  });

  it('re-render reflects new entries without duplicating old ones (SC-001)', () => {
    const { panel, el } = makePanel();
    panel.render(sampleLog, seats);
    panel.render([...sampleLog, { seq: 3, kind: 'pass', roundNumber: 1, seat: 0, data: {} }], seats);
    assert.equal(el.querySelectorAll('.history-panel__row').length, 4);
    assert.equal(rowTexts(el)[3], 'Ada passed');
  });
});

describe('HistoryPanel empty state + scroll (US3)', () => {
  beforeEach(() => setup());

  it('renders an empty-state row when the log is empty (FR-015)', () => {
    const { panel, el } = makePanel();
    panel.render([], seats);
    assert.equal(el.querySelectorAll('.history-panel__row').length, 0);
    assert.ok(el.querySelector('.history-panel__empty'), 'an empty-state row must be shown');
  });

  it('replaces the empty state with rows once entries arrive', () => {
    const { panel, el } = makePanel();
    panel.render([], seats);
    panel.render(sampleLog, seats);
    assert.equal(el.querySelector('.history-panel__empty'), null);
    assert.equal(el.querySelectorAll('.history-panel__row').length, 3);
  });

  it('uses an inner scroll element (fixed outer footprint) pinned to the bottom (FR-013/FR-014)', () => {
    const { panel, el } = makePanel();
    panel.render(sampleLog, seats);
    const scroll = el.querySelector('.history-panel__scroll');
    assert.ok(scroll, 'an inner scroll container must exist');
    assert.ok(el.classList.contains('history-panel'), 'the outer box class is unchanged');
    assert.equal(scroll.scrollTop, scroll.scrollHeight, 'scroll is pinned to the bottom (chat-style)');
  });

  it('renders correctly when seats is missing (defensive)', () => {
    const { panel, el } = makePanel();
    panel.render(sampleLog, null);
    assert.equal(el.querySelectorAll('.history-panel__row').length, 3);
  });
});
