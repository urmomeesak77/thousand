'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');
const { makeT } = require('./helpers/loadI18n');

let dom;

// Two triggers sharing .mute-btn — bind() must wire every one.
function buildDom(document) {
  document.body.innerHTML = `
    <button class="mute-btn" id="btn-a"></button>
    <button class="mute-btn" id="btn-b"></button>`;
}

// Captures named input handlers so the test can fire them synchronously
// (mirrors the RulesModal test harness).
function makeFakeAntlion() {
  const handlers = {};
  const bound = [];
  return {
    handlers,
    bound,
    bindInput(el, domEvent, type) { bound.push({ el, domEvent, type }); },
    onInput(type, fn) { handlers[type] = fn; },
  };
}

// Stub SoundManager: just enough surface for the button (state + a toggle counter).
function makeStubSound(initialMuted = false) {
  return {
    _muted: initialMuted,
    toggles: 0,
    isMuted() { return this._muted; },
    toggleMute() { this._muted = !this._muted; this.toggles += 1; return this._muted; },
  };
}

function setup(initialMuted = false) {
  const antlion = makeFakeAntlion();
  const sound = makeStubSound(initialMuted);
  const button = new dom.window.MuteButton(antlion, sound, makeT(dom));
  button.bind();
  return { antlion, sound, button };
}

function btn(id) {
  return dom.window.document.getElementById(id);
}

beforeEach(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  loadModule(dom, 'thousand/MuteButton.js');
  buildDom(dom.window.document);
});

describe('MuteButton', () => {
  it('clicking a .mute-btn toggles the SoundManager', () => {
    const { antlion, sound } = setup();
    antlion.handlers['sound-toggle-mute']();
    assert.equal(sound.toggles, 1);
  });

  it('binds every .mute-btn to the toggle input', () => {
    const { antlion } = setup();
    const muteBinds = antlion.bound.filter((b) => b.type === 'sound-toggle-mute');
    assert.equal(muteBinds.length, 2);
    assert.ok(muteBinds.every((b) => b.domEvent === 'click'));
  });

  it('reflects the unmuted initial state on bind', () => {
    setup(false);
    assert.equal(btn('btn-a').getAttribute('aria-pressed'), 'false');
  });

  it('reflects the muted initial state on bind', () => {
    setup(true);
    assert.equal(btn('btn-a').getAttribute('aria-pressed'), 'true');
    assert.equal(btn('btn-b').getAttribute('aria-pressed'), 'true');
  });

  it('updates aria-pressed and title on every .mute-btn after a toggle', () => {
    const { antlion } = setup(false);
    antlion.handlers['sound-toggle-mute']();
    for (const id of ['btn-a', 'btn-b']) {
      assert.equal(btn(id).getAttribute('aria-pressed'), 'true');
      assert.match(btn(id).getAttribute('title'), /unmute/i);
    }
  });

  it('restores the unmuted appearance when toggled back on', () => {
    const { antlion } = setup(true);
    antlion.handlers['sound-toggle-mute']();
    assert.equal(btn('btn-a').getAttribute('aria-pressed'), 'false');
    assert.match(btn('btn-a').getAttribute('title'), /mute/i);
  });
});
