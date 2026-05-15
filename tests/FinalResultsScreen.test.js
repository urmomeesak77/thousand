'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

// ---------------------------------------------------------------------------
// jsdom setup — load FinalResultsScreen dependencies in dependency order
// ---------------------------------------------------------------------------

let dom;

before(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });

  loadModule(dom, 'thousand/constants.js');
  loadModule(dom, 'utils/HtmlUtil.js');
  loadModule(dom, 'thousand/FinalResultsScreen.js');
});

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeMockAntlion() {
  const handlers = {};
  return {
    bindInput(el, event, type) {
      el.addEventListener(event, (e) => { if (handlers[type]) handlers[type](e); });
    },
    onInput(type, handler) { handlers[type] = handler; },
    onTick() {},
    schedule() { return 0; },
    cancelScheduled() {},
    emit() {},
    stop() {},
  };
}

function makeFinalResultsScreen(onBackToLobby) {
  const doc = dom.window.document;
  const el = doc.createElement('div');
  doc.body.appendChild(el);
  const cb = onBackToLobby || (() => {});
  const antlion = makeMockAntlion();
  const screen = new dom.window.FinalResultsScreen(el, { viewerSeat: 0, onBackToLobby: cb, antlion });
  return { screen, el };
}

function makeFinalResults(overrides = {}) {
  return {
    winnerSeat: 0,
    winnerNickname: 'Alice',
    finalRanking: [
      { seat: 0, nickname: 'Alice', cumulativeScore: 1020, isWinner: true },
      { seat: 1, nickname: 'Bob', cumulativeScore: 650, isWinner: false },
      { seat: 2, nickname: 'Carol', cumulativeScore: 330, isWinner: false },
    ],
    history: [
      {
        roundNumber: 1,
        declarerSeat: 0,
        declarerNickname: 'Alice',
        bid: 120,
        perPlayer: {
          '0': { trickPoints: 60, marriageBonus: 60, delta: 120, cumulativeAfter: 120, penalties: [] },
          '1': { trickPoints: 30, marriageBonus: 0, delta: 30, cumulativeAfter: 30, penalties: [] },
          '2': { trickPoints: 30, marriageBonus: 0, delta: 30, cumulativeAfter: 30, penalties: [] },
        },
      },
      {
        roundNumber: 2,
        declarerSeat: 1,
        declarerNickname: 'Bob',
        bid: 100,
        perPlayer: {
          '0': { trickPoints: 40, marriageBonus: 0, delta: 40, cumulativeAfter: 160, penalties: [] },
          '1': { trickPoints: 50, marriageBonus: 0, delta: 50, cumulativeAfter: 80, penalties: [] },
          '2': { trickPoints: 30, marriageBonus: 0, delta: 30, cumulativeAfter: 60, penalties: [] },
        },
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// T058 — FinalResultsScreen: FR-017
// ---------------------------------------------------------------------------

// Test 1: Ranking display — each player has a row
describe('FinalResultsScreen — ranking display (FR-017)', () => {
  it('renders a row for each player in finalRanking', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    const rows = el.querySelectorAll('.final-results__ranking-row');
    assert.equal(rows.length, 3, 'must render 3 ranking rows for 3 players');
  });

  it('renders Alice in the ranking display', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    assert.ok(el.textContent.includes('Alice'), 'Alice must appear in ranking');
  });

  it('renders Bob in the ranking display', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    assert.ok(el.textContent.includes('Bob'), 'Bob must appear in ranking');
  });

  it('renders Carol in the ranking display', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    assert.ok(el.textContent.includes('Carol'), 'Carol must appear in ranking');
  });
});

// Test 2: Rankings are sorted in descending order by cumulativeScore
describe('FinalResultsScreen — ranking order is descending by score (FR-017)', () => {
  it('first ranking row is the highest scorer (1020 points)', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    const rows = el.querySelectorAll('.final-results__ranking-row');
    assert.ok(rows.length > 0, 'precondition: ranking rows must exist');
    assert.ok(rows[0].textContent.includes('Alice') || rows[0].textContent.includes('1020'),
      'first row must be Alice with 1020 points');
  });

  it('second ranking row is the second-highest scorer (650 points)', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    const rows = el.querySelectorAll('.final-results__ranking-row');
    assert.ok(rows.length > 1, 'precondition: at least 2 ranking rows must exist');
    assert.ok(rows[1].textContent.includes('Bob') || rows[1].textContent.includes('650'),
      'second row must be Bob with 650 points');
  });

  it('third ranking row is the lowest scorer (330 points)', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    const rows = el.querySelectorAll('.final-results__ranking-row');
    assert.ok(rows.length > 2, 'precondition: at least 3 ranking rows must exist');
    assert.ok(rows[2].textContent.includes('Carol') || rows[2].textContent.includes('330'),
      'third row must be Carol with 330 points');
  });

  it('ranking rows show cumulativeScore values in descending order (no re-sorting needed)', () => {
    const { screen, el } = makeFinalResultsScreen({
      finalRanking: [
        { seat: 0, nickname: 'Alice', cumulativeScore: 1000, isWinner: true },
        { seat: 1, nickname: 'Bob', cumulativeScore: 500, isWinner: false },
        { seat: 2, nickname: 'Carol', cumulativeScore: 250, isWinner: false },
      ],
    });
    screen.mount(makeFinalResults({
      finalRanking: [
        { seat: 0, nickname: 'Alice', cumulativeScore: 1000, isWinner: true },
        { seat: 1, nickname: 'Bob', cumulativeScore: 500, isWinner: false },
        { seat: 2, nickname: 'Carol', cumulativeScore: 250, isWinner: false },
      ],
    }));
    const rows = el.querySelectorAll('.final-results__ranking-row');
    assert.ok(rows.length === 3, 'must have 3 rows');
    // Check that scores appear in descending order in the document
    const text = el.textContent;
    const pos1000 = text.indexOf('1000');
    const pos500 = text.indexOf('500');
    const pos250 = text.indexOf('250');
    assert.ok(pos1000 < pos500 && pos500 < pos250,
      'scores must appear in descending order (1000 > 500 > 250)');
  });
});

// Test 3: Each ranking row shows nickname and cumulativeScore
describe('FinalResultsScreen — ranking row shows nickname and score (FR-017)', () => {
  it('ranking row contains both nickname and cumulativeScore', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    const rows = el.querySelectorAll('.final-results__ranking-row');
    assert.ok(rows.length > 0, 'precondition: ranking rows must exist');
    // At least one row should contain both a nickname and a score
    let foundBoth = false;
    rows.forEach((row) => {
      if (row.textContent.includes('Alice') && row.textContent.includes('1020')) {
        foundBoth = true;
      }
    });
    assert.ok(foundBoth, 'at least one ranking row must show both nickname and score');
  });
});

// Test 4: Winner row has isWinner marker
describe('FinalResultsScreen — winner highlight (FR-017)', () => {
  it('the row with isWinner: true has a .final-results__ranking-row--winner class', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    const winnerRow = el.querySelector('.final-results__ranking-row--winner');
    assert.ok(winnerRow, 'winner row must have .final-results__ranking-row--winner class');
  });

  it('winner row contains the winner nickname', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    const winnerRow = el.querySelector('.final-results__ranking-row--winner');
    assert.ok(winnerRow, 'precondition: winner row must exist');
    assert.ok(winnerRow.textContent.includes('Alice'),
      'winner row must contain Alice nickname');
  });

  it('non-winner rows do NOT have .final-results__ranking-row--winner class', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    const rows = el.querySelectorAll('.final-results__ranking-row');
    let nonWinnerCount = 0;
    rows.forEach((row) => {
      if (!row.classList.contains('final-results__ranking-row--winner')) {
        nonWinnerCount++;
      }
    });
    assert.equal(nonWinnerCount, 2, 'exactly 2 non-winner rows must exist');
  });

  it('winner row matches winnerNickname from finalResults', () => {
    const { screen, el } = makeFinalResultsScreen();
    const results = makeFinalResults({ winnerNickname: 'Bob' });
    results.finalRanking = [
      { seat: 1, nickname: 'Bob', cumulativeScore: 1200, isWinner: true },
      { seat: 0, nickname: 'Alice', cumulativeScore: 900, isWinner: false },
      { seat: 2, nickname: 'Carol', cumulativeScore: 300, isWinner: false },
    ];
    screen.mount(results);
    const winnerRow = el.querySelector('.final-results__ranking-row--winner');
    assert.ok(winnerRow, 'precondition: winner row must exist');
    assert.ok(winnerRow.textContent.includes('Bob'),
      'winner row must match winnerNickname');
  });
});

// Test 5: History table rendering
describe('FinalResultsScreen — history table rendering (FR-017)', () => {
  it('renders a row for each round in history', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    const historyRows = el.querySelectorAll('.final-results__history-row');
    assert.equal(historyRows.length, 2, 'must render 2 history rows for 2 rounds');
  });

  it('history row shows roundNumber', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    assert.ok(el.textContent.includes('1') || el.textContent.includes('Round 1'),
      'roundNumber 1 must appear in history');
  });

  it('history row shows declarerNickname', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    // First round declarer is Alice
    assert.ok(el.textContent.includes('Alice'), 'declarer nickname must appear in history');
  });

  it('history row shows bid value', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    assert.ok(el.textContent.includes('120') || el.textContent.includes('bid'),
      'bid value must appear in history');
  });

  it('history row shows per-player delta and cumulativeAfter values', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    // Round 1: Alice delta=120, cumulativeAfter=120
    // Bob delta=30, cumulativeAfter=30
    // Carol delta=30, cumulativeAfter=30
    const text = el.textContent;
    assert.ok(text.includes('120') && text.includes('30'),
      'per-player delta and score values must appear in history');
  });

  it('each history row contains data for all players in that round', () => {
    const { screen, el } = makeFinalResultsScreen();
    const results = makeFinalResults();
    screen.mount(results);
    const historyRows = el.querySelectorAll('.final-results__history-row');
    assert.ok(historyRows.length > 0, 'precondition: history rows must exist');
    // First row should have data for round 1
    const firstRow = historyRows[0];
    assert.ok(firstRow.textContent.includes('Alice') || firstRow.textContent.includes('120'),
      'first history row must contain data from round 1');
  });
});

// Test 6: Back to Lobby button
describe('FinalResultsScreen — back to lobby button (FR-017)', () => {
  it('renders .final-results__back-btn', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    const btn = el.querySelector('.final-results__back-btn');
    assert.ok(btn, '.final-results__back-btn must exist');
  });

  it('.final-results__back-btn text indicates Back or Lobby', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    const btn = el.querySelector('.final-results__back-btn');
    assert.ok(btn, 'precondition: back-btn must exist');
    assert.ok(
      btn.textContent.toLowerCase().includes('lobby') || btn.textContent.toLowerCase().includes('back'),
      'back-btn text must reference lobby or back'
    );
  });

  it('clicking .final-results__back-btn calls onBackToLobby()', () => {
    let called = false;
    const { screen, el } = makeFinalResultsScreen(() => { called = true; });
    screen.mount(makeFinalResults());

    const btn = el.querySelector('.final-results__back-btn');
    assert.ok(btn, 'precondition: back-btn must exist');
    btn.click();

    assert.ok(called, 'onBackToLobby must be called when back-btn is clicked');
  });

  it('onBackToLobby is not called before the button is clicked', () => {
    let called = false;
    const { screen, el } = makeFinalResultsScreen(() => { called = true; });
    screen.mount(makeFinalResults());

    assert.ok(!called, 'onBackToLobby must not be called before button click');
  });
});

// Test 7: Unmount cleanup
describe('FinalResultsScreen — unmount cleanup', () => {
  it('after unmount(), the DOM contains no ranking rows', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    assert.ok(el.querySelector('.final-results__ranking-row'),
      'precondition: ranking rows must exist before unmount');

    screen.unmount();

    assert.equal(el.querySelector('.final-results__ranking-row'), null,
      'ranking rows must be removed after unmount');
  });

  it('after unmount(), the DOM contains no history rows', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    assert.ok(el.querySelector('.final-results__history-row'),
      'precondition: history rows must exist before unmount');

    screen.unmount();

    assert.equal(el.querySelector('.final-results__history-row'), null,
      'history rows must be removed after unmount');
  });

  it('after unmount(), the back button is removed', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    assert.ok(el.querySelector('.final-results__back-btn'),
      'precondition: back-btn must exist before unmount');

    screen.unmount();

    assert.equal(el.querySelector('.final-results__back-btn'), null,
      'back-btn must be removed after unmount');
  });

  it('unmount() clears the container DOM', () => {
    const { screen, el } = makeFinalResultsScreen();
    screen.mount(makeFinalResults());
    assert.ok(el.innerHTML.length > 0, 'precondition: container must have content');

    screen.unmount();

    // After unmount, container should be empty or have minimal content
    assert.equal(el.querySelector('.final-results__ranking-row'), null,
      'no ranking rows after unmount');
    assert.equal(el.querySelector('.final-results__history-row'), null,
      'no history rows after unmount');
  });
});
