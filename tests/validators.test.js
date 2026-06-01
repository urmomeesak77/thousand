'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateRequiredPlayers } = require('../src/controllers/validators');

describe('validateRequiredPlayers — accepts 3 or 4 (FR-002)', () => {
  it('accepts 3', () => { // per FR-002
    assert.equal(validateRequiredPlayers(3), null);
  });

  it('accepts 4', () => { // per FR-002
    assert.equal(validateRequiredPlayers(4), null);
  });

  it('accepts numeric strings "3" and "4"', () => { // per FR-002
    assert.equal(validateRequiredPlayers('3'), null);
    assert.equal(validateRequiredPlayers('4'), null);
  });

  it('rejects 2 with a 3-or-4 message', () => { // per FR-002
    const err = validateRequiredPlayers(2);
    assert.ok(err, 'should return an error string');
    assert.match(err, /3 or 4/);
  });

  it('rejects 5', () => { // per FR-002
    assert.ok(validateRequiredPlayers(5));
  });

  it('rejects non-numeric input', () => { // per FR-002
    assert.ok(validateRequiredPlayers('x'));
  });
});
