import MarriageDeclarationPrompt from './MarriageDeclarationPrompt.js';
import CrawlControls from './CrawlControls.js';
import CardFlightAnimator from './CardFlightAnimator.js';
import { MARRIAGE_BONUS } from './constants.js';
import { SUIT_LETTER } from './cardSymbols.js';

const FLIGHT_MS = 500;
const TRICK_WINNER_HOLD_MS = 2000;

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
    this._setStatusOverride = opts.setStatusOverride ?? (() => {});
    this._getPlayerNickname = opts.getPlayerNickname ?? (() => null);
    this._gameStatus = null;
    this._pendingWinnerSeat = null;

    this._centerCards = [];             // { seat, cardId, rank, suit, slotEl }
    this._pendingPlayed = null;         // { seat, cardId } from card_played, consumed by next render
    // Seats present at the table (3 or 4); drives the centre slots and the
    // collected-count diff so a 4-player 'across' seat is handled like any other.
    this._seatList = this._presentSeats();
    this._lastCollectedCounts = this._initSeatCounts();
    this._scheduledIds = new Set();     // active Antlion.schedule ids (for teardown)
    this._resolveFinalized = true;      // becomes false during a trick-resolve sequence
    this._flight = new CardFlightAnimator(this._antlion, this._getSeatEl, this._seats);

    this._buildCenter();

    this._promptEl = document.createElement('div');
    this._promptEl.className = 'trick-play__marriage-prompt';
    this._promptEl.style.display = 'none';
    this._el.appendChild(this._promptEl);

    this._prompt = new MarriageDeclarationPrompt(this._promptEl, {
      antlion: this._antlion, dispatcher: this._dispatcher,
    });

    // Crawl (feature 007): face-down first-trick play for an ace-less declarer.
    // _crawlMode routes the next hand-card click to sendCrawlCommit; _crawlChoice
    // tracks the declarer's Crawl/Lead-normally decision so the choice buttons
    // aren't re-shown after a pick. Placeholders are face-down centre cards held
    // outside _centerCards until the reveal.
    this._crawlMode = false;
    this._crawlChoice = null; // null | 'crawl' | 'lead'
    this._crawlPlaceholders = [];
    this._crawlControlsEl = document.createElement('div');
    this._crawlControlsEl.className = 'trick-play__crawl-controls';
    this._crawlControlsEl.style.display = 'none';
    this._el.appendChild(this._crawlControlsEl);
    this._crawlControls = new CrawlControls(this._crawlControlsEl, {
      antlion: this._antlion,
      onCrawl: () => { this._crawlChoice = 'crawl'; this._crawlMode = true; },
      onLeadNormally: () => { this._crawlChoice = 'lead'; this._crawlMode = false; },
    });

    this._handClickHandler = (e) => {
      // Hard guard: while a trick-resolve is animating, the previous trick's cards
      // are still held in the centre. Reject plays until the centre clears so the
      // winner can't lead the next trick on top of uncollected cards.
      if (!this._resolveFinalized) { return; }
      const cardEl = e.target.closest('[data-card-id]');
      if (!cardEl || cardEl.classList.contains('card--disabled')) { return; }
      const cardId = parseInt(cardEl.dataset.cardId, 10);

      // Crawl commit: one face-down play per turn. The server re-enables the mode
      // (via crawlActive + the viewer's turn) for the next committer.
      if (this._crawlMode) {
        this._crawlMode = false;
        cardEl.style.visibility = 'hidden';
        this._dispatcher.sendCrawlCommit(cardId);
        return;
      }

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
    // Cross-check against server-authoritative legalCardIds. HandView can drift
    // (e.g. a forceClick that silently failed leaves a phantom card behind),
    // so we restrict the marriage check to ids the server agrees are still in
    // hand. For a leader, legalCardIds is the entire hand — perfect for this.
    const legalSet = new Set(gs.legalCardIds ?? []);
    const handIds = this._handView.getCardIds().filter((id) => legalSet.has(id));
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
    this._el.appendChild(this._crawlControlsEl);
    this._updateCrawlControls(gameStatus);

    // While the trick-resolve animation runs, the previous trick's three cards
    // are still in the centre. Freeze the whole hand (visually disabled) so the
    // winner can't play the next card on top of them. _finalizeTrickResolve
    // re-renders once the centre is clear, restoring normal legal-card state.
    if (!this._resolveFinalized) {
      this._handView.setDisabledIds(this._handView.getCardIds());
      this._handView.setInteractive(true);
      return;
    }

    const { legalCardIds, viewerIsActive } = gameStatus;
    const legalSet = new Set(legalCardIds ?? []);
    const handIds = this._handView.getCardIds();
    const disabledIds = handIds.filter((id) => !viewerIsActive || !legalSet.has(id));
    this._handView.setDisabledIds(disabledIds);
    this._handView.setInteractive(true);

    // Self-healing watchdog: if it's our turn but we have cards yet none are
    // legal, our HandView has drifted from server hands[] (the server's
    // legalCardIds was computed from a different hand than ours). Ask for a
    // fresh snapshot before the user is stuck staring at all-disabled cards.
    if (viewerIsActive && handIds.length > 0 && legalSet.size === 0) {
      this._dispatcher.sendRequestSnapshot();
    }
  }

  // -------- centre rendering & reconciliation --------

  // Clockwise slot names keyed by seat; 'across' is present only for 4-player.
  _slotNamesBySeat() {
    const s = this._seats;
    const names = { [s.self]: 'self', [s.left]: 'left', [s.right]: 'right' };
    if (s.across != null) { names[s.across] = 'across'; }
    return names;
  }

  _presentSeats() {
    return Object.keys(this._slotNamesBySeat()).map((seat) => Number(seat));
  }

  _initSeatCounts() {
    const counts = {};
    for (const seat of this._presentSeats()) { counts[seat] = 0; }
    return counts;
  }

  _buildCenter() {
    if (!this._trickCenterEl) { return; }
    this._trickCenterEl.classList.add('trick-center');
    this._trickCenterEl.textContent = '';
    // A slot per present seat — four for 4-player (self/left/across/right).
    for (const slotName of Object.values(this._slotNamesBySeat())) {
      const slot = document.createElement('div');
      slot.className = `trick-center__slot trick-center__slot--${slotName}`;
      slot.dataset.slot = slotName;
      this._trickCenterEl.appendChild(slot);
    }
  }

  _slotForSeat(seat) {
    if (!this._trickCenterEl) { return null; }
    const slotName = this._slotNamesBySeat()[seat] ?? null;
    return slotName ? this._trickCenterEl.querySelector(`[data-slot="${slotName}"]`) : null;
  }

  _reconcileCenter(gameStatus) {
    if (!this._trickCenterEl) { return; }
    // During an active crawl the centre shows only face-down placeholders; the
    // real faces (in _centerCards) arrive only at reveal. Keep the normal
    // currentTrick reconciliation out of it.
    if (gameStatus.crawlActive) {
      this._renderCrawlPlaceholders(gameStatus.crawlCommittedSeats ?? []);
      return;
    }
    const incomingTrick = gameStatus.currentTrick ?? [];
    const prevCounts = this._lastCollectedCounts;
    const curCounts = gameStatus.collectedTrickCounts ?? this._initSeatCounts();

    // Detect trick-resolve: the count went up for some seat (last card landed and
    // was collected). Diff over every present seat so the 4th (across) winner counts.
    let winnerSeat = null;
    for (const s of this._seatList) {
      if ((curCounts[s] ?? 0) > (prevCounts[s] ?? 0)) { winnerSeat = s; break; }
    }
    this._lastCollectedCounts = { ...curCounts };

    if (winnerSeat !== null) {
      this._handleTrickResolve(winnerSeat);
      this._pendingPlayed = null;
      return;
    }

    // A trick-resolve sequence is still animating. Don't commit the next trick's
    // cards into the centre yet: the collect-flight and _clearCenter operate on
    // _centerCards wholesale, so any card added now would be swept up and removed
    // when the resolve finalizes. This bites only the last trick, where every
    // player holds a single forced card and plays instantly — inside the resolve
    // window (hold + collect-flight). The plays live in gameStatus.currentTrick;
    // _finalizeTrickResolve re-reconciles against the latest status once the
    // centre is clear, so the deferred cards render then.
    if (!this._resolveFinalized) {
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

    // No pending message: reconcile statelessly against the server's currentTrick.
    // Handles both init/reconnect (local empty) AND stale optimistic drift —
    // e.g. an own play that the server never accepted (rejection or silent drop)
    // leaves _centerCards with a card the server's currentTrick lacks, and the
    // existing branches above don't touch it. Without this, the centre stays
    // stuck and the user can't recover.
    const serverIds = new Set(incomingTrick.map((e) => e.cardId));
    const localIds  = new Set(this._centerCards.map((e) => e.cardId));
    const diverged = serverIds.size !== localIds.size
      || [...serverIds].some((id) => !localIds.has(id));
    if (!diverged) { return; }

    this._centerCards = this._centerCards.filter((entry) => {
      if (serverIds.has(entry.cardId)) { return true; }
      entry.cardEl.remove();
      return false;
    });
    for (const entry of incomingTrick) {
      if (!localIds.has(entry.cardId) && entry.rank && entry.suit) {
        this._commitToCenter(entry.seat, entry.cardId, entry.rank, entry.suit);
      }
    }
  }

  // -------- crawl (feature 007) --------

  // FR-002/FR-004: surface the declarer's Crawl/Lead-normally choice or the
  // opponent's "commit face-down" prompt; otherwise hide the affordance.
  _updateCrawlControls(gameStatus) {
    if (gameStatus.crawlAvailable && this._crawlChoice === null) {
      this._crawlControls.showDeclarerChoice();
    } else if (gameStatus.crawlActive && gameStatus.viewerIsActive) {
      this._crawlControls.showOpponentPrompt();
    } else if (gameStatus.crawlAvailable && this._crawlChoice === 'lead') {
      // Keep the "Leading — pick a card to play" text alive across re-renders
      // until the declarer's normal play lands (clears crawlAvailable).
    } else {
      this._crawlControls.hide();
    }
    // The active committer (an opponent on their turn) plays in crawl mode.
    if (gameStatus.crawlActive) { this._crawlMode = gameStatus.viewerIsActive; }
  }

  // FR-003/FR-010: face-down placeholders for every committed seat, no faces.
  _renderCrawlPlaceholders(committedSeats) {
    for (const seat of committedSeats) {
      if (this._crawlPlaceholders.some((p) => p.seat === seat)) { continue; }
      const slot = this._slotForSeat(seat);
      if (!slot) { continue; }
      const el = document.createElement('div');
      el.className = 'card-sprite card-sprite--back crawl-placeholder';
      slot.appendChild(el);
      this._crawlPlaceholders.push({ seat, el });
    }
  }

  _clearCrawlPlaceholders() {
    for (const p of this._crawlPlaceholders) { p.el.remove(); }
    this._crawlPlaceholders = [];
  }

  // FR-006/FR-007: flip the placeholders to the three revealed faces, then reuse
  // the standard collect-to-winner flight and trick-2 restore.
  revealCrawl(commits, winnerSeat, gameStatus) {
    this._gameStatus = gameStatus;
    this._crawlMode = false;
    this._crawlChoice = null;
    this._crawlControls.hide();
    this._clearCrawlPlaceholders();
    for (const c of commits) {
      if (!this._centerCards.some((e) => e.cardId === c.cardId)) {
        this._cardsById[c.cardId] = { id: c.cardId, rank: c.rank, suit: c.suit };
        this._commitToCenter(c.seat, c.cardId, c.rank, c.suit);
      }
    }
    this._resolveCrawl(winnerSeat, gameStatus);
  }

  // Mirrors _handleTrickResolve but works from already-committed centre cards
  // (no pending-played card, no opponent-landing pause): hold, collect-flight,
  // then _finalizeTrickResolve re-renders trick 2 and releases the lock.
  _resolveCrawl(winnerSeat, gameStatus) {
    this._lastCollectedCounts = { ...(gameStatus.collectedTrickCounts ?? this._initSeatCounts()) };
    this._resolveFinalized = false;
    this._pendingWinnerSeat = winnerSeat;
    this._setControlsLocked(true);

    const nickname = this._getPlayerNickname(winnerSeat);
    if (nickname) {
      this._setStatusOverride(`${nickname} won the trick`, TRICK_WINNER_HOLD_MS + FLIGHT_MS);
    }

    const holdId = this._antlion.schedule(TRICK_WINNER_HOLD_MS, () => {
      this._scheduledIds.delete(holdId);
      this._collectFlightToWinner(winnerSeat);
    });
    this._scheduledIds.add(holdId);

    const safetyId = this._antlion.schedule(TRICK_WINNER_HOLD_MS + FLIGHT_MS + 200, () => {
      this._scheduledIds.delete(safetyId);
      this._finalizeTrickResolve();
    });
    this._scheduledIds.add(safetyId);
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
    // The 3rd card needs to appear before the collect-flight kicks off. For the
    // opponent case we run a normal flight (not a snap) so the play is visible —
    // and add FLIGHT_MS to the hold so the flight lands before the hold begins
    // ticking down.
    let extraPauseMs = 0;
    if (this._pendingPlayed) {
      const { seat, cardId } = this._pendingPlayed;
      const identity = this._cardsById[cardId];
      if (identity && !this._centerCards.some((c) => c.cardId === cardId)) {
        if (seat === this._seats.self) {
          this._commitToCenter(seat, cardId, identity.rank, identity.suit);
        } else {
          this._startOpponentFlight(seat, cardId, identity.rank, identity.suit);
          extraPauseMs = FLIGHT_MS;
        }
      }
    }

    this._resolveFinalized = false;
    this._pendingWinnerSeat = winnerSeat;
    this._setControlsLocked(true);

    // Set the winner banner up front so it is visible during the hold AND the
    // collect-flight. Duration spans the opponent-landing pause (if any), the
    // hold, and the collect-flight.
    const nickname = this._getPlayerNickname(winnerSeat);
    const totalSequenceMs = extraPauseMs + TRICK_WINNER_HOLD_MS + FLIGHT_MS;
    if (nickname) {
      this._setStatusOverride(`${nickname} won the trick`, totalSequenceMs);
    }

    // Hold the three cards in the centre for the hold duration (plus any
    // opponent-landing pause), then run the collect-flight to the winner's stack.
    const holdMs = extraPauseMs + TRICK_WINNER_HOLD_MS;
    const pauseId = this._antlion.schedule(holdMs, () => {
      this._scheduledIds.delete(pauseId);
      this._collectFlightToWinner(winnerSeat);
    });
    this._scheduledIds.add(pauseId);

    // Why: rAF is throttled/paused in occluded or background browser windows, so
    // an onLand-only release can hang forever (the game lock would stay engaged and
    // mountForPhase would stop firing). This setTimeout-based safety net guarantees
    // the lock releases on a real-time deadline regardless of frame painting.
    const safetyId = this._antlion.schedule(holdMs + FLIGHT_MS + 200, () => {
      this._scheduledIds.delete(safetyId);
      this._finalizeTrickResolve();
    });
    this._scheduledIds.add(safetyId);
  }

  _finalizeTrickResolve() {
    if (this._resolveFinalized) { return; }
    this._resolveFinalized = true;
    this._clearCenter();
    this._pendingWinnerSeat = null;
    // Cards played during the resolve window were deferred (see _reconcileCenter)
    // and the hand was frozen (see render). Now that the centre is clear, a full
    // re-render commits any deferred next-trick cards AND restores the hand's
    // normal legal-card disabled state from the latest snapshot.
    //
    // This render MUST happen before releasing the lock: render() does
    // `_el.textContent = ''` on the shared controlsEl, and releasing the lock
    // synchronously mounts the RoundSummaryScreen into that SAME element when the
    // last trick resolved. Rendering after the unlock would wipe the freshly
    // mounted summary (Continue button included), stranding every player on
    // "Round complete". Render first, then unlock.
    if (this._gameStatus) { this.render(this._gameStatus); }
    this._setControlsLocked(false);
  }

  // Card width comes from a committed centre sprite; the geometry lives in
  // CardFlightAnimator. Thin wrapper so the _centerCards-derived width stays
  // TrickPlayView's concern while the rect math stays in the animator.
  _destRectForWinner(winnerSeat) {
    const cardWidth = this._centerCards[0]?.cardEl?.getBoundingClientRect().width ?? 0;
    return this._flight.destRectForWinner(winnerSeat, cardWidth);
  }

  _collectFlightToWinner(winnerSeat) {
    const destRect = this._destRectForWinner(winnerSeat);
    if (!destRect || this._centerCards.length === 0) {
      this._finalizeTrickResolve();
      return;
    }
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
      this._flight.spawn({
        fromRect, toRect: destRect, rank: entry.rank, suit: entry.suit,
        duration: FLIGHT_MS, onDone: onLand,
      });
      entry.cardEl.style.visibility = 'hidden';
    }
  }

  _clearCenter() {
    for (const entry of this._centerCards) {
      entry.cardEl.remove();
    }
    this._centerCards = [];
  }

  // -------- per-card play-to-centre flights (delegate clone mechanics to CardFlightAnimator) --------

  _startOwnFlight(cardId, cardEl) {
    const card = this._cardsById[cardId];
    if (!card) { return; }
    // Guard against double-click before server ack: don't append a second sprite
    // to the same slot if this card is already committed.
    if (this._centerCards.some((c) => c.cardId === cardId)) { return; }
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
    this._flight.spawn({
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
    // Pre-commit the centre card hidden, so its rect is the flight destination
    // AND so toRect's card width is available as a sizing reference for fromRect.
    const entry = this._commitToCenter(seat, cardId, rank, suit);
    if (!entry) { return; }
    entry.cardEl.style.visibility = 'hidden';
    const toRect = entry.cardEl.getBoundingClientRect();
    const fromRect = this._flight.sourceRectForOpponent(sourceEl, toRect.width);
    this._flight.spawn({
      fromRect, toRect, rank, suit, duration: FLIGHT_MS,
      onDone: () => { entry.cardEl.style.visibility = ''; },
    });
  }

  destroy() {
    this._antlion.offInput('hand-card-click', this._handClickHandler);
    this._prompt?.destroy();
    this._crawlControls?.destroy();
    this._clearCrawlPlaceholders();
    for (const id of this._scheduledIds) {
      this._antlion.cancelScheduled?.(id);
    }
    this._scheduledIds.clear();
    this._flight.destroy();
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
