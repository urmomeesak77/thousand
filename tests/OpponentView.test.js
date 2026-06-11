'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');
const { makeT } = require('./helpers/loadI18n');

let dom;
let t;

before(() => {
  dom = new JSDOM('<html><body></body></html>', { runScripts: 'dangerously', url: 'http://localhost' });
  loadModule(dom, 'thousand/roundStatsText.js');
  loadModule(dom, 'thousand/OpponentView.js');
  t = makeT(dom, { language: 'en' });
});

function makeView() {
  const el = dom.window.document.createElement('div');
  return { view: new dom.window.OpponentView(el, t), el };
}

describe('OpponentView — round stats line', () => {
  it('renders "N tricks, M points" after setRoundStats', () => {
    const { view, el } = makeView();
    view.setNickname('P1');
    view.setCardCount(3);
    view.setRoundStats(2, 35);
    const line = el.querySelector('.opponent-view__round-stats');
    assert.ok(line, 'stat line must exist');
    assert.ok(line.textContent.includes('2'), 'shows trick count 2');
    assert.ok(line.textContent.includes('35'), 'shows points 35');
  });

  it('omits the stat line when stats are cleared (null)', () => {
    const { view, el } = makeView();
    view.setRoundStats(2, 35);
    assert.ok(el.querySelector('.opponent-view__round-stats'), 'precondition: line present');
    view.setRoundStats(null, null);
    assert.equal(el.querySelector('.opponent-view__round-stats'), null,
      'stat line gone after clearing');
  });
});
