'use strict';

// Session-scoped, ordered, uncapped log of game events (feature 012). Owned by
// the per-game Game session; one instance per game. Entries are append-only and
// shipped read-only inside the snapshot view-model as `actionHistory`.
class GameHistory {
  constructor() {
    this._entries = [];
    this._seq = 0;
  }

  // Single append point: stamps the next monotonic seq and stores the entry.
  _append(kind, seat, roundNumber, data) {
    this._entries.push({ seq: this._seq, kind, roundNumber, seat, data });
    this._seq += 1;
  }

  recordBid(seat, amount, roundNumber) {
    this._append('bid', seat, roundNumber, { amount });
  }

  recordPass(seat, roundNumber) {
    this._append('pass', seat, roundNumber, {});
  }

  // Sell phase (feature 012 follow-up): the declarer exposes the contract, each
  // opponent bids to buy or passes, and the auction resolves sold/returned.
  recordSellStart(seat, roundNumber) {
    this._append('sell-start', seat, roundNumber, {});
  }

  recordSellBid(seat, amount, roundNumber) {
    this._append('sell-bid', seat, roundNumber, { amount });
  }

  recordSellPass(seat, roundNumber) {
    this._append('sell-pass', seat, roundNumber, {});
  }

  recordSellSold(buyerSeat, amount, roundNumber) {
    this._append('sell-sold', buyerSeat, roundNumber, { amount });
  }

  recordSellReturned(declarerSeat, roundNumber) {
    this._append('sell-returned', declarerSeat, roundNumber, {});
  }

  recordMarriage(seat, suit, bonus, roundNumber) {
    this._append('marriage', seat, roundNumber, { suit, bonus });
  }

  recordTrick(winnerSeat, trickNumber, roundNumber) {
    this._append('trick', winnerSeat, roundNumber, { trickNumber });
  }

  recordRoundScore(roundNumber, perSeat, declarerSeat, bid) {
    this._append('round-score', null, roundNumber, { perSeat: { ...perSeat }, declarerSeat, bid });
  }

  // kind ∈ {four-nines, barrel, zeros}
  recordSpecial(kind, seat, amount, roundNumber) {
    this._append(kind, seat, roundNumber, { amount });
  }

  // Shallow-cloned array for the snapshot; callers cannot mutate the log.
  toView() {
    return this._entries.map((e) => ({ ...e }));
  }
}

module.exports = GameHistory;
