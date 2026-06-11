'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

// Synthetic catalogs primed onto window before I18n.js loads (loadModule turns
// its catalog imports into window reads), so fallback paths can be exercised
// deliberately: 'only.english' is missing from ru, 'no.key' from both.
const EN = {
  'greet.hello': 'Hello, {name}!',
  'greet.partial': 'Hi {name} and {missing}',
  'only.english': 'English only',
  'stats.tricks': { one: '{count} trick', other: '{count} tricks' },
  'stats.otherOnly': { other: '{count} pcs' },
};

const RU = {
  'greet.hello': 'Привет, {name}!',
  'stats.tricks': { one: '{count} взятка', few: '{count} взятки', many: '{count} взяток' },
  'stats.otherOnly': { other: '{count} шт.' },
};

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

function makeI18n({ stored = null, langs = ['en-US'] } = {}) {
  const setCalls = [];
  const emitted = [];
  const i18n = new dom.window.I18n({
    antlion: { emit: (type, data) => emitted.push({ type, data }) },
    preferenceStore: { get: () => stored, set: (id) => setCalls.push(id) },
    navigatorLanguages: langs,
  });
  return { i18n, setCalls, emitted };
}

describe('I18n', () => {
  describe('language resolution at construction (FR-007/FR-008)', () => {
    it('uses the stored preference over the browser language', () => {
      const { i18n } = makeI18n({ stored: 'ru', langs: ['en-US'] });
      assert.equal(i18n.language, 'ru');
    });

    it('detects ru from the first browser language primary subtag', () => {
      const { i18n } = makeI18n({ langs: ['ru-RU', 'en-US'] });
      assert.equal(i18n.language, 'ru');
    });

    it('defaults to en for any non-ru browser language', () => {
      const { i18n } = makeI18n({ langs: ['de-DE', 'ru-RU'] });
      assert.equal(i18n.language, 'en');
    });

    it('defaults to en when browser languages are unavailable', () => {
      const { i18n } = makeI18n({ langs: undefined });
      assert.equal(i18n.language, 'en');
    });
  });

  describe('t(): lookup and interpolation', () => {
    it('resolves a key from the active catalog with {param} interpolation', () => {
      const { i18n } = makeI18n({ stored: 'en' });
      assert.equal(i18n.t('greet.hello', { name: 'Bob' }), 'Hello, Bob!');
    });

    it('resolves from the Russian catalog when ru is active', () => {
      const { i18n } = makeI18n({ stored: 'ru' });
      assert.equal(i18n.t('greet.hello', { name: 'Боб' }), 'Привет, Боб!');
    });

    it('leaves unknown {tokens} literal instead of crashing', () => {
      const { i18n } = makeI18n({ stored: 'en' });
      assert.equal(i18n.t('greet.partial', { name: 'X' }), 'Hi X and {missing}');
    });
  });

  describe('t(): fallback chain (FR-009)', () => {
    it('falls back to the English catalog when the active catalog misses a key', () => {
      const { i18n } = makeI18n({ stored: 'ru' });
      assert.equal(i18n.t('only.english'), 'English only');
    });

    it('falls back to params.fallback when no catalog has the key', () => {
      const { i18n } = makeI18n({ stored: 'ru' });
      assert.equal(i18n.t('no.key', { fallback: 'Fallback text' }), 'Fallback text');
    });

    it('returns the key itself as a last resort — never an empty string', () => {
      const { i18n } = makeI18n({ stored: 'en' });
      assert.equal(i18n.t('no.key'), 'no.key');
    });
  });

  describe('t(): plural selection (FR-010)', () => {
    it('selects en categories one/other by count', () => {
      const { i18n } = makeI18n({ stored: 'en' });
      assert.equal(i18n.t('stats.tricks', { count: 1 }), '1 trick');
      assert.equal(i18n.t('stats.tricks', { count: 5 }), '5 tricks');
    });

    it('selects ru categories one/few/many across 1/2/5/11/21', () => {
      const { i18n } = makeI18n({ stored: 'ru' });
      assert.equal(i18n.t('stats.tricks', { count: 1 }), '1 взятка');
      assert.equal(i18n.t('stats.tricks', { count: 2 }), '2 взятки');
      assert.equal(i18n.t('stats.tricks', { count: 5 }), '5 взяток');
      assert.equal(i18n.t('stats.tricks', { count: 11 }), '11 взяток');
      assert.equal(i18n.t('stats.tricks', { count: 21 }), '21 взятка');
    });

    it('falls back within a plural value when the selected category is missing', () => {
      const { i18n } = makeI18n({ stored: 'ru' });
      // count 5 selects 'many', which the value lacks — 'other' steps in.
      assert.equal(i18n.t('stats.otherOnly', { count: 5 }), '5 шт.');
    });
  });

  describe('setLanguage()', () => {
    it('persists the choice and emits language:changed exactly once', () => {
      const { i18n, setCalls, emitted } = makeI18n({ stored: 'en' });
      i18n.setLanguage('ru');
      assert.equal(i18n.language, 'ru');
      assert.deepEqual(setCalls, ['ru']);
      // JSON round-trip: payloads are built inside the jsdom realm, whose
      // Object.prototype differs, so a direct deepEqual always fails.
      assert.deepEqual(
        JSON.parse(JSON.stringify(emitted)),
        [{ type: 'language:changed', data: { language: 'ru' } }],
      );
    });

    it('switches what t() resolves', () => {
      const { i18n } = makeI18n({ stored: 'en' });
      i18n.setLanguage('ru');
      assert.equal(i18n.t('greet.hello', { name: 'Боб' }), 'Привет, Боб!');
      assert.equal(i18n.t('stats.tricks', { count: 2 }), '2 взятки');
    });

    it('does not emit again for an idempotent call with the current language', () => {
      const { i18n, emitted } = makeI18n({ stored: 'en' });
      i18n.setLanguage('ru');
      i18n.setLanguage('ru');
      assert.equal(emitted.length, 1);
    });

    it('ignores unsupported language ids', () => {
      const { i18n, setCalls, emitted } = makeI18n({ stored: 'en' });
      i18n.setLanguage('de');
      assert.equal(i18n.language, 'en');
      assert.equal(setCalls.length, 0);
      assert.equal(emitted.length, 0);
    });
  });

  describe('SUPPORTED_LANGUAGES', () => {
    it('lists en and ru with their self-names (FR-014)', () => {
      // JSON round-trip — see the cross-realm note in the setLanguage suite.
      assert.deepEqual(JSON.parse(JSON.stringify(dom.window.I18n.SUPPORTED_LANGUAGES)), [
        { id: 'en', selfName: 'English' },
        { id: 'ru', selfName: 'Русский' },
      ]);
    });
  });
});
