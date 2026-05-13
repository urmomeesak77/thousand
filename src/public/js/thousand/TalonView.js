// ============================================================
// TalonView — central talon area: zero-to-three face-up cards
// ============================================================

const SUIT_LETTER = { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' };

class TalonView {
  constructor(container) {
    this._container = container;
    this._container.className = 'talon-view';
  }

  // cards: array of { id, rank, suit }; replaces current display
  setCards(cards) {
    this._container.textContent = '';
    for (const card of cards) {
      const el = document.createElement('div');
      el.className = `card-sprite card-sprite--up card--${card.rank}${SUIT_LETTER[card.suit]}`;
      this._container.appendChild(el);
    }
  }

  setFaceDownCount(count) {
    this._container.textContent = '';
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'card-sprite card-sprite--back';
      this._container.appendChild(el);
    }
  }

  // Used at the moment the declarer absorbs the talon
  clear() {
    this.setCards([]);
  }
}

export default TalonView;
