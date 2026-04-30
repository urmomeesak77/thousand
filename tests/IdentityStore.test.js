'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');

let strippedSrc;

before(() => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'public', 'js', 'storage', 'IdentityStore.js'),
    'utf8'
  );
  strippedSrc = src
    .replace(/^export class (\w+)/gm, (_, name) => `class ${name}`)
    + '\nwindow.IdentityStore = IdentityStore;';
});

function makeStore() {
  const dom = new JSDOM('<html></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost:3000',
  });
  dom.window.eval(strippedSrc);
  return { IS: dom.window.IdentityStore, ls: dom.window.localStorage };
}

// IS.load() returns objects from the jsdom realm — deepStrictEqual checks prototype
// equality across realms. Serialize via JSON to get plain Node.js objects.
function plain(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('IdentityStore', () => {
  it('save() writes correct JSON to localStorage', () => {
    const { IS, ls } = makeStore();
    IS.save('pid1', 'tok1');
    assert.deepEqual(JSON.parse(ls.getItem('thousand_identity')), {
      playerId: 'pid1',
      sessionToken: 'tok1',
    });
  });

  it('load() returns parsed object after save()', () => {
    const { IS } = makeStore();
    IS.save('pid2', 'tok2');
    assert.deepEqual(plain(IS.load()), { playerId: 'pid2', sessionToken: 'tok2' });
  });

  it('load() returns {} on missing key', () => {
    const { IS } = makeStore();
    assert.deepEqual(plain(IS.load()), {});
  });

  it('load() returns {} on corrupted JSON', () => {
    const { IS, ls } = makeStore();
    ls.setItem('thousand_identity', 'not-valid-json{{{');
    assert.deepEqual(plain(IS.load()), {});
  });

  it('clear() removes the key', () => {
    const { IS, ls } = makeStore();
    IS.save('pid3', 'tok3');
    IS.clear();
    assert.equal(ls.getItem('thousand_identity'), null);
  });

  it('save() overwrites previous value', () => {
    const { IS } = makeStore();
    IS.save('pid4', 'tok4');
    IS.save('pid5', 'tok5');
    assert.deepEqual(plain(IS.load()), { playerId: 'pid5', sessionToken: 'tok5' });
  });

  it('save() swallows QuotaExceededError and returns false', () => {
    const { IS, ls } = makeStore();
    // Storage methods live on the prototype; assigning ls.setItem doesn't shadow them
    // in jsdom. Patch the prototype directly.
    const proto = Object.getPrototypeOf(ls);
    const original = proto.setItem;
    proto.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
      let result;
      assert.doesNotThrow(() => { result = IS.save('pidQ', 'tokQ'); });
      assert.equal(result, false);
    } finally {
      proto.setItem = original;
    }
  });

  it('save() returns true on success', () => {
    const { IS } = makeStore();
    assert.equal(IS.save('pidT', 'tokT'), true);
  });
});
