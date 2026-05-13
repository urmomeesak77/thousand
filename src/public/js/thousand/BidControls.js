// ============================================================
// BidControls — bid input + ±5 steppers + Bid + Pass per FR-028
// ============================================================

class BidControls {
  constructor(container, antlion, dispatcher) {
    this._antlion = antlion;
    this._dispatcher = dispatcher;
    this._smallestLegalBid = 100;
    this._state = 'hidden'; // 'operable' | 'disabled' | 'hidden'

    this._el = document.createElement('div');
    this._el.className = 'bid-controls hidden';
    container.appendChild(this._el);

    this._decreaseBtn = this._btn('−5', 'bid-controls__step');
    this._input = document.createElement('input');
    this._input.type = 'number';
    this._input.className = 'bid-controls__input';
    this._input.value = '100';
    this._increaseBtn = this._btn('+5', 'bid-controls__step');
    this._bidBtn = this._btn('Bid', 'bid-controls__bid btn');
    this._passBtn = this._btn('Pass', 'bid-controls__pass btn btn--secondary');

    this._el.append(
      this._decreaseBtn, this._input, this._increaseBtn,
      this._bidBtn, this._passBtn,
    );
    this._bindEvents();
  }

  // Called whenever the server pushes a new currentHighBid (number | null).
  // Resets the input to the new smallestLegalBid and refreshes button states.
  setCurrentHighBid(currentHighBid) {
    this._smallestLegalBid = currentHighBid === null ? 100 : currentHighBid + 5;
    const capReached = this._smallestLegalBid > 300;
    this._input.value = capReached ? '300' : String(this._smallestLegalBid);
    this._applyState();
  }

  // Chooses between operable (active bidder), disabled (eligible-but-waiting),
  // and hidden (passed — locked out for the rest of bidding) per FR-026.
  setActiveState({ isActiveBidder, isEligible }) {
    this._state = !isEligible ? 'hidden' : !isActiveBidder ? 'disabled' : 'operable';
    this._applyState();
  }

  _applyState() {
    if (this._state === 'hidden') {
      this._el.classList.add('hidden');
      return;
    }
    this._el.classList.remove('hidden');

    if (this._state === 'disabled') {
      [this._decreaseBtn, this._increaseBtn, this._bidBtn, this._passBtn, this._input].forEach(
        (el) => { el.disabled = true; }
      );
      return;
    }

    // operable — fine-grained per FR-028 and Edge Cases U1
    const capReached = this._smallestLegalBid > 300;
    this._input.disabled = capReached;
    this._decreaseBtn.disabled = capReached;
    this._increaseBtn.disabled = capReached;
    this._passBtn.disabled = false;
    this._bidBtn.disabled = capReached || !this._isBidValid();
  }

  _isBidValid() {
    const val = parseInt(this._input.value, 10);
    return (
      !isNaN(val) &&
      val % 5 === 0 &&
      val >= this._smallestLegalBid &&
      val <= 300
    );
  }

  _bindEvents() {
    this._antlion.bindInput(this._decreaseBtn, 'click', 'bid-decrease-click');
    this._antlion.onInput('bid-decrease-click', () => {
      if (this._state !== 'operable') {return;}
      const cur = parseInt(this._input.value, 10);
      const base = isNaN(cur) ? this._smallestLegalBid : cur;
      this._input.value = String(Math.max(this._smallestLegalBid, base - 5));
      this._applyState();
    });

    this._antlion.bindInput(this._increaseBtn, 'click', 'bid-increase-click');
    this._antlion.onInput('bid-increase-click', () => {
      if (this._state !== 'operable') {return;}
      const cur = parseInt(this._input.value, 10);
      const base = isNaN(cur) ? this._smallestLegalBid : cur;
      this._input.value = String(Math.min(300, base + 5));
      this._applyState();
    });

    this._antlion.bindInput(this._input, 'input', 'bid-input-change');
    this._antlion.onInput('bid-input-change', () => {
      if (this._state !== 'operable') {return;}
      this._applyState();
    });

    this._antlion.bindInput(this._bidBtn, 'click', 'bid-submit-click');
    this._antlion.onInput('bid-submit-click', () => {
      if (this._state !== 'operable' || !this._isBidValid()) {return;}
      this._dispatcher.sendBid(parseInt(this._input.value, 10));
    });

    this._antlion.bindInput(this._passBtn, 'click', 'bid-pass-click');
    this._antlion.onInput('bid-pass-click', () => {
      // Pass is operable for the active bidder; disabled state prevents the click.
      if (this._state === 'hidden') {return;}
      this._dispatcher.sendPass();
    });
  }

  _btn(text, className) {
    const b = document.createElement('button');
    b.className = className;
    b.textContent = text;
    return b;
  }
}

export default BidControls;
