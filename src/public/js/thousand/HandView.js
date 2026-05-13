// ============================================================
// HandView — viewer's own face-up hand, sorted per FR-005
// ============================================================

// Suit order: ♣(100) → ♠(80) → ♥(60) → ♦(40), descending by marriage value
const SUIT_ORDER = { '♣': 0, '♠': 1, '♥': 2, '♦': 3 };
const RANK_ORDER = { '9': 0, '10': 1, 'J': 2, 'Q': 3, 'K': 4, 'A': 5 };
const SUIT_LETTER = { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' };

class HandView {
  constructor(container, antlion = null) {
    this._container = container;
    this._antlion = antlion;
    this._container.className = 'hand-view';
    this._cards = [];
    this._selectionEnabled = false;
    this._selectedIds = [];

    if (this._antlion) {
      this._antlion.bindInput(this._container, 'click', 'hand-card-click');
      this._antlion.onInput('hand-card-click', (e) => {
        if (!this._selectionEnabled) {return;}
        const cardEl = e.target.closest('[data-card-id]');
        if (!cardEl) {return;}
        const id = parseInt(cardEl.dataset.cardId, 10);
        const idx = this._selectedIds.indexOf(id);
        if (idx === -1) {
          this._selectedIds.push(id);
          cardEl.classList.add('hand-view__card--selected');
        } else {
          this._selectedIds.splice(idx, 1);
          cardEl.classList.remove('hand-view__card--selected');
        }
        this._antlion.emit('selectionchanged', [...this._selectedIds]);
      });
    }
  }

  // cards: array of { id, rank, suit }; re-sorts and rebuilds the row
  setHand(cards) {
    this._cards = [...cards].sort((a, b) => {
      const sd = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
      return sd !== 0 ? sd : RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
    });
    const validIds = new Set(this._cards.map(c => c.id));
    this._selectedIds = this._selectedIds.filter(id => validIds.has(id));
    this._render();
    if (this._selectionEnabled && this._antlion) {
      this._antlion.emit('selectionchanged', [...this._selectedIds]);
    }
  }

  // Enables tap-to-toggle selection on cards; emits 'selectionchanged' via Antlion.
  // Disabling clears all selections and emits an empty event.
  setSelectionMode(isEnabled) {
    this._selectionEnabled = isEnabled;
    this._container.classList.toggle('hand-view--selectable', isEnabled);
    if (!isEnabled) {
      this._selectedIds = [];
      this._container.querySelectorAll('.hand-view__card--selected')
        .forEach(el => el.classList.remove('hand-view__card--selected'));
      if (this._antlion) {
        this._antlion.emit('selectionchanged', []);
      }
    }
  }

  getSelected() {
    return [...this._selectedIds];
  }

  _render() {
    this._container.textContent = '';
    for (const card of this._cards) {
      const el = document.createElement('div');
      el.className = `hand-view__card card-sprite card-sprite--up card--${card.rank}${SUIT_LETTER[card.suit]}`;
      if (this._selectedIds.includes(card.id)) {
        el.classList.add('hand-view__card--selected');
      }
      el.dataset.cardId = card.id;
      this._container.appendChild(el);
    }
  }
}

export default HandView;
