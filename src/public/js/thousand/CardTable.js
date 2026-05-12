// ============================================================
// CardTable — viewport-relative slot coordinates for the 3-player table
// ============================================================

// Card dimensions (kept in sync with .card-sprite CSS)
const CARD_W = 60;
const CARD_H = 90;

class CardTable {
  constructor(antlion, container) {
    this._container = container;
    this._slots = {};
    this._compute();

    antlion.bindInput(window, 'resize', 'resize');
    antlion.onInput('resize', () => this._compute());
  }

  // Returns { x, y } pixel position (top-left of card) for a named slot
  getSlot(name) {
    return this._slots[name];
  }

  // Returns { [seatIdx]: { x, y } } using the FR-005 clockwise layout rule:
  //   - viewer's own seat → 'self' (bottom center)
  //   - next-clockwise opponent → 'left' (left side)
  //   - remaining opponent    → 'right' (right side)
  slotsForSeat(viewerSeat) {
    const leftSeat = (viewerSeat + 1) % 3;
    const rightSeat = (viewerSeat + 2) % 3;
    return {
      [viewerSeat]: this._slots.self,
      [leftSeat]: this._slots.left,
      [rightSeat]: this._slots.right,
    };
  }

  _compute() {
    const w = this._container.clientWidth || window.innerWidth;
    const h = this._container.clientHeight || window.innerHeight;
    const cx = Math.round(w / 2);
    const cy = Math.round(h / 2);

    this._slots = {
      self:       { x: cx - Math.round(CARD_W / 2), y: h - 120 },
      left:       { x: 24,                           y: cy - Math.round(CARD_H / 2) },
      right:      { x: w - 24 - CARD_W,              y: cy - Math.round(CARD_H / 2) },
      talon:      { x: cx - Math.round(CARD_W / 2),  y: cy - Math.round(CARD_H / 2) },
      deckOrigin: { x: cx - Math.round(CARD_W / 2) - 40, y: cy - Math.round(CARD_H / 2) },
    };
  }
}

export default CardTable;
