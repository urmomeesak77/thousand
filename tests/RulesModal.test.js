'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

let dom;

// Minimal DOM: two triggers (sharing .rules-btn) + the modal with a close button.
function buildDom(document) {
  document.body.innerHTML = `
    <button class="rules-btn" id="trigger-a"></button>
    <button class="rules-btn" id="trigger-b"></button>
    <div id="rules-modal" class="modal-overlay hidden">
      <div class="modal-card">
        <button id="rules-close-btn"></button>
      </div>
    </div>`;
}

// Captures named input handlers so the test can fire them synchronously.
function makeFakeAntlion() {
  const handlers = {};
  return {
    handlers,
    bindInput() {},
    onInput(type, fn) { handlers[type] = fn; },
  };
}

function setup() {
  const antlion = makeFakeAntlion();
  const modal = new dom.window.RulesModal(antlion);
  modal.bind();
  return antlion;
}

beforeEach(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  loadModule(dom, 'utils/HtmlUtil.js');
  loadModule(dom, 'overlays/RulesModal.js');
  buildDom(dom.window.document);
});

describe('RulesModal — open/close', () => {
  it('opens (removes hidden) when a rules-btn fires rules-open', () => {
    const antlion = setup();
    antlion.handlers['rules-open']();
    assert.equal(
      dom.window.document.getElementById('rules-modal').classList.contains('hidden'),
      false,
    );
  });

  it('closes (adds hidden) when the close button fires rules-close', () => {
    const antlion = setup();
    antlion.handlers['rules-open']();
    antlion.handlers['rules-close']();
    assert.equal(
      dom.window.document.getElementById('rules-modal').classList.contains('hidden'),
      true,
    );
  });

  it('closes when Escape is pressed', () => {
    const antlion = setup();
    antlion.handlers['rules-open']();
    antlion.handlers['rules-keydown']({ key: 'Escape' });
    assert.equal(
      dom.window.document.getElementById('rules-modal').classList.contains('hidden'),
      true,
    );
  });

  it('ignores non-Escape keys', () => {
    const antlion = setup();
    antlion.handlers['rules-open']();
    antlion.handlers['rules-keydown']({ key: 'a' });
    assert.equal(
      dom.window.document.getElementById('rules-modal').classList.contains('hidden'),
      false,
    );
  });

  it('closes when the overlay backdrop itself is clicked', () => {
    const antlion = setup();
    const overlay = dom.window.document.getElementById('rules-modal');
    antlion.handlers['rules-open']();
    antlion.handlers['rules-overlay-click']({ target: overlay });
    assert.equal(overlay.classList.contains('hidden'), true);
  });

  it('stays open when a click originates inside the card', () => {
    const antlion = setup();
    const card = dom.window.document.querySelector('.modal-card');
    antlion.handlers['rules-open']();
    antlion.handlers['rules-overlay-click']({ target: card });
    assert.equal(
      dom.window.document.getElementById('rules-modal').classList.contains('hidden'),
      false,
    );
  });
});
