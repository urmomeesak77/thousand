'use strict';

// US3 (FR-007): the language choice persists per-browser under thousand_lang.
// Mirrors the proven MutePreferenceStore contract: best-effort localStorage,
// any non-supported / unreadable value reads as null (→ default logic).

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

let dom;

// Storage stand-in whose access always throws (Safari private mode).
function makeThrowingStorage() {
  return {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('SecurityError'); },
  };
}

// In-memory storage stand-in so a test can seed an arbitrary stored value.
function makeMemoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(k) { return k in data ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    _data: data,
  };
}

beforeEach(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  loadModule(dom, 'i18n/LanguagePreferenceStore.js');
});

function makeStore(storage) {
  return new dom.window.LanguagePreferenceStore(storage);
}

describe('LanguagePreferenceStore', () => {
  it('returns null when no preference is stored (first-time default)', () => {
    assert.equal(makeStore(makeMemoryStorage()).get(), null);
  });

  it('round-trips "en" through set()/get()', () => {
    const store = makeStore(makeMemoryStorage());
    store.set('en');
    assert.equal(store.get(), 'en');
  });

  it('round-trips "ru" through set()/get()', () => {
    const store = makeStore(makeMemoryStorage());
    store.set('ru');
    assert.equal(store.get(), 'ru');
  });

  it('writes under the thousand_lang key', () => {
    const storage = makeMemoryStorage();
    makeStore(storage).set('ru');
    assert.equal(storage._data.thousand_lang, 'ru');
  });

  it('reads an unsupported stored value as null (→ default logic)', () => {
    assert.equal(makeStore(makeMemoryStorage({ thousand_lang: 'de' })).get(), null);
    assert.equal(makeStore(makeMemoryStorage({ thousand_lang: '' })).get(), null);
    assert.equal(makeStore(makeMemoryStorage({ thousand_lang: 'EN' })).get(), null);
  });

  it('swallows a throwing localStorage and reads as null', () => {
    const store = makeStore(makeThrowingStorage());
    assert.doesNotThrow(() => store.set('ru'));
    assert.equal(store.get(), null);
  });
});
