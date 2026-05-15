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

  sendPlayCard(cardId) {
    this._socket.send({ type: 'play_card', cardId });
  }
}

export default RoundActionDispatcher;
