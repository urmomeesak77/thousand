'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

let dom;

before(() => {
  dom = new JSDOM('<html><body></body></html>', { runScripts: 'dangerously', url: 'http://localhost' });
  loadModule(dom, 'thousand/constants.js');
  loadModule(dom, 'utils/HtmlUtil.js');
  loadModule(dom, 'thousand/RoundSummaryScreen.js');
});

function makeMockAntlion() {
  const handlers = {};
  return {
    bindInput(el, event, type) {
      const fn = (e) => { if (handlers[type]) handlers[type](e); };
      el.addEventListener(event, fn);
      return () => el.removeEventListener(event, fn);
    },
    onInput(type, handler) { handlers[type] = handler; },
    offInput(type, handler) { if (handlers[type] === handler) { delete handlers[type]; } },
    onTick() {}, schedule() { return 0; }, cancelScheduled() {}, emit() {}, stop() {},
  };
}

function makeScreen() {
  const doc = dom.window.document;
  const el = doc.createElement('div');
  doc.body.appendChild(el);
  const screen = new dom.window.RoundSummaryScreen(el, { antlion: makeMockAntlion(), onBackToLobby: () => {} });
  return { screen, el };
}

// seat 1 received the four-nines bonus this round.
function makeSummary() {
  return {
    roundNumber: 1, declarerSeat: 0, declarerNickname: 'Alice', bid: 100, declarerMadeBid: true,
    perPlayer: {
      0: { nickname: 'Alice', seat: 0, trickPoints: 60, marriageBonus: 0, roundTotal: 60, delta: 100, cumulativeAfter: 100, penalties: [] },
      1: { nickname: 'Bob',   seat: 1, trickPoints: 30, marriageBonus: 0, roundTotal: 30, delta: 30,  cumulativeAfter: 160, penalties: [], fourNinesBonus: 100 },
      2: { nickname: 'Carol', seat: 2, trickPoints: 30, marriageBonus: 0, roundTotal: 30, delta: 30,  cumulativeAfter: 30,  penalties: [] },
    },
    viewerCollectedCards: [], victoryReached: false,
  };
}

describe('RoundSummaryScreen.fournines — distinct line item (FR-008)', () => {
  it('renders a "Four nines: +100" line item on the awarded seat row', () => { // per FR-008
    const { screen, el } = makeScreen();
    screen.render(makeSummary());
    const fourNinesRow = el.querySelector('.round-summary__four-nines-row[data-seat="1"]');
    assert.ok(fourNinesRow, 'awarded seat must have a four-nines line item row');
    assert.ok(fourNinesRow.textContent.includes('Four nines'), 'line item must be labelled');
    assert.ok(fourNinesRow.textContent.includes('100'), 'line item must show +100');
  });

  it('does not render the line item for seats that were not awarded', () => { // per FR-008
    const { screen, el } = makeScreen();
    screen.render(makeSummary());
    assert.equal(el.querySelector('.round-summary__four-nines-row[data-seat="0"]'), null);
    assert.equal(el.querySelector('.round-summary__four-nines-row[data-seat="2"]'), null);
  });
});
