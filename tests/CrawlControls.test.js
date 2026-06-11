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
    loadModule(dom, 'thousand/CrawlControls.js');
  } catch (_) {
    // Expected during TDD red phase — component file not yet written.
  }
});

// antlion mock: captures the named click handler and records offInput calls.
function makeControls() {
  const doc = dom.window.document;
  const el = doc.createElement('div');
  doc.body.appendChild(el);
  const Ctor = dom.window.CrawlControls;
  if (!Ctor) throw new Error('CrawlControls is not defined');
  let capturedHandler = null;
  const offCalls = [];
  const antlion = {
    bindInput: () => {},
    onInput: (name, handler) => { capturedHandler = handler; },
    offInput: (name, handler) => { offCalls.push({ name, handler }); },
  };
  const calls = { crawl: 0, leadNormally: 0 };
  const controls = new Ctor(el, {
    antlion,
    onCrawl: () => { calls.crawl += 1; },
    onLeadNormally: () => { calls.leadNormally += 1; },
    t: makeT(dom),
  });
  const simulateClick = (btn) => capturedHandler({ target: btn });
  return { controls, el, calls, simulateClick, offCalls };
}

function findButton(el, textFragment) {
  return [...el.querySelectorAll('button')].find((b) => b.textContent.includes(textFragment)) || null;
}

describe('CrawlControls — declarer choice render (FR-002, FR-003)', () => {
  it('showDeclarerChoice() renders Crawl and Lead normally buttons', () => { // per FR-002
    const { controls, el } = makeControls();
    controls.showDeclarerChoice();
    assert.ok(findButton(el, 'Crawl'), 'a Crawl button must be rendered');
    assert.ok(findButton(el, 'Lead normally'), 'a Lead normally button must be rendered');
  });
});

describe('CrawlControls — opponent prompt render (FR-004)', () => {
  it('showOpponentPrompt() prompts the opponent to commit a card face-down', () => { // per FR-004
    const { controls, el } = makeControls();
    controls.showOpponentPrompt();
    assert.match(el.textContent, /commit a card face-down/i);
  });
});

describe('CrawlControls — dispatch once (FR-003)', () => {
  it('clicking Crawl invokes onCrawl exactly once', () => { // per FR-003
    const { controls, el, calls, simulateClick } = makeControls();
    controls.showDeclarerChoice();
    const btn = findButton(el, 'Crawl');
    simulateClick(btn);
    assert.equal(calls.crawl, 1);
    simulateClick(btn); // choice already made — must not re-fire
    assert.equal(calls.crawl, 1);
    assert.equal(calls.leadNormally, 0);
  });

  it('clicking Lead normally invokes onLeadNormally exactly once', () => { // per FR-002
    const { controls, el, calls, simulateClick } = makeControls();
    controls.showDeclarerChoice();
    const btn = findButton(el, 'Lead normally');
    simulateClick(btn);
    assert.equal(calls.leadNormally, 1);
    assert.equal(calls.crawl, 0);
  });
});

describe('CrawlControls — teardown (FR-003)', () => {
  it('destroy() unbinds the Antlion input handler (no leak)', () => { // per FR-003
    const { controls, offCalls } = makeControls();
    controls.destroy();
    assert.equal(offCalls.length, 1, 'destroy() must offInput exactly the handler it registered');
    assert.equal(typeof offCalls[0].handler, 'function');
  });
});
