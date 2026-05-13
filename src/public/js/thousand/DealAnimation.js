// ============================================================
// DealAnimation — 24-step animated card deal driven by Antlion.onTick
// ============================================================

import CardSprite from './CardSprite.js';

const STEP_INTERVAL_MS = 80;
const CARD_ANIM_MS = 200;
// Slight visual stagger so stacked cards in the same hand slot are distinguishable
const HAND_STACK_OFFSET_X = 18;

class DealAnimation {
  constructor(antlion, dealSequence, cardsById, viewerSeat, cardTable, onComplete) {
    this._antlion = antlion;
    this._dealSequence = dealSequence;
    this._cardsById = cardsById;
    this._viewerSeat = viewerSeat;
    this._cardTable = cardTable;
    this._onComplete = onComplete;

    this._sprites = [];
    this._nextIndex = 0;
    this._startTime = null;
    this._container = null;
    this._destCounts = {};
    this._running = false;
  }

  get isRunning() {
    return this._running;
  }

  // Append sprites to container and begin the tick-driven animation sequence.
  start(container) {
    this._container = container;
    this._startTime = performance.now();
    this._running = true;
    this._antlion.onTick(() => this._tick());
  }

  _tick() {
    if (!this._running) return;

    const elapsed = performance.now() - this._startTime;

    while (
      this._nextIndex < this._dealSequence.length &&
      elapsed >= this._nextIndex * STEP_INTERVAL_MS
    ) {
      this._launchCard(this._nextIndex);
      this._nextIndex++;
    }

    let anyAnimating = false;
    for (const sprite of this._sprites) {
      if (sprite.update()) anyAnimating = true;
    }

    if (this._nextIndex >= this._dealSequence.length && !anyAnimating) {
      this._running = false;
      this._onComplete();
    }
  }

  _launchCard(index) {
    const step = this._dealSequence[index];
    const sprite = new CardSprite(step.id);

    const origin = this._cardTable.getSlot('deckOrigin');
    sprite.setPosition(origin.x, origin.y);

    if (step.to === `seat${this._viewerSeat}`) {
      sprite.setFace('up');
      const identity = this._cardsById[step.id];
      if (identity) sprite.setIdentity(identity);
    }

    const dest = this._getDestSlot(step.to);
    const count = this._destCounts[step.to] || 0;
    this._destCounts[step.to] = count + 1;

    if (dest) {
      sprite.setPosition(dest.x + count * HAND_STACK_OFFSET_X, dest.y, CARD_ANIM_MS);
    }

    this._container.appendChild(sprite.element);
    this._sprites.push(sprite);
  }

  _getDestSlot(to) {
    if (to === 'talon') return this._cardTable.getSlot('talon');
    const seatIdx = parseInt(to.replace('seat', ''), 10);
    const slots = this._cardTable.slotsForSeat(this._viewerSeat);
    return slots[seatIdx] ?? null;
  }
}

export default DealAnimation;
