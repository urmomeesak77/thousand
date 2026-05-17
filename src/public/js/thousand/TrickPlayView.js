import MarriageDeclarationPrompt from './MarriageDeclarationPrompt.js';
import { MARRIAGE_BONUS } from './constants.js';
import { SUIT_LETTER } from './cardSymbols.js';

const FLIGHT_MS = 250;
const RESOLVE_PAUSE_MS = 350;

class TrickPlayView {
  constructor(el, opts) {
    this._el = el;
    this._antlion = opts.antlion;
    this._dispatcher = opts.dispatcher;
    this._seats = opts.seats;
    this._handView = opts.handView;
    this._cardsById = opts.cardsById ?? {};
    this._trickCenterEl = opts.trickCenterEl ?? null;
    this._getSeatEl = opts.getSeatEl ?? (() => null);
    this._setControlsLocked = opts.setControlsLocked ?? (() => {});
    this._gameStatus = null;

    this._centerCards = [];             // { seat, cardId, rank, suit, slotEl }
    this._pendingPlayed = null;         // { seat, cardId } from card_played, consumed by next render
    this._lastCollectedCounts = { 0: 0, 1: 0, 2: 0 };
    this._flightCancels = new Set();    // Antlion.onTick deregister fns for in-flight clones
    this._scheduledIds = new Set();     // active Antlion.schedule ids (for teardown)
    this._activeClones = new Set();     // DOM nodes for in-flight clones (for teardown)
    this._resolveFinalized = true;      // becomes false during a trick-resolve sequence

    this._buildCenter();

    this._promptEl = document.createElement('div');
    this._promptEl.className = 'trick-play__marriage-prompt';
    this._promptEl.style.display = 'none';
    this._el.appendChild(this._promptEl);

    this._prompt = new MarriageDeclarationPrompt(this._promptEl, {
      antlion: this._antlion, dispatcher: this._dispatcher,
    });

    this._handClickHandler = (e) => {
      const cardEl = e.target.closest('[data-card-id]');
      if (!cardEl || cardEl.classList.contains('card--disabled')) { return; }
      const cardId = parseInt(cardEl.dataset.cardId, 10);

      if (this._canOfferMarriage(cardId)) {
        const card = this._cardsById[cardId];
        const bonus = MARRIAGE_BONUS[card.suit] ?? 0;
        this._prompt.show(cardId, card.suit, bonus);
        return;
      }

      this._startOwnFlight(cardId, cardEl);
      this._dispatcher.sendPlayCard(cardId);
    };
    this._antlion.onInput('hand-card-click', this._handClickHandler);
  }

  // Capture the just-played card's identity so the next render() can animate it.
  // Called by GameScreen before updateStatus → render fires.
  notifyCardPlayed(playerSeat, cardId) {
    this._pendingPlayed = { seat: playerSeat, cardId };
  }

  _canOfferMarriage(cardId) {
    const gs = this._gameStatus;
    if (!gs?.viewerIsLeading) { return false; }
    if (gs.trickNumber == null || gs.trickNumber < 2) { return false; }
    const card = this._cardsById[cardId];
    if (!card) { return false; }
    if (card.rank !== 'K' && card.rank !== 'Q') { return false; }
    const handIds = this._handView.getCardIds();
    const hand = handIds.map((id) => this._cardsById[id]).filter(Boolean);
    if (!MarriageDeclarationPrompt.canOffer(hand, gs.trickNumber)) { return false; }
    const hasK = hand.some((c) => c.rank === 'K' && c.suit === card.suit);
    const hasQ = hand.some((c) => c.rank === 'Q' && c.suit === card.suit);
    return hasK && hasQ;
  }

  render(gameStatus) {
    this._gameStatus = gameStatus;

    // Reconcile the centre area before mutating the controls strip
    this._reconcileCenter(gameStatus);

    this._el.textContent = '';
    this._el.appendChild(this._promptEl);

    const { legalCardIds, viewerIsActive, collectedTrickCounts } = gameStatus;
    const legalSet = new Set(legalCardIds ?? []);
    const handIds = this._handView.getCardIds();
    const disabledIds = handIds.filter((id) => !viewerIsActive || !legalSet.has(id));
    this._handView.setDisabledIds(disabledIds);
    this._handView.setInteractive(true);

    this._renderCollectedBadges(collectedTrickCounts);

    // Self-healing watchdog: if it's our turn but we have cards yet none are
    // legal, our HandView has drifted from server hands[] (the server's
    // legalCardIds was computed from a different hand than ours). Ask for a
    // fresh snapshot before the user is stuck staring at all-disabled cards.
    if (viewerIsActive && handIds.length > 0 && legalSet.size === 0) {
      this._dispatcher.sendRequestSnapshot();
    }
  }

  _renderCollectedBadges(collectedTrickCounts) {
    const stackEl = document.createElement('div');
    stackEl.className = 'trick-play__collected';

    for (const [seatStr, count] of Object.entries(collectedTrickCounts)) {
      const seat = Number(seatStr);
      const item = document.createElement('div');
      item.className = 'collected-tricks__item';
      item.dataset.seat = seat;

      const badge = document.createElement('span');
      badge.className = 'collected-tricks__badge';
      badge.textContent = `× ${count}`;

      item.appendChild(badge);
      stackEl.appendChild(item);
    }

    this._el.appendChild(stackEl);
  }

  // -------- centre rendering & reconciliation --------

  _buildCenter() {
    if (!this._trickCenterEl) { return; }
    this._trickCenterEl.classList.add('trick-center');
    this._trickCenterEl.textContent = '';
    for (const slotName of ['self', 'left', 'right']) {
      const slot = document.createElement('div');
      slot.className = `trick-center__slot trick-center__slot--${slotName}`;
      slot.dataset.slot = slotName;
      this._trickCenterEl.appendChild(slot);
    }
  }

  _slotForSeat(seat) {
    if (!this._trickCenterEl) { return null; }
    const slotName = seat === this._seats.self ? 'self'
      : seat === this._seats.left ? 'left'
      : seat === this._seats.right ? 'right' : null;
    return slotName ? this._trickCenterEl.querySelector(`[data-slot="${slotName}"]`) : null;
  }

  _reconcileCenter(gameStatus) {
    if (!this._trickCenterEl) { return; }
    const incomingTrick = gameStatus.currentTrick ?? [];
    const prevCounts = this._lastCollectedCounts;
    const curCounts = gameStatus.collectedTrickCounts ?? { 0: 0, 1: 0, 2: 0 };

    // Detect trick-resolve: the count went up for some seat (3rd card landed and was collected).
    let winnerSeat = null;
    for (const s of [0, 1, 2]) {
      if ((curCounts[s] ?? 0) > (prevCounts[s] ?? 0)) { winnerSeat = s; break; }
    }
    this._lastCollectedCounts = { ...curCounts };

    if (winnerSeat !== null) {
      this._handleTrickResolve(winnerSeat);
      this._pendingPlayed = null;
      return;
    }

    // Detect a new card mid-trick. _pendingPlayed identifies whose card just landed;
    // its identity is in cardsById (own card) or in gameStatus.currentTrick (opponent).
    if (this._pendingPlayed) {
      const { seat, cardId } = this._pendingPlayed;
      this._pendingPlayed = null;
      const alreadyShown = this._centerCards.some((c) => c.cardId === cardId);
      if (!alreadyShown) {
        const identity = this._cardsById[cardId] ?? incomingTrick.find((t) => t.cardId === cardId);
        if (identity) {
          if (seat === this._seats.self) {
            // Own flight was started in the click handler; commit only.
            this._commitToCenter(seat, cardId, identity.rank, identity.suit);
          } else {
            this._startOpponentFlight(seat, cardId, identity.rank, identity.suit);
          }
        }
      }
      return;
    }

    // No pending message: this is an init/reconnect render. Mirror snapshot statelessly.
    if (this._centerCards.length === 0 && incomingTrick.length > 0) {
      for (const entry of incomingTrick) {
        if (entry.rank && entry.suit) {
          this._commitToCenter(entry.seat, entry.cardId, entry.rank, entry.suit);
        }
      }
    }
  }

  _commitToCenter(seat, cardId, rank, suit) {
    const slot = this._slotForSeat(seat);
    if (!slot) { return null; }
    const cardEl = document.createElement('div');
    cardEl.className = `card-sprite card-sprite--up card--${rank}${SUIT_LETTER[suit]}`;
    cardEl.dataset.cardId = cardId;
    slot.appendChild(cardEl);
    const entry = { seat, cardId, rank, suit, slotEl: slot, cardEl };
    this._centerCards.push(entry);
    return entry;
  }

  _handleTrickResolve(winnerSeat) {
    // The 3rd card needs to appear before the collect-flight kicks off.
    if (this._pendingPlayed) {
      const { seat, cardId } = this._pendingPlayed;
      const identity = this._cardsById[cardId];
      if (identity && !this._centerCards.some((c) => c.cardId === cardId)) {
        // Even an opponent's 3rd card is in cardsById now — ThousandApp seeded it
        // from msg.card before forwarding notifyCardPlayed → updateStatus → render.
        if (seat === this._seats.self) {
          this._commitToCenter(seat, cardId, identity.rank, identity.suit);
        } else {
          this._instantSnapToCenter(seat, cardId, identity.rank, identity.suit);
        }
      }
    }

    this._resolveFinalized = false;
    this._setControlsLocked(true);
    const pauseId = this._antlion.schedule(RESOLVE_PAUSE_MS, () => {
      this._scheduledIds.delete(pauseId);
      this._collectFlightToWinner(winnerSeat);
    });
    this._scheduledIds.add(pauseId);
    // Why: rAF is throttled/paused in occluded or background browser windows, so
    // an onLand-only release can hang forever (the game lock would stay engaged and
    // mountForPhase would stop firing). This setTimeout-based safety net guarantees
    // the lock releases on a real-time deadline regardless of frame painting.
    const safetyId = this._antlion.schedule(RESOLVE_PAUSE_MS + FLIGHT_MS + 200, () => {
      this._scheduledIds.delete(safetyId);
      this._finalizeTrickResolve();
    });
    this._scheduledIds.add(safetyId);
  }

  _finalizeTrickResolve() {
    if (this._resolveFinalized) { return; }
    this._resolveFinalized = true;
    this._clearCenter();
    this._setControlsLocked(false);
  }

  // For the 3rd-card opponent case where we don't have time for a flight before the
  // resolve pause: just drop the card into its slot, with the same arrival highlight
  // a tick or two before the collect-flight runs.
  _instantSnapToCenter(seat, cardId, rank, suit) {
    const entry = this._commitToCenter(seat, cardId, rank, suit);
    if (!entry) { return; }
    entry.cardEl.classList.add('trick-center__card--just-played');
  }

  _collectFlightToWinner(winnerSeat) {
    const destEl = this._getSeatEl(winnerSeat);
    if (!destEl || this._centerCards.length === 0) {
      this._finalizeTrickResolve();
      return;
    }
    const destRect = destEl.getBoundingClientRect();
    const cards = [...this._centerCards];
    let landed = 0;
    const onLand = () => {
      landed += 1;
      if (landed >= cards.length) {
        this._finalizeTrickResolve();
      }
    };
    for (const entry of cards) {
      const fromRect = entry.cardEl.getBoundingClientRect();
      this._spawnFlight({
        fromRect, toRect: destRect, rank: entry.rank, suit: entry.suit,
        duration: FLIGHT_MS, onDone: onLand,
      });
      // Hide the original card; the clone is what the user sees moving.
      entry.cardEl.style.visibility = 'hidden';
    }
  }

  _clearCenter() {
    for (const entry of this._centerCards) {
      entry.cardEl.remove();
    }
    this._centerCards = [];
  }

  // -------- per-card flight animation (FLIP-style) --------

  _startOwnFlight(cardId, cardEl) {
    const card = this._cardsById[cardId];
    if (!card) { return; }
    const slot = this._slotForSeat(this._seats.self);
    if (!slot) { return; }
    const fromRect = cardEl.getBoundingClientRect();
    // Hide the source so the flying clone is the only visible instance.
    cardEl.style.visibility = 'hidden';
    // Reserve the slot space immediately by committing the destination card hidden.
    const entry = this._commitToCenter(this._seats.self, cardId, card.rank, card.suit);
    if (!entry) { return; }
    entry.cardEl.style.visibility = 'hidden';
    const toRect = entry.cardEl.getBoundingClientRect();
    this._spawnFlight({
      fromRect, toRect, rank: card.rank, suit: card.suit, duration: FLIGHT_MS,
      onDone: () => { entry.cardEl.style.visibility = ''; },
    });
  }

  _startOpponentFlight(seat, cardId, rank, suit) {
    const sourceEl = this._getSeatEl(seat);
    const slot = this._slotForSeat(seat);
    if (!sourceEl || !slot) {
      this._commitToCenter(seat, cardId, rank, suit);
      return;
    }
    const fromRect = sourceEl.getBoundingClientRect();
    // Pre-commit the centre card hidden, so its rect is the flight destination.
    const entry = this._commitToCenter(seat, cardId, rank, suit);
    if (!entry) { return; }
    entry.cardEl.style.visibility = 'hidden';
    const toRect = entry.cardEl.getBoundingClientRect();
    this._spawnFlight({
      fromRect, toRect, rank, suit, duration: FLIGHT_MS,
      onDone: () => { entry.cardEl.style.visibility = ''; },
    });
  }

  _spawnFlight({ fromRect, toRect, rank, suit, duration, onDone }) {
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
    this._antlion.offInput('hand-card-click', this._handClickHandler);
    this._prompt?.destroy();
    for (const id of this._scheduledIds) {
      this._antlion.cancelScheduled?.(id);
    }
    this._scheduledIds.clear();
    for (const cancel of this._flightCancels) {
      cancel();
    }
    this._flightCancels.clear();
    for (const clone of this._activeClones) {
      clone.remove();
    }
    this._activeClones.clear();
    if (this._trickCenterEl) {
      this._trickCenterEl.classList.remove('trick-center');
      this._trickCenterEl.textContent = '';
    }
    this._centerCards = [];
    this._handView.setDisabledIds([]);
    this._handView.setInteractive(false);
  }
}

export default TrickPlayView;
