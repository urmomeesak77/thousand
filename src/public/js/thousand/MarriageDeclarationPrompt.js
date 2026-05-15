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

  constructor(el, options) {
    this._el = el;
    this._dispatcher = options.dispatcher;
    const NodeObject = Object.getPrototypeOf(options).constructor;
    this._makeOpts = function (props) {
      const o = new NodeObject();
      for (const k in props) { o[k] = props[k]; }
      return o;
    };
  }

  show(cardId, suit, bonus) {
    this._el.innerHTML = '';
    this._el.style.display = 'block';

    const info = document.createElement('div');
    info.textContent = 'Marriage ' + suit + ' (+' + bonus + ')';
    this._el.appendChild(info);

    const makeOpts = this._makeOpts;
    const dispatcher = this._dispatcher;
    const self = this;

    const declareBtn = document.createElement('button');
    declareBtn.textContent = 'Declare and play';
    declareBtn.addEventListener('click', function () {
      dispatcher.sendPlayCard(cardId, makeOpts({ declareMarriage: true }));
      self.hide();
    });
    this._el.appendChild(declareBtn);

    const playBtn = document.createElement('button');
    playBtn.textContent = 'Play without declaring';
    playBtn.addEventListener('click', function () {
      dispatcher.sendPlayCard(cardId);
      self.hide();
    });
    this._el.appendChild(playBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function () {
      self.hide();
    });
    this._el.appendChild(cancelBtn);
  }

  hide() {
    this._el.innerHTML = '';
    this._el.style.display = 'none';
  }
}

export default MarriageDeclarationPrompt;
