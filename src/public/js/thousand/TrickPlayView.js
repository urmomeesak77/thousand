class TrickPlayView {
  constructor(el, { antlion, dispatcher, seats }) {
    this._el = el;
    this._antlion = antlion;
    this._dispatcher = dispatcher;
    this._seats = seats;

    this._antlion.bindInput(this._el, 'click', 'trick-play-card-click');
    this._antlion.onInput('trick-play-card-click', (e) => {
      const btn = e.target.closest('.trick-play__card');
      if (!btn || btn.classList.contains('card--disabled')) {return;}
      const cardId = parseInt(btn.dataset.cardId, 10);
      // Trigger CSS hand→centre animation; 250ms matches the CSS transition
      // duration so the card reaches the centre slot before the server's
      // play-card acknowledgment causes a re-render.
      btn.classList.add('trick-play__card--playing');
      this._antlion.schedule(250, () => {
        // No-op: render(snapshot) from the server response handles removal.
      });
      this._dispatcher.sendPlayCard(cardId);
    });
  }

  render(snapshot) {
    this._el.innerHTML = '';

    const { myHand, legalCardIds, isMyTurn, collectedTrickCounts } = snapshot;

    this._renderHand(myHand, legalCardIds, isMyTurn);
    this._renderCollectedBadges(collectedTrickCounts);
  }

  _renderHand(myHand, legalCardIds, isMyTurn) {
    const legalSet = new Set(legalCardIds);
    const handEl = document.createElement('div');
    handEl.className = 'trick-play__hand';

    for (const card of myHand) {
      const btn = document.createElement('button');
      btn.className = 'trick-play__card card';
      btn.dataset.cardId = card.id;
      btn.textContent = `${card.rank}${card.suit}`;

      const disabled = !isMyTurn || !legalSet.has(card.id);
      if (disabled) {
        btn.classList.add('card--disabled');
      }

      handEl.appendChild(btn);
    }

    this._el.appendChild(handEl);
  }

  _renderCollectedBadges(collectedTrickCounts) {
    const stackEl = document.createElement('div');
    stackEl.className = 'trick-play__collected';

    for (const [seatStr, count] of Object.entries(collectedTrickCounts)) {
      const seat = Number(seatStr);
      const item = document.createElement('div');
      item.className = 'collected-tricks__item';
      item.dataset.seat = seat;

      const badge = document.createElement('span');
      badge.className = 'collected-tricks__badge';
      badge.textContent = `× ${count}`;

      item.appendChild(badge);
      stackEl.appendChild(item);
    }

    this._el.appendChild(stackEl);
  }

  destroy() {}
}

export default TrickPlayView;
