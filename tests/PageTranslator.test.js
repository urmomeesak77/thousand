'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

let dom;

// Static-HTML fixture covering both contract attributes: data-i18n for
// textContent and data-i18n-attr for placeholder/title/aria-label
// (comma-separable), plus an element carrying both at once.
function buildDom(document) {
  document.body.innerHTML = `
    <h3 data-i18n="lobby.openGames">Open Games</h3>
    <input id="nick" data-i18n-attr="placeholder:nickname.placeholder" placeholder="e.g. Alice" />
    <button id="rules"
      data-i18n="lobby.rules"
      data-i18n-attr="title:lobby.rulesTitle,aria-label:lobby.rulesTitle"
      title="Game rules" aria-label="Game rules">Rules</button>
    <p id="plain">Untouched</p>`;
}

// Minimal i18n stub: per-language key maps, switchable mid-test.
function makeStubI18n() {
  const catalogs = {
    en: {
      'lobby.openGames': 'Open Games',
      'nickname.placeholder': 'e.g. Alice',
      'lobby.rules': 'Rules',
      'lobby.rulesTitle': 'Game rules',
    },
    ru: {
      'lobby.openGames': 'Открытые игры',
      'nickname.placeholder': 'например, Алиса',
      'lobby.rules': 'Правила',
      'lobby.rulesTitle': 'Правила игры',
    },
  };
  return {
    language: 'en',
    t(key) { return catalogs[this.language][key] ?? key; },
  };
}

// Captures onInput subscriptions and lets the test fire engine events.
function makeFakeAntlion() {
  const handlers = {};
  return {
    handlers,
    onInput(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    bindInput() {},
    emit(type, data) { (handlers[type] || []).forEach((fn) => fn(data)); },
  };
}

function setup() {
  const antlion = makeFakeAntlion();
  const i18n = makeStubI18n();
  const translator = new dom.window.PageTranslator(antlion, i18n);
  translator.bind();
  return { antlion, i18n, translator };
}

function el(id) {
  return dom.window.document.getElementById(id);
}

beforeEach(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  loadModule(dom, 'i18n/PageTranslator.js');
  buildDom(dom.window.document);
});

describe('PageTranslator', () => {
  it('applies data-i18n textContent at boot', () => {
    setup();
    const h3 = dom.window.document.querySelector('[data-i18n="lobby.openGames"]');
    assert.equal(h3.textContent, 'Open Games');
  });

  it('applies data-i18n-attr placeholder at boot', () => {
    setup();
    assert.equal(el('nick').getAttribute('placeholder'), 'e.g. Alice');
  });

  it('applies multiple attributes from one comma-separated data-i18n-attr', () => {
    setup();
    assert.equal(el('rules').getAttribute('title'), 'Game rules');
    assert.equal(el('rules').getAttribute('aria-label'), 'Game rules');
  });

  it('leaves elements without data-i18n untouched', () => {
    setup();
    assert.equal(el('plain').textContent, 'Untouched');
  });

  it('re-applies every data-i18n text on language:changed', () => {
    const { antlion, i18n } = setup();
    i18n.language = 'ru';
    antlion.emit('language:changed', { language: 'ru' });
    const h3 = dom.window.document.querySelector('[data-i18n="lobby.openGames"]');
    assert.equal(h3.textContent, 'Открытые игры');
    assert.equal(el('rules').textContent, 'Правила');
  });

  it('re-applies every data-i18n-attr attribute on language:changed', () => {
    const { antlion, i18n } = setup();
    i18n.language = 'ru';
    antlion.emit('language:changed', { language: 'ru' });
    assert.equal(el('nick').getAttribute('placeholder'), 'например, Алиса');
    assert.equal(el('rules').getAttribute('title'), 'Правила игры');
    assert.equal(el('rules').getAttribute('aria-label'), 'Правила игры');
  });

  it('translates back when the language returns to en', () => {
    const { antlion, i18n } = setup();
    i18n.language = 'ru';
    antlion.emit('language:changed', { language: 'ru' });
    i18n.language = 'en';
    antlion.emit('language:changed', { language: 'en' });
    assert.equal(el('nick').getAttribute('placeholder'), 'e.g. Alice');
    assert.equal(el('rules').textContent, 'Rules');
  });
});
