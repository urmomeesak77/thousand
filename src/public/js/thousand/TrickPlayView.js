// ============================================================
// TrickPlayView — trick-play phase UI (FR-007, FR-008)
// ============================================================

class TrickPlayView {
  constructor(el, { antlion, dispatcher, seats }) {
    this._el = el;
    this._antlion = antlion;
    this._dispatcher = dispatcher;
    this._seats = seats; // { self, left, right } or array
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
      } else {
        btn.addEventListener('click', () => {
          this._dispatcher.sendPlayCard(card.id);
        });
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
