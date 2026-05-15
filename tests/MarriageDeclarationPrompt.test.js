'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

// ---------------------------------------------------------------------------
// jsdom setup — load MarriageDeclarationPrompt (does not exist yet → TDD red)
// ---------------------------------------------------------------------------

let dom;

before(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });

  // MarriageDeclarationPrompt.js does not exist yet; loadModule will throw.
  // We catch the error so the describe/it blocks can still be registered and
  // reported as failures (rather than the entire suite crashing at load time).
  try {
    loadModule(dom, 'thousand/MarriageDeclarationPrompt.js');
  } catch (_) {
    // Expected during TDD red phase — component file not yet written.
  }
});

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeMockDispatcher() {
  const calls = [];
  return {
    sendPlayCard(cardId, opts) {
      calls.push({ cardId, opts: opts !== undefined ? opts : undefined });
    },
    _calls: calls,
  };
}

/**
 * Create a fresh DOM element and a MarriageDeclarationPrompt instance.
 * Returns { prompt, el, dispatcher } or throws if the constructor is absent.
 */
function makePrompt() {
  const doc = dom.window.document;
  const el = doc.createElement('div');
  doc.body.appendChild(el);
  const dispatcher = makeMockDispatcher();
  const Ctor = dom.window.MarriageDeclarationPrompt;
  if (!Ctor) throw new Error('MarriageDeclarationPrompt is not defined');
  const prompt = new Ctor(el, { dispatcher });
  return { prompt, el, dispatcher };
}

/**
 * Build a hand array of { id, rank, suit } card objects from a shorthand list.
 * e.g.  hand([['K','♥'], ['Q','♥'], ['9','♣']])
 */
function hand(specs) {
  return specs.map(([rank, suit], i) => ({ id: i, rank, suit }));
}

// ---------------------------------------------------------------------------
// Helper: find a rendered button inside el by partial text content
// ---------------------------------------------------------------------------

function findButton(el, textFragment) {
  const buttons = [...el.querySelectorAll('button')];
  return buttons.find((b) => b.textContent.includes(textFragment)) || null;
}

// ---------------------------------------------------------------------------
// T042 — MarriageDeclarationPrompt: FR-009
// ---------------------------------------------------------------------------

// ---------------------  canOffer — trickNumber gate  -----------------------

describe('MarriageDeclarationPrompt.canOffer — trickNumber must be in [2, 6]', () => {
  it('returns false for trickNumber 1', () => {
    const canOffer = dom.window.MarriageDeclarationPrompt &&
      dom.window.MarriageDeclarationPrompt.canOffer;
    assert.ok(canOffer, 'MarriageDeclarationPrompt.canOffer must be defined');
    const h = hand([['K', '♥'], ['Q', '♥'], ['9', '♣']]);
    assert.equal(canOffer(h, 1), false, 'trick 1 must return false');
  });

  it('returns false for trickNumber 7', () => {
    const canOffer = dom.window.MarriageDeclarationPrompt &&
      dom.window.MarriageDeclarationPrompt.canOffer;
    assert.ok(canOffer, 'MarriageDeclarationPrompt.canOffer must be defined');
    const h = hand([['K', '♥'], ['Q', '♥'], ['9', '♣']]);
    assert.equal(canOffer(h, 7), false, 'trick 7 must return false');
  });

  it('returns false for trickNumber 8', () => {
    const canOffer = dom.window.MarriageDeclarationPrompt &&
      dom.window.MarriageDeclarationPrompt.canOffer;
    assert.ok(canOffer, 'MarriageDeclarationPrompt.canOffer must be defined');
    const h = hand([['K', '♥'], ['Q', '♥'], ['9', '♣']]);
    assert.equal(canOffer(h, 8), false, 'trick 8 must return false');
  });
});

// ---------------------  canOffer — hand length gate  -----------------------

describe('MarriageDeclarationPrompt.canOffer — hand must have at least 3 cards', () => {
  it('returns false when hand.length === 2 (K♥ and Q♥ only)', () => {
    const canOffer = dom.window.MarriageDeclarationPrompt &&
      dom.window.MarriageDeclarationPrompt.canOffer;
    assert.ok(canOffer, 'MarriageDeclarationPrompt.canOffer must be defined');
    const h = hand([['K', '♥'], ['Q', '♥']]);
    assert.equal(canOffer(h, 3), false, 'hand with only 2 cards must return false');
  });
});

// ---------------------  canOffer — K+Q same suit gate  --------------------

describe('MarriageDeclarationPrompt.canOffer — hand must contain K and Q of same suit', () => {
  it('returns false when hand has K♥ but not Q♥', () => {
    const canOffer = dom.window.MarriageDeclarationPrompt &&
      dom.window.MarriageDeclarationPrompt.canOffer;
    assert.ok(canOffer, 'MarriageDeclarationPrompt.canOffer must be defined');
    const h = hand([['K', '♥'], ['9', '♥'], ['J', '♣']]);
    assert.equal(canOffer(h, 3), false, 'K♥ without Q♥ must return false');
  });

  it('returns false when hand has Q♥ but not K♥', () => {
    const canOffer = dom.window.MarriageDeclarationPrompt &&
      dom.window.MarriageDeclarationPrompt.canOffer;
    assert.ok(canOffer, 'MarriageDeclarationPrompt.canOffer must be defined');
    const h = hand([['Q', '♥'], ['9', '♥'], ['J', '♣']]);
    assert.equal(canOffer(h, 3), false, 'Q♥ without K♥ must return false');
  });

  it('returns false when hand has K♥ and Q♣ (different suits)', () => {
    const canOffer = dom.window.MarriageDeclarationPrompt &&
      dom.window.MarriageDeclarationPrompt.canOffer;
    assert.ok(canOffer, 'MarriageDeclarationPrompt.canOffer must be defined');
    const h = hand([['K', '♥'], ['Q', '♣'], ['9', '♠']]);
    assert.equal(canOffer(h, 3), false, 'K♥ + Q♣ (different suits) must return false');
  });
});

// ---------------------  canOffer — true cases  ----------------------------

describe('MarriageDeclarationPrompt.canOffer — true when all conditions met', () => {
  it('returns true: K♥, Q♥, one other card, trickNumber 2', () => {
    const canOffer = dom.window.MarriageDeclarationPrompt &&
      dom.window.MarriageDeclarationPrompt.canOffer;
    assert.ok(canOffer, 'MarriageDeclarationPrompt.canOffer must be defined');
    const h = hand([['K', '♥'], ['Q', '♥'], ['9', '♣']]);
    assert.equal(canOffer(h, 2), true, 'K♥ + Q♥ + extra card, trick 2 must return true');
  });

  it('returns true: K♣, Q♣, two other cards, trickNumber 6', () => {
    const canOffer = dom.window.MarriageDeclarationPrompt &&
      dom.window.MarriageDeclarationPrompt.canOffer;
    assert.ok(canOffer, 'MarriageDeclarationPrompt.canOffer must be defined');
    const h = hand([['K', '♣'], ['Q', '♣'], ['9', '♠'], ['J', '♥']]);
    assert.equal(canOffer(h, 6), true, 'K♣ + Q♣ + two extras, trick 6 must return true');
  });
});

// ---------------------  Outbound message — "Declare and play"  ------------

describe('MarriageDeclarationPrompt — "Declare and play" calls sendPlayCard with declareMarriage:true', () => {
  it('clicking "Declare and play" calls dispatcher.sendPlayCard(cardId, { declareMarriage: true })', () => {
    const { prompt, el, dispatcher } = makePrompt();
    const cardId = 42;
    prompt.show(cardId, '♥', 80);

    const btn = findButton(el, 'Declare');
    assert.ok(btn, '"Declare and play" button must be rendered after show()');

    btn.click();

    assert.equal(dispatcher._calls.length, 1, 'sendPlayCard must be called exactly once');
    const call = dispatcher._calls[0];
    assert.equal(call.cardId, cardId, 'sendPlayCard must receive the correct cardId');
    assert.deepEqual(call.opts, { declareMarriage: true },
      'sendPlayCard must receive { declareMarriage: true }');
  });
});

// ---------------------  Outbound message — "Play without declaring"  ------

describe('MarriageDeclarationPrompt — "Play without declaring" calls sendPlayCard with no extra opts', () => {
  it('clicking "Play without declaring" calls dispatcher.sendPlayCard(cardId) with no opts', () => {
    const { prompt, el, dispatcher } = makePrompt();
    const cardId = 7;
    prompt.show(cardId, '♠', 40);

    const btn = findButton(el, 'without');
    assert.ok(btn, '"Play without declaring" button must be rendered after show()');

    btn.click();

    assert.equal(dispatcher._calls.length, 1, 'sendPlayCard must be called exactly once');
    const call = dispatcher._calls[0];
    assert.equal(call.cardId, cardId, 'sendPlayCard must receive the correct cardId');
    assert.equal(call.opts, undefined,
      'sendPlayCard must NOT receive extra options when playing without declaring');
  });
});

// ---------------------  Outbound message — "Cancel"  ---------------------

describe('MarriageDeclarationPrompt — "Cancel" makes no dispatcher call and hides the prompt', () => {
  it('clicking "Cancel" does not call sendPlayCard', () => {
    const { prompt, el, dispatcher } = makePrompt();
    const cardId = 3;
    prompt.show(cardId, '♦', 60);

    const btn = findButton(el, 'Cancel');
    assert.ok(btn, '"Cancel" button must be rendered after show()');

    btn.click();

    assert.equal(dispatcher._calls.length, 0, 'sendPlayCard must NOT be called on Cancel');
  });

  it('clicking "Cancel" hides the prompt', () => {
    const { prompt, el, dispatcher } = makePrompt();
    prompt.show(7, '♣', 100);

    const cancelBtn = findButton(el, 'Cancel');
    assert.ok(cancelBtn, '"Cancel" button must be rendered after show()');

    cancelBtn.click();

    // After cancel, the prompt should not be visible.
    // We check by calling hide() via prompt.hide (no throw) and by verifying
    // the element is hidden (display:none or hidden attribute or empty content).
    const visible = el.style.display !== 'none' &&
      !el.hasAttribute('hidden') &&
      el.querySelector('button') !== null;
    assert.equal(visible, false,
      'after Cancel, prompt must not show any interactive buttons');
  });
});

// ---------------------  show() / hide() API  ------------------------------

describe('MarriageDeclarationPrompt — show() and hide() API', () => {
  it('show() renders buttons inside the element', () => {
    const { prompt, el } = makePrompt();
    prompt.show(1, '♥', 80);
    const buttons = el.querySelectorAll('button');
    assert.ok(buttons.length >= 2, 'show() must render at least 2 buttons');
  });

  it('hide() removes or conceals the prompt content', () => {
    const { prompt, el } = makePrompt();
    prompt.show(1, '♠', 60);
    prompt.hide();

    const visible = el.style.display !== 'none' &&
      !el.hasAttribute('hidden') &&
      el.querySelector('button') !== null;
    assert.equal(visible, false, 'hide() must conceal all prompt buttons');
  });

  it('show() surfaces the suit in the rendered content', () => {
    const { prompt, el } = makePrompt();
    prompt.show(5, '♦', 60);
    assert.ok(
      el.textContent.includes('♦'),
      'show() must display the suit symbol in the prompt',
    );
  });

  it('show() surfaces the bonus in the rendered content', () => {
    const { prompt, el } = makePrompt();
    prompt.show(5, '♣', 100);
    assert.ok(
      el.textContent.includes('100'),
      'show() must display the bonus value in the prompt',
    );
  });
});
