'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

// ---------------------------------------------------------------------------
// jsdom setup — load NewGameModal + its HtmlUtil dependency
// ---------------------------------------------------------------------------

let dom;

// Minimal modal DOM: the player-count radio group (T031) + the form/buttons
// NewGameModal binds to. game-type defaults to public so the submit guard passes.
function buildModalDom(document) {
  document.body.innerHTML = `
    <button id="new-game-btn"></button>
    <div id="new-game-modal" class="hidden">
      <form id="new-game-form">
        <label><input type="radio" name="game-type" value="public" checked /></label>
        <label><input type="radio" name="game-type" value="private" /></label>
        <fieldset>
          <legend>Players</legend>
          <label><input type="radio" name="player-count" value="3" checked /></label>
          <label><input type="radio" name="player-count" value="4" /></label>
        </fieldset>
        <button id="modal-cancel-btn" type="button"></button>
      </form>
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

beforeEach(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  loadModule(dom, 'utils/HtmlUtil.js');
  loadModule(dom, 'overlays/NewGameModal.js');
  buildModalDom(dom.window.document);
});

// Wires up a NewGameModal, returns the captured create-game args.
function submitWith(selectValue) {
  const antlion = makeFakeAntlion();
  const created = [];
  const modal = new dom.window.NewGameModal(
    antlion,
    () => 'Alice', // nickname present
    (type, requiredPlayers) => created.push({ type, requiredPlayers }),
    () => {},
  );
  modal.bind();

  if (selectValue != null) {
    const radio = dom.window.document.querySelector(
      `input[name="player-count"][value="${selectValue}"]`,
    );
    radio.checked = true;
  }

  antlion.handlers['new-game-submit']({ preventDefault() {} });
  return created;
}

// ---------------------------------------------------------------------------
// per FR-001 — player-count selector feeds requiredPlayers
// ---------------------------------------------------------------------------

describe('NewGameModal — player-count selector (FR-001)', () => {
  it('passes requiredPlayers=3 by default (3 radio checked)', () => {
    const created = submitWith(null);
    assert.equal(created.length, 1);
    assert.equal(created[0].requiredPlayers, 3);
  });

  it('passes requiredPlayers=4 when the 4-player radio is selected', () => {
    const created = submitWith('4');
    assert.equal(created.length, 1);
    assert.equal(created[0].requiredPlayers, 4);
  });

  it('falls back to 3 when no player-count radio is checked', () => {
    // unchecking all radios in the group
    dom.window.document
      .querySelectorAll('input[name="player-count"]')
      .forEach((r) => { r.checked = false; });
    const created = submitWith(null);
    assert.equal(created[0].requiredPlayers, 3);
  });
});
