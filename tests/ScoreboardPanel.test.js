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
    btn.dispatchEvent(new dom.window.Event('click'));
    assert.equal(el.classList.contains('scoreboard--collapsed'), false);
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
