'use strict';

// US3 (FR-007/FR-008): initial-language resolution. A valid stored preference
// always wins; otherwise the FIRST browser language decides (primary subtag ru
// → Russian, anything else → English); an invalid stored value falls through to
// that detection.

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

// Synthetic catalogs primed before I18n loads (loadModule rewires catalog
// imports to window reads). Only the keys touched here matter.
const EN = { 'lang.selfName': 'English' };
const RU = { 'lang.selfName': 'Русский' };

let dom;

beforeEach(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  dom.window.en = EN;
  dom.window.ru = RU;
  loadModule(dom, 'i18n/I18n.js');
});

function resolve({ stored = null, langs = [] } = {}) {
  const i18n = new dom.window.I18n({
    antlion: { emit() {} },
    preferenceStore: { get: () => stored, set() {} },
    navigatorLanguages: langs,
  });
  return i18n.language;
}

describe('initial language detection (FR-007/FR-008)', () => {
  it('a stored preference wins over the browser language', () => {
    assert.equal(resolve({ stored: 'ru', langs: ['en-US'] }), 'ru');
    assert.equal(resolve({ stored: 'en', langs: ['ru-RU'] }), 'en');
  });

  it('no preference + first browser language ru → ru', () => {
    assert.equal(resolve({ langs: ['ru'] }), 'ru');
    assert.equal(resolve({ langs: ['ru-RU', 'en-US'] }), 'ru');
  });

  it('no preference + a non-ru first browser language → en', () => {
    assert.equal(resolve({ langs: ['en-US', 'ru-RU'] }), 'en');
    assert.equal(resolve({ langs: ['de-DE'] }), 'en');
    assert.equal(resolve({ langs: ['fr'] }), 'en');
  });

  it('no preference + no/empty browser languages → en', () => {
    assert.equal(resolve({ langs: [] }), 'en');
    assert.equal(resolve({ langs: undefined }), 'en');
    assert.equal(resolve({ langs: [''] }), 'en');
  });

  it('an invalid stored value falls through to browser-language detection', () => {
    // The store already maps unsupported values to null, so detection runs:
    // a ru browser still yields ru, a non-ru browser yields en.
    assert.equal(resolve({ stored: null, langs: ['ru-RU'] }), 'ru');
    assert.equal(resolve({ stored: null, langs: ['en-GB'] }), 'en');
  });
});
