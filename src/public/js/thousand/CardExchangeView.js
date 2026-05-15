class CardExchangeView {
  constructor(el, { antlion, dispatcher, seats }) {
    this._el = el;
    this._antlion = antlion;
    this._dispatcher = dispatcher;
    this._seats = seats; // { self, left, right, declarerSeat }
    this._selectedCardId = null;
    this._exchangePassesCommitted = 0;

    this._antlion.bindInput(this._el, 'click', 'card-exchange-click');
    this._antlion.onInput('card-exchange-click', (e) => {
      const cardBtn = e.target.closest('.card-exchange__card');
      if (cardBtn) {
        this._onCardClick(parseInt(cardBtn.dataset.cardId, 10));
        return;
      }
      const destBtn = e.target.closest('.card-exchange__dest-btn');
      if (destBtn) {
        this._animateCardLeaving();
        this._dispatcher.sendExchangePass(this._selectedCardId, parseInt(destBtn.dataset.seat, 10));
      }
    });
  }

  render(snapshot) {
    this._el.innerHTML = '';
    this._selectedCardId = null;
    this._exchangePassesCommitted = snapshot.exchangePassesCommitted;

    if (snapshot.isDeclarerView) {
      this._renderDeclarer(snapshot);
    } else {
      this._renderWaiting(snapshot);
    }
  }

  _renderDeclarer(snapshot) {
    const { myHand } = snapshot;

    const handEl = document.createElement('div');
    handEl.className = 'card-exchange__hand';

    for (const card of myHand) {
      const btn = document.createElement('button');
      btn.className = 'card-exchange__card';
      btn.dataset.cardId = card.id;
      btn.textContent = `${card.rank}${card.suit}`;
      handEl.appendChild(btn);
    }

    this._el.appendChild(handEl);
  }

  _onCardClick(cardId) {
    this._selectedCardId = cardId;
    this._renderDestButtons(this._exchangePassesCommitted);
  }

  _renderDestButtons(exchangePassesCommitted) {
    const existing = this._el.querySelector('.card-exchange__dest-row');
    if (existing) {
      existing.remove();
    }

    const { left, right } = this._seats;
    const allDests = [left, right];
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
      row.appendChild(btn);
    }

    this._el.appendChild(row);
  }

  _renderWaiting(snapshot) {
    const div = document.createElement('div');
    div.className = 'card-exchange__waiting';
    div.textContent = 'Waiting for the declarer to exchange cards…';
    this._el.appendChild(div);
  }

  _animateCardLeaving() {
    if (this._selectedCardId === null) { return; }
    const cardBtn = this._el.querySelector(
      `.card-exchange__card[data-card-id="${this._selectedCardId}"]`
    );
    if (!cardBtn) { return; }
    // Trigger CSS exit animation; server re-render removes the card once the
    // pass is acknowledged (~round-trip), giving the 250ms CSS transition time
    // to complete before the card disappears.
    cardBtn.classList.add('card-exchange__card--leaving');
    this._antlion.schedule(250, () => {
      // No-op: render(snapshot) from the server response handles removal.
      // The schedule keeps the animation window open even if the snapshot
      // arrives before the 250ms elapses.
    });
  }

  destroy() {}
}

export default CardExchangeView;
