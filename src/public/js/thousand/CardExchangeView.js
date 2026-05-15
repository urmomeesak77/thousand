// ============================================================
// CardExchangeView — card-exchange phase UI (FR-002, FR-020)
// ============================================================

import CardSprite from './CardSprite.js';

class CardExchangeView {
  constructor(el, { antlion, dispatcher, seats }) {
    this._el = el;
    this._antlion = antlion;
    this._dispatcher = dispatcher;
    this._seats = seats; // { self, left, right, declarerSeat }
    this._selectedCardId = null;
  }

  render(snapshot) {
    this._el.innerHTML = '';
    this._selectedCardId = null;

    if (snapshot.isDeclarerView) {
      this._renderDeclarer(snapshot);
    } else {
      this._renderWaiting(snapshot);
    }
  }

  _renderDeclarer(snapshot) {
    const { myHand, exchangePassesCommitted } = snapshot;

    const handEl = document.createElement('div');
    handEl.className = 'card-exchange__hand';

    for (const card of myHand) {
      const btn = document.createElement('button');
      btn.className = 'card-exchange__card';
      btn.dataset.cardId = card.id;
      btn.textContent = `${card.rank}${card.suit}`;
      btn.addEventListener('click', () => this._onCardClick(card.id, exchangePassesCommitted));
      handEl.appendChild(btn);
    }

    this._el.appendChild(handEl);
  }

  _onCardClick(cardId, exchangePassesCommitted) {
    this._selectedCardId = cardId;
    this._renderDestButtons(exchangePassesCommitted);
  }

  _renderDestButtons(exchangePassesCommitted) {
    // Remove any existing dest buttons
    const existing = this._el.querySelector('.card-exchange__dest-row');
    if (existing) {
      existing.remove();
    }

    const { self, left, right } = this._seats;
    // Destination seats = all non-self seats
    const allDests = [left, right];

    // After first pass (exchangePassesCommitted >= 1), only 1 seat remains
    // The used seat is determined by which seat was already passed to.
    // We show seats that haven't been used yet: total - committed = remaining
    // committed=0 → show both; committed=1 → show 1; committed=2 → show 0
    const remaining = allDests.slice(exchangePassesCommitted);

    if (remaining.length === 0) {
      return;
    }

    const row = document.createElement('div');
    row.className = 'card-exchange__dest-row';

    for (const seat of remaining) {
      const btn = document.createElement('button');
      btn.className = 'card-exchange__dest-btn';
      btn.dataset.seat = seat;
      btn.textContent = `Seat ${seat}`;
      btn.addEventListener('click', () => {
        this._dispatcher.sendExchangePass(this._selectedCardId, seat);
      });
      row.appendChild(btn);
    }

    this._el.appendChild(row);
  }

  _renderWaiting(snapshot) {
    const div = document.createElement('div');
    div.className = 'card-exchange__waiting';
    // Find declarer nickname from seats
    const declarerSeat = this._seats.declarerSeat;
    // Try to find nickname — seats may be an array or plain object
    let declarerNickname = `seat ${declarerSeat}`;
    if (Array.isArray(this._seats)) {
      const found = this._seats.find(s => s.seat === declarerSeat);
      if (found) {
        declarerNickname = found.nickname;
      }
    }
    div.textContent = `Waiting for ${declarerNickname} to exchange cards…`;
    this._el.appendChild(div);
  }

  destroy() {}
}

export default CardExchangeView;
