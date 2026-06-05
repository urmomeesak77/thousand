'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');

let dom;
let fmt;

const seats = {
  self: 0,
  players: [
    { seat: 0, nickname: 'Ada' },
    { seat: 1, nickname: 'Bot-Eve' },
    { seat: 2, nickname: 'Cara' },
  ],
};

beforeEach(() => {
  dom = new JSDOM('<html><body></body></html>', { runScripts: 'dangerously' });
  loadModule(dom, 'thousand/cardSymbols.js');
  loadModule(dom, 'thousand/historyEntryText.js');
  fmt = (entry) => dom.window.historyEntryText(entry, seats);
});

describe('historyEntryText', () => {
  it('formats a bid', () => {
    assert.equal(fmt({ kind: 'bid', seat: 0, data: { amount: 110 } }), 'Ada bid 110');
  });

  it('formats a pass', () => {
    assert.equal(fmt({ kind: 'pass', seat: 1, data: {} }), 'Bot-Eve passed');
  });

  it('formats a marriage with the suit symbol', () => {
    assert.equal(
      fmt({ kind: 'marriage', seat: 0, data: { suit: '♥', bonus: 100 } }),
      'Ada declared ♥ marriage (+100)',
    );
  });

  it('formats a trick win', () => {
    assert.equal(fmt({ kind: 'trick', seat: 2, data: { trickNumber: 3 } }), 'Trick 3 won by Cara');
  });

  it('formats a round score with signed per-seat deltas in seat order', () => {
    const entry = {
      kind: 'round-score', seat: null,
      data: { perSeat: { 0: 120, 1: -60, 2: 0 }, declarerSeat: 0, bid: 110 },
      roundNumber: 4,
    };
    assert.equal(fmt(entry), 'Round 4: Ada +120, Bot-Eve -60, Cara 0');
  });

  it('formats the four-nines bonus', () => {
    assert.equal(
      fmt({ kind: 'four-nines', seat: 0, data: { amount: 100 } }),
      'Ada — four nines bonus +100',
    );
  });

  it('formats the barrel penalty', () => {
    assert.equal(
      fmt({ kind: 'barrel', seat: 2, data: { amount: -120 } }),
      'Cara — barrel penalty -120',
    );
  });

  it('formats the three-zeros penalty', () => {
    assert.equal(
      fmt({ kind: 'zeros', seat: 1, data: { amount: -120 } }),
      'Bot-Eve — three zeros penalty -120',
    );
  });

  it('falls back to a stable seat label when the nickname is unknown (FR-016)', () => {
    const sparseSeats = { self: 0, players: [{ seat: 0, nickname: null }] };
    const text = dom.window.historyEntryText({ kind: 'bid', seat: 1, data: { amount: 100 } }, sparseSeats);
    assert.equal(text, 'Seat 1 bid 100');
  });

  it('uses the seat fallback inside a round-score line too', () => {
    const text = dom.window.historyEntryText(
      { kind: 'round-score', seat: null, data: { perSeat: { 0: 60, 1: 0 }, declarerSeat: 0, bid: 100 }, roundNumber: 2 },
      { self: 0, players: [{ seat: 0, nickname: 'Ada' }] },
    );
    assert.equal(text, 'Round 2: Ada +60, Seat 1 0');
  });
});
