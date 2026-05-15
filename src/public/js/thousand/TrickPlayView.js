import MarriageDeclarationPrompt from './MarriageDeclarationPrompt.js';
import { MARRIAGE_BONUS } from './constants.js';

class TrickPlayView {
  constructor(el, { antlion, dispatcher, seats }) {
    this._el = el;
    this._antlion = antlion;
    this._dispatcher = dispatcher;
    this._seats = seats;
    this._snapshot = null;

    // Container for the marriage declaration prompt
    this._promptEl = document.createElement('div');
    this._promptEl.className = 'trick-play__marriage-prompt';
    this._promptEl.style.display = 'none';
    this._el.appendChild(this._promptEl);

    this._prompt = new MarriageDeclarationPrompt(this._promptEl, { antlion, dispatcher });

    this._antlion.bindInput(this._el, 'click', 'trick-play-card-click');
    this._antlion.onInput('trick-play-card-click', (e) => {
      const btn = e.target.closest('.trick-play__card');
      if (!btn || btn.classList.contains('card--disabled')) {return;}
      const cardId = parseInt(btn.dataset.cardId, 10);

      // T052: Check if a marriage can be offered for this card
      if (this._snapshot && this._canOfferMarriage(cardId)) {
        const card = this._snapshot.myHand.find((c) => c.id === cardId);
        const bonus = MARRIAGE_BONUS[card.suit] ?? 0;
        this._prompt.show(cardId, card.suit, bonus);
        return;
      }

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

  // Returns true when clicking this card should offer a marriage declaration.
  _canOfferMarriage(cardId) {
    const snap = this._snapshot;
    if (!snap.isMyTurn) { return false; }
    // Must be leading (currentTrick is empty)
    if (!snap.currentTrick || snap.currentTrick.length !== 0) { return false; }
    // Global canOffer gate (trick number, hand size)
    if (!MarriageDeclarationPrompt.canOffer(snap.myHand, snap.trickNumber)) { return false; }
    // Clicked card must be K or Q
    const card = snap.myHand.find((c) => c.id === cardId);
    if (!card) { return false; }
    if (card.rank !== 'K' && card.rank !== 'Q') { return false; }
    // Hand must hold both K and Q of this suit
    const hasK = snap.myHand.some((c) => c.rank === 'K' && c.suit === card.suit);
    const hasQ = snap.myHand.some((c) => c.rank === 'Q' && c.suit === card.suit);
    return hasK && hasQ;
  }

  render(snapshot) {
    this._snapshot = snapshot;

    // Preserve and reattach the prompt container so it survives innerHTML resets
    this._el.innerHTML = '';
    this._el.appendChild(this._promptEl);

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
