// ============================================================
// TrumpBox — color-coded trump-suit display above the status box
// ============================================================

const RED_SUITS = new Set(['♥', '♦']);

class TrumpBox {
  constructor(container) {
    this._el = document.createElement('div');
    this._el.className = 'trump-box hidden';

    const labelEl = document.createElement('span');
    labelEl.className = 'trump-box__label';
    labelEl.textContent = 'Trump';

    this._suitEl = document.createElement('span');
    this._suitEl.className = 'trump-box__suit';

    this._el.append(labelEl, this._suitEl);
    container.appendChild(this._el);
  }

  // currentTrumpSuit: a suit symbol (♣ ♠ ♥ ♦) or null/undefined.
  // visible: whether the box should be shown for the current round phase.
  render(currentTrumpSuit, visible) {
    this._el.classList.toggle('hidden', !visible);

    let variant = 'none';
    let text = 'No trump';
    if (currentTrumpSuit) {
      text = currentTrumpSuit;
      variant = RED_SUITS.has(currentTrumpSuit) ? 'red' : 'black';
    }

    this._suitEl.textContent = text;
    this._suitEl.classList.toggle('trump-box__suit--red', variant === 'red');
    this._suitEl.classList.toggle('trump-box__suit--black', variant === 'black');
    this._suitEl.classList.toggle('trump-box__suit--none', variant === 'none');
  }
}

export default TrumpBox;
