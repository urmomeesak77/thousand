import { SUIT_LETTER } from './cardSymbols.js';

// FLIP-style card-flight animation: spawns a fixed-position clone that eases
// from a source rect to a destination rect, plus the geometry helpers that
// derive card-sized source/destination rects from seat containers. Extracted
// from TrickPlayView so the per-frame animation mechanics and their clone/tick
// resource lifecycle live apart from the trick-resolve state machine. Owns the
// in-flight clone nodes and their Antlion.onTick deregister fns for teardown.
class CardFlightAnimator {
  constructor(antlion, getSeatEl, seats) {
    this._antlion = antlion;
    this._getSeatEl = getSeatEl;
    this._seats = seats;
    this._flightCancels = new Set();    // Antlion.onTick deregister fns for in-flight clones
    this._activeClones = new Set();     // DOM nodes for in-flight clones (for teardown)
  }

  // Returns a card-sized source rect for an opponent's play-to-centre flight.
  // Mirrors destRectForWinner: anchors on .opponent-view__stack and clamps to
  // a card width so the flight clone is card-sized rather than seat-container-sized.
  // Why: the seat container is a 1fr CSS-grid column wrapping nickname + stack +
  // last-action — much bigger than a card. Using its bounding rect as the
  // flight source produced a HUGE clone whose card sprite-sheet (sized via
  // --card-width CSS vars) tiled inside it, and the flight appeared to "drop in
  // from above" because the top of the column sits above the actual stack.
  sourceRectForOpponent(seatEl, cardWidth) {
    const stack = seatEl.querySelector('.opponent-view__stack');
    if (stack) {
      const r = stack.getBoundingClientRect();
      const w = Math.min(r.width, cardWidth || r.width);
      // Anchor on the right edge of the stack — the "top" of the deck visually,
      // where the just-played card was lifted from.
      return {
        left: r.right - w, top: r.top, width: w, height: r.height,
        right: r.right, bottom: r.bottom,
      };
    }
    const r = seatEl.getBoundingClientRect();
    const w = cardWidth || Math.min(r.width, 100);
    const h = w * 1.4;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return {
      left: cx - w / 2, top: cy - h / 2, width: w, height: h,
      right: cx + w / 2, bottom: cy + h / 2,
    };
  }

  // Returns a card-sized destination rect for the post-trick collect-flight.
  // Anchors on the winner's hand-stack area so the flight clones don't scale
  // up against a wide seat container.
  destRectForWinner(winnerSeat, cardWidth) {
    const seatEl = this._getSeatEl(winnerSeat);
    if (!seatEl) { return null; }
    if (winnerSeat === this._seats?.self) {
      const last = seatEl.querySelector('[data-card-id]:last-of-type');
      if (last) { return last.getBoundingClientRect(); }
    } else {
      const stack = seatEl.querySelector('.opponent-view__stack');
      if (stack) {
        const r = stack.getBoundingClientRect();
        const w = Math.min(r.width, cardWidth || r.width);
        return { left: r.left, top: r.top, width: w, height: r.height, right: r.left + w, bottom: r.bottom };
      }
    }
    const r = seatEl.getBoundingClientRect();
    const w = cardWidth || Math.min(r.width, 100);
    const h = w * 1.4; // typical card aspect ratio (h/w ≈ 1.4)
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return { left: cx - w / 2, top: cy - h / 2, width: w, height: h, right: cx + w / 2, bottom: cy + h / 2 };
  }

  spawn({ fromRect, toRect, rank, suit, duration, onDone }) {
    // One card-handling cue per flight — covers play-to-centre and collect-to-winner (FR-001).
    this._antlion.emit('sound:card');
    const clone = document.createElement('div');
    clone.className = `card-sprite card-sprite--up card--${rank}${SUIT_LETTER[suit]} card-flight-clone`;
    clone.style.position = 'fixed';
    clone.style.left = `${fromRect.left}px`;
    clone.style.top = `${fromRect.top}px`;
    clone.style.width = `${fromRect.width}px`;
    clone.style.height = `${fromRect.height}px`;
    clone.style.transform = 'translate3d(0,0,0)';
    clone.style.willChange = 'transform';
    clone.style.zIndex = '1000';
    document.body.appendChild(clone);
    this._activeClones.add(clone);

    const dx = toRect.left - fromRect.left;
    const dy = toRect.top - fromRect.top;
    const scale = toRect.width / Math.max(fromRect.width, 1);

    const start = Date.now();
    let cancelTick;
    const finish = () => {
      if (cancelTick) {
        this._flightCancels.delete(cancelTick);
        cancelTick();
        cancelTick = null;
      }
      this._activeClones.delete(clone);
      clone.remove();
      onDone?.();
    };
    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      clone.style.transform = `translate3d(${dx * eased}px, ${dy * eased}px, 0) scale(${1 + (scale - 1) * eased})`;
      if (t >= 1) { finish(); }
    };
    // §XI: per-frame work goes through Antlion.onTick.
    cancelTick = this._antlion.onTick(tick);
    if (cancelTick) { this._flightCancels.add(cancelTick); }
  }

  destroy() {
    for (const cancel of this._flightCancels) {
      cancel();
    }
    this._flightCancels.clear();
    for (const clone of this._activeClones) {
      clone.remove();
    }
    this._activeClones.clear();
  }
}

export default CardFlightAnimator;
