// ============================================================
// CardSprite — single card visual, absolutely-positioned DOM node
// ============================================================

import { SUIT_LETTER } from './cardSymbols.js';

class CardSprite {
  constructor(id) {
    this._id = id;
    this._identity = null;
    this._face = 'back';

    this._x = 0;
    this._y = 0;
    this._startX = 0;
    this._startY = 0;
    this._targetX = 0;
    this._targetY = 0;
    this._animStart = null;
    this._animDuration = 0;

    this._el = document.createElement('div');
    this._el.className = 'card-sprite card-sprite--back';
    this._applyPosition(0, 0);
  }

  get id() {
    return this._id;
  }

  get element() {
    return this._el;
  }

  // Start animated move; durationMs=0 snaps immediately
  setPosition(x, y, durationMs = 0) {
    if (durationMs <= 0) {
      if (this._x === x && this._y === y && this._animStart === null) {return;}
      this._x = x;
      this._y = y;
      this._targetX = x;
      this._targetY = y;
      this._animStart = null;
      this._applyPosition(x, y);
      return;
    }
    if (this._targetX === x && this._targetY === y && this._animStart !== null) {return;}
    this._startX = this._x;
    this._startY = this._y;
    this._targetX = x;
    this._targetY = y;
    this._animStart = performance.now();
    this._animDuration = durationMs;
  }

  setFace(face) {
    this._face = face;
    this._el.className = this._buildClassName();
  }

  setIdentity(identity) {
    this._identity = identity;
    this._el.className = this._buildClassName();
  }

  // Returns true while animation is in progress; call each tick from the owning animator
  update() {
    if (this._animStart === null) {return false;}

    const t = Math.min((performance.now() - this._animStart) / this._animDuration, 1);
    // ease-out quad
    const e = 1 - (1 - t) * (1 - t);

    this._x = this._startX + (this._targetX - this._startX) * e;
    this._y = this._startY + (this._targetY - this._startY) * e;
    this._applyPosition(this._x, this._y);

    if (t >= 1) {
      this._animStart = null;
      return false;
    }
    return true;
  }

  _applyPosition(x, y) {
    this._el.style.left = `${Math.round(x)}px`;
    this._el.style.top = `${Math.round(y)}px`;
  }

  _buildClassName() {
    let cls = `card-sprite card-sprite--${this._face}`;
    if (this._face === 'up' && this._identity) {
      const { rank, suit } = this._identity;
      cls += ` card--${rank}${SUIT_LETTER[suit]}`;
    }
    return cls;
  }
}

export default CardSprite;
