// ============================================================
// TalonView — central talon area: zero-to-three face-up CardSprites
// ============================================================

import CardSprite from './CardSprite.js';

const CARD_OFFSET_X = 20;

class TalonView {
  constructor(container) {
    this._container = container;
    this._container.className = 'talon-view';
    this._sprites = [];
  }

  // cards: array of { id, rank, suit }; replaces current sprites
  setCards(cards) {
    this._sprites.forEach(s => s.element.remove());
    this._sprites = cards.map((card, i) => {
      const sprite = new CardSprite(card.id);
      sprite.setIdentity({ rank: card.rank, suit: card.suit });
      sprite.setFace('up');
      sprite.setPosition(i * CARD_OFFSET_X, 0);
      this._container.appendChild(sprite.element);
      return sprite;
    });
  }

  // Used at the moment the declarer absorbs the talon
  clear() {
    this.setCards([]);
  }

  // Exposes sprites so animators can move them to their destination
  get sprites() {
    return this._sprites;
  }
}

export default TalonView;
