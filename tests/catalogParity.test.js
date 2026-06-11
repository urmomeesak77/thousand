'use strict';

// Guards SC-001: with Russian selected, every key the UI can ask for resolves
// to real Russian text — never the English fallback. Parity is checked
// mechanically so a key added to en.js without a ru.js twin fails CI.

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

// CLDR plural categories — the only keys a plural-object value may carry.
const CLDR_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];

let en;
let ru;

before(() => {
  const dom = new JSDOM('<html><body></body></html>', { runScripts: 'dangerously' });
  loadModule(dom, 'i18n/catalogs/en.js');
  loadModule(dom, 'i18n/catalogs/ru.js');
  en = dom.window.en;
  ru = dom.window.ru;
});

// Collect the {token} names used across a value (string or plural object).
function tokensOf(value) {
  const texts = typeof value === 'string' ? [value] : Object.values(value);
  const tokens = new Set();
  for (const text of texts) {
    for (const match of text.matchAll(/\{(\w+)\}/g)) {
      tokens.add(match[1]);
    }
  }
  return tokens;
}

function checkValue(catalogName, key, value) {
  if (typeof value === 'string') {
    assert.ok(value.length > 0, `${catalogName}['${key}'] is an empty string`);
    return;
  }
  assert.equal(typeof value, 'object', `${catalogName}['${key}'] must be a string or plural object`);
  const categories = Object.keys(value);
  assert.ok(categories.length > 0, `${catalogName}['${key}'] plural object is empty`);
  for (const category of categories) {
    assert.ok(
      CLDR_CATEGORIES.includes(category),
      `${catalogName}['${key}'] has non-CLDR plural category '${category}'`,
    );
    assert.equal(
      typeof value[category], 'string',
      `${catalogName}['${key}'].${category} must be a string`,
    );
    assert.ok(value[category].length > 0, `${catalogName}['${key}'].${category} is empty`);
  }
}

describe('catalog parity (SC-001)', () => {
  it('en.js is non-trivial and well-formed', () => {
    const keys = Object.keys(en);
    assert.ok(keys.length > 0, 'en catalog is empty');
    for (const key of keys) {
      checkValue('en', key, en[key]);
    }
  });

  it('every en key has a non-empty, well-formed ru entry', () => {
    const missing = Object.keys(en).filter((key) => !(key in ru));
    assert.deepEqual(missing, [], `ru.js is missing keys: ${missing.join(', ')}`);
    for (const key of Object.keys(en)) {
      checkValue('ru', key, ru[key]);
    }
  });

  it('ru has no orphan keys absent from en (en is the source of truth)', () => {
    const orphans = Object.keys(ru).filter((key) => !(key in en));
    assert.deepEqual(orphans, [], `ru.js has keys missing from en.js: ${orphans.join(', ')}`);
  });

  it('ru {token} sets are subsets of the en value tokens', () => {
    for (const key of Object.keys(en)) {
      if (!(key in ru)) { continue; }
      const enTokens = tokensOf(en[key]);
      for (const token of tokensOf(ru[key])) {
        assert.ok(
          enTokens.has(token),
          `ru['${key}'] uses {${token}} which en['${key}'] never provides`,
        );
      }
    }
  });
});
