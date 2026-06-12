'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

let dom;

// Two triggers sharing .lang-btn (lobby header + scoreboard icon row) —
// bind() must wire and reflect every one, like MuteButton.
function buildDom(document) {
  document.body.innerHTML = `
    <button class="lang-btn" id="btn-a"></button>
    <button class="lang-btn" id="btn-b"></button>`;
}

// Mini engine bus: bindInput records bindings, emit drives onInput handlers
// so the button's language:changed re-render runs synchronously.
function makeFakeAntlion() {
  const handlers = {};
  const bound = [];
  const emitted = [];
  return {
    handlers,
    bound,
    emitted,
    bindInput(el, domEvent, type) { bound.push({ el, domEvent, type }); },
    onInput(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    emit(type, data) {
      emitted.push({ type, data });
      (handlers[type] || []).forEach((fn) => fn(data));
    },
    fire(type, data) { (handlers[type] || []).forEach((fn) => fn(data)); },
  };
}

function setup({ stored = 'en' } = {}) {
  const antlion = makeFakeAntlion();
  const setCalls = [];
  const i18n = new dom.window.I18n({
    antlion,
    preferenceStore: { get: () => stored, set: (id) => setCalls.push(id) },
    navigatorLanguages: ['en-US'],
  });
  const button = new dom.window.LanguageButton(antlion, i18n);
  button.bind();
  return { antlion, i18n, button, setCalls };
}

function btn(id) {
  return dom.window.document.getElementById(id);
}

beforeEach(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  // Prime the catalogs I18n.js imports (loadModule rewires them to window.*).
  dom.window.en = {
    'lang.selfName': 'English',
    'lang.toggleTitle': 'Switch language to {name}',
    'lang.toggleAriaLabel': 'Switch language to {name}',
  };
  dom.window.ru = {
    'lang.selfName': 'Русский',
    'lang.toggleTitle': 'Переключить язык на {name}',
    'lang.toggleAriaLabel': 'Переключить язык на {name}',
  };
  loadModule(dom, 'i18n/I18n.js');
  loadModule(dom, 'i18n/LanguageButton.js');
  buildDom(dom.window.document);
});

describe('LanguageButton', () => {
  it('binds every .lang-btn to the language-toggle input', () => {
    const { antlion } = setup();
    const binds = antlion.bound.filter((b) => b.type === 'language-toggle');
    assert.equal(binds.length, 2);
    assert.ok(binds.every((b) => b.domEvent === 'click'));
  });

  it('a click toggles en → ru via i18n.setLanguage', () => {
    const { antlion, i18n } = setup({ stored: 'en' });
    antlion.fire('language-toggle');
    assert.equal(i18n.language, 'ru');
  });

  it('a click toggles ru → en', () => {
    const { antlion, i18n } = setup({ stored: 'ru' });
    antlion.fire('language-toggle');
    assert.equal(i18n.language, 'en');
  });

  it('the toggle persists the choice in the preference store', () => {
    const { antlion, setCalls } = setup({ stored: 'en' });
    antlion.fire('language-toggle');
    assert.deepEqual(setCalls, ['ru']);
  });

  it('the toggle emits language:changed', () => {
    const { antlion } = setup({ stored: 'en' });
    antlion.fire('language-toggle');
    const changes = antlion.emitted.filter((e) => e.type === 'language:changed');
    assert.equal(changes.length, 1);
    assert.equal(changes[0].data.language, 'ru');
  });

  it('shows the TARGET language flag/title/aria-label at bind', () => {
    setup({ stored: 'en' });
    for (const id of ['btn-a', 'btn-b']) {
      const img = btn(id).querySelector('img');
      assert.equal(img.getAttribute('src'), 'gfx/ru.gif');
      assert.match(btn(id).title, /Русский/);
      assert.match(btn(id).getAttribute('aria-label'), /Русский/);
    }
  });

  it('reflects the new target language on every button after a toggle', () => {
    const { antlion } = setup({ stored: 'en' });
    antlion.fire('language-toggle');
    for (const id of ['btn-a', 'btn-b']) {
      const img = btn(id).querySelector('img');
      assert.equal(img.getAttribute('src'), 'gfx/en.gif');
      assert.match(btn(id).title, /English/);
      assert.match(btn(id).getAttribute('aria-label'), /English/);
    }
  });
});
