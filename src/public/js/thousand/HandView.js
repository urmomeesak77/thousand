// ============================================================
// HandView — viewer's own face-up hand, sorted per FR-005
// ============================================================

// Suit order: ♣(100) → ♠(80) → ♥(60) → ♦(40), descending by marriage value
const SUIT_ORDER = { '♣': 0, '♠': 1, '♥': 2, '♦': 3 };
const RANK_ORDER = { '9': 0, '10': 1, 'J': 2, 'Q': 3, 'K': 4, 'A': 5 };
const SUIT_COLOR = { '♥': 'red', '♦': 'red', '♣': 'black', '♠': 'black' };

class HandView {
  constructor(container) {
    this._container = container;
    this._container.className = 'hand-view';
    this._cards = [];
    this._selectionEnabled = false;
  }

  // cards: array of { id, rank, suit }; re-sorts and rebuilds the row
  setHand(cards) {
    this._cards = [...cards].sort((a, b) => {
      const sd = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
      return sd !== 0 ? sd : RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
    });
    this._render();
  }

  // Selection logic added in US3 (T068)
  setSelectionMode(enabled) {
    this._selectionEnabled = enabled;
  }

  _render() {
    this._container.textContent = '';
    for (const card of this._cards) {
      const el = document.createElement('div');
      el.className = 'hand-view__card card-sprite card-sprite--up';
      el.dataset.cardId = card.id;
      const label = document.createElement('span');
      label.className = 'card-sprite__label';
      label.style.color =
        SUIT_COLOR[card.suit] === 'red'
          ? 'var(--card-color-red)'
          : 'var(--card-color-black)';
      label.textContent = `${card.rank}${card.suit}`;
      el.appendChild(label);
      this._container.appendChild(el);
    }
  }
}

export default HandView;
