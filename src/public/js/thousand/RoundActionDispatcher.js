// ============================================================
// RoundActionDispatcher — outbound wrapper for in-round client→server messages
// ============================================================

class RoundActionDispatcher {
  constructor(socket) {
    this._socket = socket;
  }

  sendBid(amount) {
    this._socket.send({ type: 'bid', amount });
  }

  sendPass() {
    this._socket.send({ type: 'pass' });
  }

  sendSellStart() {
    this._socket.send({ type: 'sell_start' });
  }

  sendSellSelect(cardIds) {
    this._socket.send({ type: 'sell_select', cardIds });
  }

  sendSellCancel() {
    this._socket.send({ type: 'sell_cancel' });
  }

  sendSellBid(amount) {
    this._socket.send({ type: 'sell_bid', amount });
  }

  sendSellPass() {
    this._socket.send({ type: 'sell_pass' });
  }

  sendStartGame() {
    this._socket.send({ type: 'start_game' });
  }

  sendExchangePass(cardId, toSeat) {
    this._socket.send({ type: 'exchange_pass', cardId, toSeat });
  }

  sendPlayCard(cardId, opts = {}) {
    // Guard against stray callers that lost their cardId (e.g. a stale
    // marriage-prompt handler whose original prompt was never destroyed).
    if (typeof cardId !== 'number' || !Number.isFinite(cardId)) { return; }
    const msg = { type: 'play_card', cardId };
    if (opts.declareMarriage === true) {
      msg.declareMarriage = true;
    }
    this._socket.send(msg);
  }

  sendContinueToNextRound() {
    this._socket.send({ type: 'continue_to_next_round' });
  }

  sendRequestSnapshot() {
    this._socket.send({ type: 'request_snapshot' });
  }
}

export default RoundActionDispatcher;
