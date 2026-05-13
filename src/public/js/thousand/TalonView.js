// ============================================================
// TalonView — central talon area: zero-to-three face-up cards
// ============================================================

const SUIT_COLOR = { '♥': 'red', '♦': 'red', '♣': 'black', '♠': 'black' };

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
      el.className = 'card-sprite card-sprite--up';
      const label = document.createElement('span');
      label.className = 'card-sprite__label';
      label.style.color = SUIT_COLOR[card.suit] === 'red'
        ? 'var(--card-color-red)' : 'var(--card-color-black)';
      label.textContent = `${card.rank}${card.suit}`;
      el.appendChild(label);
      this._container.appendChild(el);
    }
  }

  // Used at the moment the declarer absorbs the talon
  clear() {
    this.setCards([]);
  }
}

export default TalonView;
