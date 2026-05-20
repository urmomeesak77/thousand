// ============================================================
// BiddingControls — shared bid input + ±step + Bid + Pass controls
//                   used by both the bidding phase (BidControls) and
//                   the sell-bidding phase (SellBidControls)
// ============================================================

import HtmlUtil from '../utils/HtmlUtil.js';
import { MAX_BID, BID_STEP, BARREL_BID_FLOOR } from './constants.js';

class BiddingControls {
  constructor(container, antlion, config) {
    this._antlion = antlion;
    this._config = config;
    this._smallestLegalBid = config.defaultBid;
    this._barrelFloor = 0;
    this._state = 'hidden';

    this._el = document.createElement('div');
    this._el.className = `${config.containerClass} hidden`;
    container.appendChild(this._el);

    this._decreaseBtn = HtmlUtil.button(`−${BID_STEP}`, 'bid-controls__step');
    this._input = document.createElement('input');
    this._input.type = 'number';
    this._input.className = 'bid-controls__input';
    this._input.value = String(config.defaultBid);
    this._increaseBtn = HtmlUtil.button(`+${BID_STEP}`, 'bid-controls__step');
    this._bidBtn = HtmlUtil.button('Bid', 'bid-controls__bid btn');
    this._passBtn = HtmlUtil.button('Pass', 'bid-controls__pass btn btn--secondary');

    this._el.append(
      this._decreaseBtn, this._input, this._increaseBtn,
      this._bidBtn, this._passBtn,
    );
    this._bindEvents();
  }

  // currentHighBid may be null only in the initial bidding phase (no bids yet);
  // sell-bidding always has a bid already on the table.
  setCurrentHighBid(currentHighBid) {
    this._smallestLegalBid = currentHighBid === null
      ? this._config.defaultBid
      : currentHighBid + BID_STEP;
    const floor = this._effectiveFloor();
    const isCapReached = floor > MAX_BID;
    this._input.value = isCapReached ? String(MAX_BID) : String(floor);
    this._applyState();
  }

  // Per FR-026:
  //   isEligible=false → hidden  (passed seat or wrong role)
  //   isActive=false   → disabled (eligible but not their turn)
  //   isActive=true    → operable
  setActive(isActive, isEligible) {
    if (!isEligible) {
      this._state = 'hidden';
    } else if (!isActive) {
      this._state = 'disabled';
    } else {
      this._state = 'operable';
    }
    this._applyState();
  }

  // Per FR-022: barrel players cannot bid below BARREL_BID_FLOOR.
  setOnBarrel(isOnBarrel) {
    this._barrelFloor = isOnBarrel ? BARREL_BID_FLOOR : 0;
    const floor = this._effectiveFloor();
    const cur = parseInt(this._input.value, 10);
    if (isNaN(cur) || cur < floor) {
      this._input.value = String(floor);
    }
    this._applyState();
  }

  _effectiveFloor() {
    return Math.max(this._smallestLegalBid, this._barrelFloor);
  }

  _applyState() {
    if (this._state === 'hidden') {
      this._el.classList.add('hidden');
      return;
    }
    this._el.classList.remove('hidden');

    if (this._state === 'disabled') {
      for (const el of [this._decreaseBtn, this._increaseBtn, this._bidBtn, this._passBtn, this._input]) {
        el.disabled = true;
      }
      return;
    }

    const isCapReached = this._effectiveFloor() > MAX_BID;
    this._input.disabled = isCapReached;
    this._decreaseBtn.disabled = isCapReached;
    this._increaseBtn.disabled = isCapReached;
    this._passBtn.disabled = false;
    this._bidBtn.disabled = isCapReached || !this._isBidValid();
  }

  _isBidValid() {
    const val = parseInt(this._input.value, 10);
    return (
      !isNaN(val) &&
      val % BID_STEP === 0 &&
      val >= this._effectiveFloor() &&
      val <= MAX_BID
    );
  }

  _bindEvents() {
    const prefix = this._config.eventPrefix;

    this._antlion.bindInput(this._decreaseBtn, 'click', `${prefix}-decrease-click`);
    this._antlion.onInput(`${prefix}-decrease-click`, () => this._stepInput(-BID_STEP));

    this._antlion.bindInput(this._increaseBtn, 'click', `${prefix}-increase-click`);
    this._antlion.onInput(`${prefix}-increase-click`, () => this._stepInput(BID_STEP));

    this._antlion.bindInput(this._input, 'input', `${prefix}-input-change`);
    this._antlion.onInput(`${prefix}-input-change`, () => {
      if (this._state !== 'operable') {
        return;
      }
      this._applyState();
    });

    this._antlion.bindInput(this._bidBtn, 'click', `${prefix}-submit-click`);
    this._antlion.onInput(`${prefix}-submit-click`, () => {
      if (this._state !== 'operable' || !this._isBidValid()) {
        return;
      }
      this._config.onBid(parseInt(this._input.value, 10));
    });

    this._antlion.bindInput(this._passBtn, 'click', `${prefix}-pass-click`);
    this._antlion.onInput(`${prefix}-pass-click`, () => {
      // Pass is operable for the active seat; disabled state prevents the click.
      if (this._state === 'hidden') {
        return;
      }
      this._config.onPass();
    });
  }

  _stepInput(delta) {
    if (this._state !== 'operable') {
      return;
    }
    const cur = parseInt(this._input.value, 10);
    const floor = this._effectiveFloor();
    const base = isNaN(cur) ? floor : cur;
    const next = delta < 0
      ? Math.max(floor, base + delta)
      : Math.min(MAX_BID, base + delta);
    this._input.value = String(next);
    this._applyState();
  }
}

export default BiddingControls;
