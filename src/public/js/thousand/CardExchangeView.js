class CardExchangeView {
  constructor(el, { antlion, dispatcher, seats, handView }) {
    this._el = el;
    this._antlion = antlion;
    this._dispatcher = dispatcher;
    this._seats = seats;
    this._handView = handView;
    this._selectedCardId = null;
    this._exchangePassesCommitted = 0;
    this._exchangePassesToSeats = [];
    this._isDeclarerView = false;

    this._handClickHandler = (e) => {
      if (!this._isDeclarerView) { return; }
      const cardEl = e.target.closest('[data-card-id]');
      if (!cardEl) { return; }
      this._onCardClick(parseInt(cardEl.dataset.cardId, 10));
    };
    this._antlion.onInput('hand-card-click', this._handClickHandler);

    this._antlion.bindInput(this._el, 'click', 'card-exchange-dest-click');
    this._antlion.onInput('card-exchange-dest-click', (e) => {
      const destBtn = e.target.closest('.card-exchange__dest-btn');
      if (!destBtn || this._selectedCardId === null) { return; }
      const toSeat = parseInt(destBtn.dataset.seat, 10);
      const direction = toSeat === this._seats.left ? 'left' : 'right';
      const cardId = this._selectedCardId;
      this._selectedCardId = null;
      this._handView.setSingleSelected(null);
      this._handView.markLeaving(cardId, direction);
      this._removeDestRow();
      this._dispatcher.sendExchangePass(cardId, toSeat);
    });
  }

  render(snapshot) {
    this._el.innerHTML = '';
    this._selectedCardId = null;
    this._handView.removeLeaving();
    this._handView.setSingleSelected(null);
    this._exchangePassesCommitted = snapshot.exchangePassesCommitted ?? 0;
    this._exchangePassesToSeats = snapshot.exchangePassesToSeats ?? [];
    this._isDeclarerView = !!snapshot.isDeclarerView;

    if (this._isDeclarerView) {
      this._handView.setInteractive(true);
    } else {
      this._handView.setInteractive(false);
      this._renderWaiting();
    }
  }

  _onCardClick(cardId) {
    this._selectedCardId = cardId;
    this._handView.setSingleSelected(cardId);
    this._renderDestButtons();
  }

  _removeDestRow() {
    const existing = this._el.querySelector('.card-exchange__dest-row');
    if (existing) { existing.remove(); }
  }

  _renderDestButtons() {
    this._removeDestRow();

    const { left, right } = this._seats;
    const used = new Set(this._exchangePassesToSeats);
    const remaining = [left, right].filter((s) => !used.has(s));

    if (remaining.length === 0) { return; }

    const row = document.createElement('div');
    row.className = 'card-exchange__dest-row';

    for (const seat of remaining) {
      const btn = document.createElement('button');
      btn.className = 'card-exchange__dest-btn';
      btn.dataset.seat = seat;
      const player = this._seats.players?.find(p => p.seat === seat);
      btn.textContent = player?.nickname ?? `Seat ${seat}`;
      row.appendChild(btn);
    }

    this._el.appendChild(row);
  }

  _renderWaiting() {
    const div = document.createElement('div');
    div.className = 'card-exchange__waiting';
    div.textContent = 'Waiting for the declarer to exchange cards…';
    this._el.appendChild(div);
  }

  destroy() {
    this._antlion.offInput('hand-card-click', this._handClickHandler);
    this._handView.removeLeaving();
    this._handView.setSingleSelected(null);
    this._handView.setInteractive(false);
  }
}

export default CardExchangeView;
