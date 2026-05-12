'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// jsdom setup
// ---------------------------------------------------------------------------

let dom;

before(() => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'public', 'js', 'thousand', 'StatusBar.js'),
    'utf8'
  );
  const stripped = src
    .replace(/^import\s+\S.*$/gm, '')
    .replace(/^export default\s+(\w+);\s*$/gm, 'window.$1 = $1;');

  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  dom.window.eval(stripped);
});

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeStatusBar() {
  const el = dom.window.document.createElement('div');
  return new dom.window.StatusBar(el);
}

// Full default view-model; override individual fields per test
function status(overrides = {}) {
  return {
    phase: 'Bidding',
    activePlayer: null,
    viewerIsActive: false,
    currentHighBid: null,
    declarer: null,
    passedPlayers: [],
    sellAttempt: null,
    disconnectedPlayers: [],
    ...overrides,
  };
}

// DOM query helpers
function text(sb, selector) {
  return sb._el.querySelector(selector)?.textContent ?? null;
}

function all(sb, selector) {
  return [...sb._el.querySelectorAll(selector)];
}

// ---------------------------------------------------------------------------
// T058 — FR-025: phase label rendering
// ---------------------------------------------------------------------------

describe('StatusBar — phase label (FR-025)', () => {
  it('renders the phase string in the .status-bar__phase span', () => {
    const sb = makeStatusBar();
    sb.render(status({ phase: 'Dealing' }));
    assert.equal(text(sb, '.status-bar__phase'), 'Dealing');
  });

  it('renders Bidding phase', () => {
    const sb = makeStatusBar();
    sb.render(status({ phase: 'Bidding' }));
    assert.equal(text(sb, '.status-bar__phase'), 'Bidding');
  });

  it('renders Declarer deciding phase', () => {
    const sb = makeStatusBar();
    sb.render(status({ phase: 'Declarer deciding' }));
    assert.equal(text(sb, '.status-bar__phase'), 'Declarer deciding');
  });

  it('renders Round ready to play phase', () => {
    const sb = makeStatusBar();
    sb.render(status({ phase: 'Round ready to play' }));
    assert.equal(text(sb, '.status-bar__phase'), 'Round ready to play');
  });

  it('renders Round aborted phase', () => {
    const sb = makeStatusBar();
    sb.render(status({ phase: 'Round aborted' }));
    assert.equal(text(sb, '.status-bar__phase'), 'Round aborted');
  });
});

// ---------------------------------------------------------------------------
// T058 — FR-025: active player framing
// ---------------------------------------------------------------------------

describe('StatusBar — active player framing (FR-025)', () => {
  it('renders "Your turn" when viewerIsActive is true', () => {
    const sb = makeStatusBar();
    sb.render(status({
      phase: 'Bidding',
      activePlayer: { seat: 1, nickname: 'Bob' },
      viewerIsActive: true,
    }));
    assert.equal(text(sb, '.status-bar__turn'), 'Your turn');
  });

  it('renders "Waiting for {nickname}…" when viewerIsActive is false', () => {
    const sb = makeStatusBar();
    sb.render(status({
      phase: 'Bidding',
      activePlayer: { seat: 1, nickname: 'Bob' },
      viewerIsActive: false,
    }));
    assert.equal(text(sb, '.status-bar__turn'), 'Waiting for Bob…');
  });

  it('omits the turn span when activePlayer is null', () => {
    const sb = makeStatusBar();
    sb.render(status({ phase: 'Dealing', activePlayer: null }));
    assert.equal(sb._el.querySelector('.status-bar__turn'), null, 'turn span must not exist when no active player');
  });

  it('renders "Your turn" for Declarer deciding phase when viewer is declarer', () => {
    const sb = makeStatusBar();
    sb.render(status({
      phase: 'Declarer deciding',
      activePlayer: { seat: 0, nickname: 'Alice' },
      viewerIsActive: true,
      declarer: { seat: 0, nickname: 'Alice' },
    }));
    assert.equal(text(sb, '.status-bar__turn'), 'Your turn');
  });
});

// ---------------------------------------------------------------------------
// T058 — FR-025: current high bid display
// ---------------------------------------------------------------------------

describe('StatusBar — current high bid display (FR-025)', () => {
  it('shows "Bid: 100" when currentHighBid is null (opening minimum)', () => {
    const sb = makeStatusBar();
    sb.render(status({ currentHighBid: null }));
    assert.equal(text(sb, '.status-bar__bid'), 'Bid: 100');
  });

  it('shows the accepted bid value when currentHighBid is set', () => {
    const sb = makeStatusBar();
    sb.render(status({ currentHighBid: 120 }));
    assert.equal(text(sb, '.status-bar__bid'), 'Bid: 120');
  });

  it('shows 300 at the cap', () => {
    const sb = makeStatusBar();
    sb.render(status({ currentHighBid: 300 }));
    assert.equal(text(sb, '.status-bar__bid'), 'Bid: 300');
  });
});

// ---------------------------------------------------------------------------
// T058 — FR-025: declarer label
// ---------------------------------------------------------------------------

describe('StatusBar — declarer label (FR-025)', () => {
  it('renders "Declarer: {nickname}" when declarer is set', () => {
    const sb = makeStatusBar();
    sb.render(status({
      phase: 'Declarer deciding',
      declarer: { seat: 0, nickname: 'Alice' },
    }));
    assert.equal(text(sb, '.status-bar__declarer'), 'Declarer: Alice');
  });

  it('omits the declarer span when declarer is null', () => {
    const sb = makeStatusBar();
    sb.render(status({ declarer: null }));
    assert.equal(sb._el.querySelector('.status-bar__declarer'), null);
  });
});

// ---------------------------------------------------------------------------
// T058 — FR-025: disconnected players list
// ---------------------------------------------------------------------------

describe('StatusBar — disconnected players list (FR-025)', () => {
  it('renders a "Connection lost…" indicator for each disconnected player', () => {
    const sb = makeStatusBar();
    sb.render(status({ disconnectedPlayers: ['Bob'] }));
    const indicators = all(sb, '.status-bar__disconnected');
    assert.equal(indicators.length, 1);
    assert.ok(indicators[0].textContent.includes('Bob'));
    assert.ok(indicators[0].textContent.includes('Connection lost'));
  });

  it('renders indicators for multiple disconnected players', () => {
    const sb = makeStatusBar();
    sb.render(status({ disconnectedPlayers: ['Bob', 'Carol'] }));
    const indicators = all(sb, '.status-bar__disconnected');
    assert.equal(indicators.length, 2);
  });

  it('omits disconnected indicators when the list is empty', () => {
    const sb = makeStatusBar();
    sb.render(status({ disconnectedPlayers: [] }));
    assert.equal(all(sb, '.status-bar__disconnected').length, 0);
  });

  it('re-render clears previous disconnected indicators', () => {
    const sb = makeStatusBar();
    sb.render(status({ disconnectedPlayers: ['Bob'] }));
    sb.render(status({ disconnectedPlayers: [] }));
    assert.equal(all(sb, '.status-bar__disconnected').length, 0);
  });
});

// ---------------------------------------------------------------------------
// T058 — FR-025: passed players chips
// ---------------------------------------------------------------------------

describe('StatusBar — passed players chips (FR-025)', () => {
  it('renders a chip for each passed player', () => {
    const sb = makeStatusBar();
    sb.render(status({ passedPlayers: ['Bob', 'Carol'] }));
    const chips = all(sb, '.status-bar__passed-chip');
    assert.equal(chips.length, 2);
    assert.equal(chips[0].textContent, 'Bob');
    assert.equal(chips[1].textContent, 'Carol');
  });

  it('renders a "Passed:" label when there are passed players', () => {
    const sb = makeStatusBar();
    sb.render(status({ passedPlayers: ['Bob'] }));
    const label = sb._el.querySelector('.status-bar__passed-label');
    assert.ok(label, 'passed label must exist');
    assert.ok(label.textContent.includes('Passed'));
  });

  it('omits the passed row when passedPlayers is empty', () => {
    const sb = makeStatusBar();
    sb.render(status({ passedPlayers: [] }));
    assert.equal(sb._el.querySelector('.status-bar__passed-row'), null);
  });
});
