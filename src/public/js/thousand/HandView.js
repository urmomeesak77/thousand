// ============================================================
// HandView — viewer's own face-up hand, sorted per FR-005
// ============================================================

import { SUIT_LETTER } from './cardSymbols.js';

// Suit order: ♣(100) → ♠(80) → ♥(60) → ♦(40), descending by marriage value
const SUIT_ORDER = { '♣': 0, '♠': 1, '♥': 2, '♦': 3 };
const RANK_ORDER = { '9': 0, '10': 1, 'J': 2, 'Q': 3, 'K': 4, 'A': 5 };

class HandView {
  constructor(container, antlion = null) {
    this._container = container;
    this._antlion = antlion;
    this._container.className = 'hand-view';
    this._cards = [];
    this._isSelectionEnabled = false;
    this._selectedIds = [];
    this._disabledIds = [];
    this._singleSelectedId = null;
    this._leavingIds = new Set();
    this._arrivingId = null;

    if (this._antlion) {
      this._antlion.bindInput(this._container, 'click', 'hand-card-click');
      this._antlion.onInput('hand-card-click', (e) => {
        if (!this._isSelectionEnabled) {return;}
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
    this._leavingIds.clear();
    this._cards = [...cards].sort((a, b) => {
      const sd = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
      return sd !== 0 ? sd : RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
    });
    const validIds = new Set(this._cards.map(c => c.id));
    this._selectedIds = this._selectedIds.filter(id => validIds.has(id));
    this._render();
    if (this._isSelectionEnabled && this._antlion) {
      this._antlion.emit('selectionchanged', [...this._selectedIds]);
    }
  }

  // Inserts a card into the hand at the correct sorted position and re-renders.
  // The new card is briefly highlighted via the `--arriving` class so the recipient
  // sees which card was just received.
  addCard(card) {
    if (this._cards.some((c) => c.id === card.id)) { return; }
    this._cards.push(card);
    this._cards.sort((a, b) => {
      const sd = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
      return sd !== 0 ? sd : RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
    });
    this._arrivingId = card.id;
    this._render();
    if (this._antlion) {
      this._antlion.schedule(400, () => {
        if (this._arrivingId === card.id) {
          this._arrivingId = null;
          const el = this._container.querySelector(`[data-card-id="${card.id}"]`);
          if (el) { el.classList.remove('hand-view__card--arriving'); }
        }
      });
    }
  }

  // Enables tap-to-toggle selection on cards; emits 'selectionchanged' via Antlion.
  // Disabling clears all selections and emits an empty event.
  setSelectionMode(isEnabled) {
    this._isSelectionEnabled = isEnabled;
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

  getCardIds() {
    return this._cards.map((c) => c.id);
  }

  // Marks cards as disabled (greyed-out, unplayable) and re-renders.
  setDisabledIds(ids) {
    this._disabledIds = ids;
    this._render();
  }

  // Highlights a single card independently of multi-select mode; null clears.
  setSingleSelected(id) {
    this._singleSelectedId = id;
    this._render();
  }

  // Removes a single card by id from the hand and re-renders (e.g. own card was just played).
  removeCard(cardId) {
    const idx = this._cards.findIndex((c) => c.id === cardId);
    if (idx === -1) { return; }
    this._cards.splice(idx, 1);
    this._leavingIds.delete(cardId);
    this._render();
  }

  // Marks a card as leaving: adds it to the persistent leaving set and applies the CSS class.
  // direction: 'left' or 'right' — controls the X translation of the leave animation. Defaults
  // to 'right' so existing callers (e.g. trick play) keep their current behavior.
  markLeaving(cardId, direction = 'right') {
    this._leavingIds.add(cardId);
    const el = this._container.querySelector(`[data-card-id="${cardId}"]`);
    if (el) {
      el.classList.add('hand-view__card--leaving');
      el.classList.add(direction === 'left' ? 'hand-view__card--leaving-left' : 'hand-view__card--leaving-right');
    }
  }

  // Removes all leaving-marked cards from the hand and re-renders (called on confirmed pass).
  removeLeaving() {
    if (this._leavingIds.size === 0) { return; }
    this._cards = this._cards.filter(c => !this._leavingIds.has(c.id));
    this._leavingIds.clear();
    this._render();
  }

  // Clears the leaving-marked state without removing cards — reverts the optimistic
  // fade applied before server confirmation when the action is rejected.
  clearLeavingMarks() {
    if (this._leavingIds.size === 0) { return; }
    this._leavingIds.clear();
    this._render();
  }

  // Toggles pointer cursor for interactive phases (trick play, card exchange).
  setInteractive(isInteractive) {
    this._container.classList.toggle('hand-view--interactive', isInteractive);
  }

  _render() {
    this._container.textContent = '';
    for (const card of this._cards) {
      const el = document.createElement('div');
      el.className = `hand-view__card card-sprite card-sprite--up card--${card.rank}${SUIT_LETTER[card.suit]}`;
      if (this._selectedIds.includes(card.id) || this._singleSelectedId === card.id) {
        el.classList.add('hand-view__card--selected');
      }
      if (this._leavingIds.has(card.id)) {
        el.classList.add('hand-view__card--leaving');
      }
      if (this._arrivingId === card.id) {
        el.classList.add('hand-view__card--arriving');
      }
      if (this._disabledIds.includes(card.id)) {
        el.classList.add('card--disabled');
      }
      el.dataset.cardId = card.id;
      this._container.appendChild(el);
    }
  }
}

export default HandView;
