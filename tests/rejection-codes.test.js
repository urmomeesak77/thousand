'use strict';

// Contract: ws-rejection-codes.md — every user-triggerable rejection the
// server emits carries a stable catalog code; the reject.* key set of
// catalogs/en.js IS the code registry. The English reason prose is unchanged
// (it stays the FR-009 fallback and keeps logs/tests readable).

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');
const Round = require('../src/services/Round');

const SRC = path.join(__dirname, '..', 'src');

// Files whose `{ rejected: true, ... }` returns must all carry a code.
const REJECTION_ORIGIN_FILES = [
  'services/Round.js',
  'services/TrickPlay.js',
  'controllers/RoundActionHandler.js',
];

// All server files that may mention a reject.* code.
const CODE_BEARING_FILES = [
  'services/Round.js',
  'services/TrickPlay.js',
  'services/ThousandStore.js',
  'services/ConnectionLifecycle.js',
  'controllers/RoundActionHandler.js',
  'controllers/TrickPlayActionHandler.js',
  'controllers/GameController.js',
];

let en;

before(() => {
  const dom = new JSDOM('<html><body></body></html>', { runScripts: 'dangerously' });
  loadModule(dom, 'i18n/catalogs/en.js');
  en = dom.window.en;
});

function read(rel) {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

// Extract each `{ rejected: true, ... }` object literal, brace-balanced so
// nested `params: { ... }` doesn't truncate the span.
function extractRejectionObjects(src) {
  const objects = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf('rejected: true', from);
    if (at === -1) { break; }
    const open = src.lastIndexOf('{', at);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') { depth += 1; }
      if (src[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          objects.push(src.slice(open, i + 1));
          break;
        }
      }
    }
    from = at + 1;
  }
  return objects;
}

function allEmittedCodes() {
  const codes = new Set();
  for (const rel of CODE_BEARING_FILES) {
    for (const match of read(rel).matchAll(/'(reject\.[A-Za-z0-9]+)'/g)) {
      codes.add(match[1]);
    }
  }
  return codes;
}

function makeRound() {
  const pids = ['p0', 'p1', 'p2'];
  const game = { players: new Set(pids) };
  const store = {
    players: new Map([
      ['p0', { nickname: 'Dealer' }],
      ['p1', { nickname: 'P1' }],
      ['p2', { nickname: 'P2' }],
    ]),
  };
  const round = new Round({ game, store });
  round.start();
  round.advanceFromDealingToBidding();
  return round;
}

describe('rejection codes (contracts/ws-rejection-codes.md)', () => {
  it('every rejection return in the origin files carries a code', () => {
    for (const rel of REJECTION_ORIGIN_FILES) {
      const missing = extractRejectionObjects(read(rel))
        .filter((obj) => !/code:\s*'reject\./.test(obj));
      assert.deepEqual(
        missing, [],
        `${rel} has rejection returns without a code:\n${missing.join('\n')}`,
      );
    }
  });

  it('every server-emitted reject.* code exists in the English catalog', () => {
    const codes = allEmittedCodes();
    assert.ok(codes.size > 0, 'no reject.* codes found in server sources');
    const missing = [...codes].filter((code) => !(code in en));
    assert.deepEqual(missing, [], `codes missing from catalogs/en.js: ${missing.join(', ')}`);
  });

  it('the round_aborted and game_join_failed codes are registered', () => {
    assert.ok('reject.playerGraceExpired' in en, 'reject.playerGraceExpired missing from en.js');
    assert.ok('reject.gameInProgress' in en, 'reject.gameInProgress missing from en.js');
  });

  describe('representative rejections: code + primitive params, prose unchanged', () => {
    it('out-of-turn bid keeps its English reason and gains reject.notYourTurn', () => {
      const r = makeRound().submitBid(2, 100);
      assert.equal(r.rejected, true);
      assert.equal(r.reason, 'Not your turn');
      assert.equal(r.code, 'reject.notYourTurn');
    });

    it('below-minimum bid carries the floor as a numeric param', () => {
      const r = makeRound().submitBid(1, 95);
      assert.equal(r.rejected, true);
      assert.equal(r.reason, 'Bid must be at least 100');
      assert.equal(r.code, 'reject.bidBelowMin');
      assert.deepEqual(r.params, { min: 100 });
    });

    it('non-multiple bid carries the step as a numeric param', () => {
      const r = makeRound().submitBid(1, 107);
      assert.equal(r.rejected, true);
      assert.equal(r.reason, 'Bid must be a multiple of 5');
      assert.equal(r.code, 'reject.bidNotMultiple');
      assert.deepEqual(r.params, { step: 5 });
    });

    it('above-maximum bid carries the cap as a numeric param', () => {
      const r = makeRound().submitBid(1, 305);
      assert.equal(r.rejected, true);
      assert.equal(r.reason, 'Bid cannot exceed 300');
      assert.equal(r.code, 'reject.bidAboveMax');
      assert.deepEqual(r.params, { max: 300 });
    });

    it('params, when present, hold primitives only', () => {
      const rejections = [
        makeRound().submitBid(1, 95),
        makeRound().submitBid(1, 107),
        makeRound().submitBid(1, 305),
      ];
      for (const r of rejections) {
        for (const [name, value] of Object.entries(r.params)) {
          assert.ok(
            ['string', 'number', 'boolean'].includes(typeof value),
            `param ${name} is non-primitive (${typeof value})`,
          );
        }
      }
    });
  });
});
