class MarriageDeclarationPrompt {
  static canOffer(hand, trickNumber) {
    if (trickNumber < 2 || trickNumber > 6) { return false; }
    if (hand.length < 3) { return false; }
    const suits = ['♥', '♦', '♣', '♠'];
    for (const suit of suits) {
      const hasK = hand.some((c) => c.rank === 'K' && c.suit === suit);
      const hasQ = hand.some((c) => c.rank === 'Q' && c.suit === suit);
      if (hasK && hasQ) { return true; }
    }
    return false;
  }

  constructor(el, { antlion, dispatcher }) {
    this._el = el;
    this._antlion = antlion;
    this._dispatcher = dispatcher;
    this._cardId = null;

    // Why: previously this handler was created anonymously, leaving every
    // round's prompt registered for the lifetime of the session. Subsequent
    // rounds' declare-clicks fired every old handler too — each replaying
    // sendPlayCard with the previous round's (or null) cardId, producing
    // bogus "Card not in hand" rejections from the server. Store the handler
    // so destroy() can offInput it.
    this._clickHandler = (e) => {
      const action = e.target.dataset.action;
      if (action === 'declare') {
        this._dispatcher.sendPlayCard(this._cardId, { declareMarriage: true });
        this.hide();
      } else if (action === 'play') {
        this._dispatcher.sendPlayCard(this._cardId);
        this.hide();
      } else if (action === 'cancel') {
        this.hide();
      }
    };
    antlion.bindInput(el, 'click', 'marriage-prompt-click');
    antlion.onInput('marriage-prompt-click', this._clickHandler);
  }

  destroy() {
    this._antlion.offInput('marriage-prompt-click', this._clickHandler);
  }

  show(cardId, suit, bonus) {
    this._cardId = cardId;
    this._el.replaceChildren();
    this._el.style.display = 'block';

    const info = document.createElement('div');
    info.textContent = 'Marriage ' + suit + ' (+' + bonus + ')';
    this._el.appendChild(info);

    const declareBtn = document.createElement('button');
    declareBtn.textContent = 'Declare and play';
    declareBtn.dataset.action = 'declare';
    this._el.appendChild(declareBtn);

    const playBtn = document.createElement('button');
    playBtn.textContent = 'Play without declaring';
    playBtn.dataset.action = 'play';
    this._el.appendChild(playBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.dataset.action = 'cancel';
    this._el.appendChild(cancelBtn);
  }

  hide() {
    this._el.replaceChildren();
    this._el.style.display = 'none';
  }
}

export default MarriageDeclarationPrompt;
