import MarriageDeclarationPrompt from './MarriageDeclarationPrompt.js';
import { MARRIAGE_BONUS } from './constants.js';

class TrickPlayView {
  constructor(el, { antlion, dispatcher, seats, handView, cardsById }) {
    this._el = el;
    this._antlion = antlion;
    this._dispatcher = dispatcher;
    this._seats = seats;
    this._handView = handView;
    this._cardsById = cardsById ?? {};
    this._gameStatus = null;

    this._promptEl = document.createElement('div');
    this._promptEl.className = 'trick-play__marriage-prompt';
    this._promptEl.style.display = 'none';
    this._el.appendChild(this._promptEl);

    this._prompt = new MarriageDeclarationPrompt(this._promptEl, { antlion, dispatcher });

    this._handClickHandler = (e) => {
      const cardEl = e.target.closest('[data-card-id]');
      if (!cardEl || cardEl.classList.contains('card--disabled')) { return; }
      const cardId = parseInt(cardEl.dataset.cardId, 10);

      if (this._canOfferMarriage(cardId)) {
        const card = this._cardsById[cardId];
        const bonus = MARRIAGE_BONUS[card.suit] ?? 0;
        this._prompt.show(cardId, card.suit, bonus);
        return;
      }

      cardEl.classList.add('hand-view__card--playing');
      this._antlion.schedule(250, () => {});
      this._dispatcher.sendPlayCard(cardId);
    };
    this._antlion.onInput('hand-card-click', this._handClickHandler);
  }

  _canOfferMarriage(cardId) {
    const gs = this._gameStatus;
    // Server rejects unless the viewer is leading an empty trick at trick 2+.
    if (!gs?.viewerIsLeading) { return false; }
    if (gs.trickNumber == null || gs.trickNumber < 2) { return false; }
    const card = this._cardsById[cardId];
    if (!card) { return false; }
    if (card.rank !== 'K' && card.rank !== 'Q') { return false; }
    const handIds = this._handView.getCardIds();
    const hand = handIds.map((id) => this._cardsById[id]).filter(Boolean);
    if (!MarriageDeclarationPrompt.canOffer(hand, gs.trickNumber)) { return false; }
    const hasK = hand.some((c) => c.rank === 'K' && c.suit === card.suit);
    const hasQ = hand.some((c) => c.rank === 'Q' && c.suit === card.suit);
    return hasK && hasQ;
  }

  render(gameStatus) {
    this._gameStatus = gameStatus;

    this._el.innerHTML = '';
    this._el.appendChild(this._promptEl);

    const { legalCardIds, viewerIsActive, collectedTrickCounts } = gameStatus;

    const legalSet = new Set(legalCardIds ?? []);
    const handIds = this._handView.getCardIds();
    const disabledIds = handIds.filter((id) => !viewerIsActive || !legalSet.has(id));
    this._handView.setDisabledIds(disabledIds);
    this._handView.setInteractive(true);

    this._renderCollectedBadges(collectedTrickCounts);
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

  destroy() {
    this._antlion.offInput('hand-card-click', this._handClickHandler);
    this._handView.setDisabledIds([]);
    this._handView.setInteractive(false);
  }
}

export default TrickPlayView;
