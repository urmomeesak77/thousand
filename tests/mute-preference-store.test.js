'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

let dom;

// A storage stand-in whose access always throws — simulates Safari private mode
// / storage-access-denied, where even reading localStorage raises.
function makeThrowingStorage() {
  return {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('SecurityError'); },
  };
}

beforeEach(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  loadModule(dom, 'storage/MutePreferenceStore.js');
});

describe('MutePreferenceStore', () => {
  it('returns false when the preference key is absent (first-time default)', () => {
    const store = new dom.window.MutePreferenceStore();
    assert.equal(store.get(), false);
  });

  it('round-trips set(true) through get()', () => {
    const store = new dom.window.MutePreferenceStore();
    store.set(true);
    assert.equal(store.get(), true);
  });

  it('round-trips set(false) through get()', () => {
    const store = new dom.window.MutePreferenceStore();
    store.set(true);
    store.set(false);
    assert.equal(store.get(), false);
  });

  it('swallows a throwing localStorage and falls back to false', () => {
    const store = new dom.window.MutePreferenceStore(makeThrowingStorage());
    assert.doesNotThrow(() => store.set(true));
    assert.equal(store.get(), false);
  });
});
