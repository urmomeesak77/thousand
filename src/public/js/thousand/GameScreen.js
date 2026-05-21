// ============================================================
// GameScreen — container for the in-round game view
// ============================================================

import StatusBar from './StatusBar.js';
import ScoreboardPanel from './ScoreboardPanel.js';
import GameStatusBox from './GameStatusBox.js';
import CardTable from './CardTable.js';
import HandView from './HandView.js';
import OpponentView from './OpponentView.js';
import TalonView from './TalonView.js';
import DealAnimation from './DealAnimation.js';
import RoundReadyScreen from './RoundReadyScreen.js';
import GameScreenControls from './GameScreenControls.js';
import SellPhaseView from './SellPhaseView.js';
import FourNinesPrompt from './FourNinesPrompt.js';
import { computeStatusText } from './statusText.js';
import { formatRoundStats } from './roundStatsText.js';

const FLASH_DURATION_MS = 600;
const OPPONENT_DEFAULT_HAND = 7;

class GameScreen {
  constructor(antlion, container, dispatcher) {
    this._antlion = antlion;
    this._container = container;
    this._dispatcher = dispatcher;
    this._cardsById = {};
    this._seats = null;
    this._isControlsLocked = false;
    this._lastGameStatus = null;
    this._lastMountedPhase = null;
    this._pendingMountStatus = null;
    this._lastSnapshot = null;
    this._sellSubPhase = null;
    this._exposedCardIds = [];
    this._roundReadyScreen = null;
    this._dealAnimation = null;
    this._talonCardIds = [];
    this._viewerIsNewDeclarer = false;
    this._sellWinnerNickname = null;
    this._statusOverride = null;
    this._statusOverrideScheduleId = null;

    this._buildDom(antlion, container);

    this._controls = new GameScreenControls(
      this, antlion, this._controlsEl, this._handView, dispatcher,
    );
    this.sellPhase = new SellPhaseView(this);

    // Blocking four-nines modal (FR-003). A GameScreen-lifetime singleton, like
    // the scoreboard — its single Antlion input persists across rounds.
    this._fourNinesPrompt = new FourNinesPrompt(this._fourNinesEl, { antlion, dispatcher });
  }

  _buildDom(antlion, container) {
    const statusBarEl = document.createElement('div');
    const tableEl = document.createElement('div');
    tableEl.className = 'game-table';
    const leftEl = document.createElement('div');
    const centerColEl = document.createElement('div');
    centerColEl.className = 'talon-col';
    const statusBoxEl = document.createElement('div');
    const talonEl = document.createElement('div');
    centerColEl.append(statusBoxEl, talonEl);
    const rightEl = document.createElement('div');
    const handEl = document.createElement('div');
    const selfStatsEl = document.createElement('div');
    selfStatsEl.className = 'self-round-stats hidden';
    this._controlsEl = document.createElement('div');
    this._controlsEl.className = 'game-controls';

    const lastActionEl = document.createElement('div');
    lastActionEl.className = 'last-action-box hidden';
    this._lastActionEl = lastActionEl;

    tableEl.append(leftEl, centerColEl, rightEl, lastActionEl, selfStatsEl, handEl);
    const scoreboardEl = document.createElement('div');
    const fourNinesEl = document.createElement('div');
    fourNinesEl.style.display = 'none';
    container.append(statusBarEl, tableEl, this._controlsEl, scoreboardEl, fourNinesEl);
    this._scoreboard = new ScoreboardPanel(scoreboardEl, antlion);
    this._fourNinesEl = fourNinesEl;

    this._tableEl = tableEl;
    this._leftEl = leftEl;
    this._rightEl = rightEl;
    this._handEl = handEl;
    this._selfStatsEl = selfStatsEl;
    this._talonEl = talonEl;

    this._statusBar = new StatusBar(statusBarEl);
    this._statusBox = new GameStatusBox(statusBoxEl);
    this._cardTable = new CardTable(antlion, tableEl);
    this._handView = new HandView(handEl, antlion);
    this._leftOpponent = new OpponentView(leftEl);
    this._rightOpponent = new OpponentView(rightEl);
    this._talonView = new TalonView(talonEl);
  }

  // Exposed to TrickPlayView so it can mount its centre cards into the talon area
  // and look up source elements for the seat-to-centre flight animation.
  get trickCenterEl() { return this._talonEl; }
  getSeatEl(seat) { return this._elForSeat(seat); }

  _seatOf(playerId) {
    return this._seats?.players.find((p) => p.playerId === playerId)?.seat ?? null;
  }

  _opponentForSeat(seat) {
    if (!this._seats || seat == null) {return null;}
    if (seat === this._seats.left) {return this._leftOpponent;}
    if (seat === this._seats.right) {return this._rightOpponent;}
    return null;
  }

  _elForSeat(seat) {
    if (!this._seats || seat == null) {return null;}
    if (seat === this._seats.self) {return this._handEl;}
    if (seat === this._seats.left) {return this._leftEl;}
    if (seat === this._seats.right) {return this._rightEl;}
    return null;
  }

  _setLastActionForSeat(seat, text) {
    if (!this._seats || seat == null) {return;}
    if (seat === this._seats.self) {
      this._lastActionEl.textContent = text;
      this._lastActionEl.classList.remove('hidden');
    } else {
      this._opponentForSeat(seat)?.setLastAction(text);
    }
  }

  // Called on round_started; seeds cardsById, lays out seats, starts the deal animation.
  init(msg) {
    this._cardTable.refresh();
    this._seats = msg.seats;
    this._cardsById = {};
    this._viewerIsNewDeclarer = false;
    this._sellWinnerNickname = null;
    this._clearLastAction();
    this._handView.setHand([]);
    this._talonView.clear();
    this._leftOpponent.setCardCount(0);
    this._rightOpponent.setCardCount(0);

    this._tableEl.classList.remove('hidden');
    this._controlsEl.classList.remove('hidden');

    for (const step of msg.dealSequence) {
      if (step.rank && step.suit) {
        this._cardsById[step.id] = { id: step.id, rank: step.rank, suit: step.suit };
      }
    }

    const leftPlayer = msg.seats.players.find((p) => p.seat === msg.seats.left);
    const rightPlayer = msg.seats.players.find((p) => p.seat === msg.seats.right);
    if (leftPlayer) {this._leftOpponent.setNickname(leftPlayer.nickname);}
    if (rightPlayer) {this._rightOpponent.setNickname(rightPlayer.nickname);}

    this._lastGameStatus = msg.gameStatus;
    this._startDealAnimation(msg.dealSequence);
    this._renderStatus(msg.gameStatus);
  }

  // Called on round_state_snapshot; rebuilds the layout, playing the deal animation if no
  // bids have been placed yet (server includes dealSequence in that case).
  initFromSnapshot(msg) {
    this._cardTable.refresh();
    this._seats = msg.seats;
    this._cardsById = {};
    this._isControlsLocked = false;
    this._lastMountedPhase = null;
    this._pendingMountStatus = null;
    this._viewerIsNewDeclarer = false;
    this._sellWinnerNickname = null;
    this._clearLastAction();

    this._tableEl.classList.remove('hidden');
    this._controlsEl.classList.remove('hidden');

    this._seedCardsFromSnapshot(msg);
    this._setOpponentNicknames(msg.seats);

    this._renderStatus(msg.gameStatus);
    this._lastGameStatus = msg.gameStatus;
    this._lastSnapshot = msg;

    if (msg.dealSequence) {
      this._startDealAnimation(msg.dealSequence, msg.opponentHandSizes);
      return;
    }

    this._leftOpponent.setCardCount(msg.opponentHandSizes[msg.seats.left] ?? 0);
    this._rightOpponent.setCardCount(msg.opponentHandSizes[msg.seats.right] ?? 0);
    this._handView.setHand(msg.myHand);
    this._renderSnapshotTalon(msg);
    this.sellPhase.initFromSnapshot(msg);

    this._controls.mountForPhase(msg.gameStatus);

    // FR-010: restore the four-nines blocking modal if the ack-gate is still open.
    if (msg.fourNinesAckPending && msg.fourNinesAward) {
      const { seat, amount } = msg.fourNinesAward;
      this.showFourNinesPrompt(this.playerNicknameForSeat(seat) ?? '', amount, msg.viewerHasAcknowledged === true);
    } else {
      this.hideFourNinesPrompt();
    }
  }

  // Called when a fresh snapshot arrives mid-round (e.g. card exchange or trick play update).
  updateSnapshot(snapshot) {
    this._lastSnapshot = { ...(this._lastSnapshot ?? {}), ...snapshot };
    const status = this._lastGameStatus ?? snapshot.gameStatus;
    if (this._canMountNow(status)) {
      this._controls.mountForPhase(status);
      this._lastMountedPhase = status?.phase ?? this._lastMountedPhase;
      this._pendingMountStatus = null;
    } else {
      this._pendingMountStatus = status;
    }
  }

  _seedCardsFromSnapshot(msg) {
    for (const card of msg.myHand) {
      this._cardsById[card.id] = { id: card.id, rank: card.rank, suit: card.suit };
    }
    if (msg.exposed) {
      for (const card of msg.exposed) {
        this._cardsById[card.id] = { id: card.id, rank: card.rank, suit: card.suit };
      }
    }
  }

  _setOpponentNicknames(seats) {
    const left = seats.players.find((p) => p.seat === seats.left);
    const right = seats.players.find((p) => p.seat === seats.right);
    if (left) {
      this._leftOpponent.setNickname(left.nickname);
    }
    if (right) {
      this._rightOpponent.setNickname(right.nickname);
    }
  }

  _renderSnapshotTalon(msg) {
    if (msg.exposed && msg.exposed.length > 0) {
      this._talonView.setCards(msg.exposed);
    } else if (msg.talonIds && msg.talonIds.length > 0) {
      this._talonView.setFaceDownCount(msg.talonIds.length);
    } else {
      this._talonView.clear();
    }
  }

  // Called on continue_press_recorded to update the RoundSummaryScreen indicators.
  updateContinuePressedSeats(seats) {
    this._controls.updateContinuePressedSeats(seats);
  }

  // Called on every phase_changed, bid_accepted, pass_accepted, etc.
  updateStatus(gameStatus) {
    this._lastGameStatus = gameStatus;
    this._renderStatus(gameStatus);
    if (gameStatus.phase === 'Card exchange') {
      this._talonView.clear();
    }
    this._applyOpponentHandSizes(gameStatus.opponentHandSizes);
    // Why: when the last trick's card_played arrives, gameStatus.phase has
    // already moved to 'Round complete'. Without this, mountForPhase swaps to
    // RoundSummaryScreen and destroys TrickPlayView before _reconcileCenter
    // can see the count diff. Forwarding the status only on this transition
    // lets the active TrickPlayView engage the controls-lock, deferring the
    // RoundSummaryScreen mount until _finalizeTrickResolve unlocks. Skipped
    // for same-phase updates because mountForPhase below already re-renders.
    if (this._lastMountedPhase === 'Trick play' && gameStatus.phase !== 'Trick play') {
      this._controls.forwardStatusToTrickPlayView(gameStatus);
    }
    if (this._canMountNow(gameStatus)) {
      this._controls.mountForPhase(gameStatus);
      this._lastMountedPhase = gameStatus.phase;
      this._pendingMountStatus = null;
    } else {
      this._pendingMountStatus = gameStatus;
    }
  }

  _applyOpponentHandSizes(sizes) {
    if (!sizes || !this._seats) { return; }
    const left = sizes[this._seats.left];
    const right = sizes[this._seats.right];
    if (typeof left === 'number') { this._leftOpponent.setCardCount(left); }
    if (typeof right === 'number') { this._rightOpponent.setCardCount(right); }
  }

  // Why: the controls-lock is only meant to defer phase TRANSITIONS until the
  // trick-resolve animation finishes (so RoundSummaryScreen doesn't replace
  // TrickPlayView mid-flight). Same-phase re-renders are always safe — they
  // reuse the existing view and just update disabled-state etc. Blocking them
  // would freeze the UI in whatever state it had when the lock engaged.
  _canMountNow(gameStatus) {
    if (!this._isControlsLocked) { return true; }
    const incomingPhase = gameStatus?.phase ?? null;
    return incomingPhase != null && incomingPhase === this._lastMountedPhase;
  }

  get cardsById() {
    return this._cardsById;
  }

  get isControlsLocked() {
    return this._isControlsLocked;
  }

  setControlsLocked(isLocked) {
    const wasLocked = this._isControlsLocked;
    this._isControlsLocked = isLocked;
    if (wasLocked && !isLocked && this._pendingMountStatus) {
      const status = this._pendingMountStatus;
      this._pendingMountStatus = null;
      this._controls.mountForPhase(status);
      this._lastMountedPhase = status.phase;
    }
  }

  flashPlayer(playerId) {
    const el = this._elForSeat(this._seatOf(playerId));
    if (!el) {return;}
    el.classList.add('bid-flash');
    this._antlion.schedule(FLASH_DURATION_MS, () => el.classList.remove('bid-flash'));
  }

  setBidAction(playerId, amount) {
    this._setPlayerLastAction(playerId, `bid ${amount}`);
  }

  setPassAction(playerId) {
    this._setPlayerLastAction(playerId, 'passed');
  }

  _setPlayerLastAction(playerId, text) {
    this._setLastActionForSeat(this._seatOf(playerId), text);
  }

  // Updates the "Connection lost…" indicator for an opponent (FR-021).
  setPlayerDisconnected(playerId, disconnected) {
    this._opponentForSeat(this._seatOf(playerId))?.setDisconnected(disconnected);
  }

  // Reverts optimistic UI applied before server confirmation (e.g. fading a card
  // marked for exchange-pass). Called when an action is rejected.
  revertOptimisticHand() {
    this._handView.clearLeavingMarks();
  }

  // Inserts a card into the viewer's hand — called when the viewer is the recipient
  // of an exchange pass (FR-019). The new card is briefly highlighted.
  addCardToHand(card) {
    this._handView.addCard(card);
  }

  // Removes a card from the viewer's hand when the server confirms it was played.
  // No-op when the player who played isn't the viewer (we don't track opponent hand identities).
  handlePlayedCard(playerSeat, cardId) {
    if (playerSeat !== this._seats?.self) { return; }
    this._handView.removeCard(cardId);
  }

  // Forwarded to the active TrickPlayView so the centre-flight animation can capture
  // the just-played card's seat + cardId BEFORE the post-resolve snapshot lands.
  notifyCardPlayed(playerSeat, cardId) {
    this._controls.notifyCardPlayed(playerSeat, cardId);
  }

  // Hides the table/controls and shows the round-ready (or aborted) screen.
  showRoundReady(mode, context, onBack) {
    this._tableEl.classList.add('hidden');
    this._controlsEl.classList.add('hidden');
    this._controlsEl.textContent = '';
    this._controls.tearDownAll();
    this._sellSubPhase = null;
    this._handView.setSelectionMode(false);

    // Destroy any prior screen first; back-to-back round-end events would
    // otherwise orphan its DOM nodes and Antlion listeners until antlion.stop().
    this._roundReadyScreen?.destroy();
    this._roundReadyScreen = new RoundReadyScreen(
      this._container,
      this._antlion,
      { mode, context },
      () => {
        this._roundReadyScreen?.destroy();
        this._roundReadyScreen = null;
        onBack();
      },
    );
  }

  // Called by GameScreenControls when the player clicks "Back to Lobby" on the
  // round summary screen. Emits an antlion event so the app can handle navigation.
  _onBackToLobby() {
    this._antlion.emit('round-summary-back', {});
  }

  _clearLastAction() {
    this._lastActionEl.textContent = '';
    this._lastActionEl.classList.add('hidden');
    this._leftOpponent.setLastAction('');
    this._rightOpponent.setLastAction('');
  }

  _startDealAnimation(sequence, opponentHandSizes = {}) {
    // A rapid round restart or snapshot resync can land here while a previous
    // deal is mid-flight; cancel it so its completion callback doesn't fire
    // against the freshly-reset cardsById/hand state.
    if (this._dealAnimation) {
      this._dealAnimation.cancel();
      this._dealAnimation = null;
    }
    this._talonCardIds = sequence.filter(s => s.to === 'talon').map(s => s.id);
    this._isControlsLocked = true;
    const animation = new DealAnimation(
      this._antlion, sequence, this._cardsById, this._seats.self, this._cardTable,
      () => {
        this._dealAnimation = null;
        this._tableEl.querySelectorAll('.card-sprite').forEach(el => el.remove());
        // Why: when bidding resolves before this completion fires (slow tabs, accumulated
        // jank), talon_absorbed already added the talon identities to cardsById and called
        // setHand(10). Filtering talon out here would shrink the hand back to 7, leaving
        // the declarer's client with cards the server thinks they hold but cannot see
        // (causing trick-play deadlock). cardsById only ever contains cards the viewer is
        // authorized to see, so passing it through unfiltered is always safe.
        this._handView.setHand(Object.values(this._cardsById));
        // Talon stays face-down during bidding; declarer reveals it on take
        this._talonView.setFaceDownCount(this._talonCardIds.length);
        this._leftOpponent.setCardCount(opponentHandSizes[this._seats.left] ?? OPPONENT_DEFAULT_HAND);
        this._rightOpponent.setCardCount(opponentHandSizes[this._seats.right] ?? OPPONENT_DEFAULT_HAND);
        this.setControlsLocked(false);
        if (this._lastGameStatus && this._pendingMountStatus !== this._lastGameStatus) {
          this._controls.mountForPhase(this._lastGameStatus);
          this._lastMountedPhase = this._lastGameStatus.phase;
        }
      },
    );
    this._dealAnimation = animation;
    animation.start(this._tableEl);
  }

  // Why: round stats only exist during trick-play/round-summary (roundPoints is
  // null otherwise). Driving self + both opponents from the same view-model keeps
  // the three seat displays consistent on every render.
  _renderRoundStats(gameStatus) {
    const points = gameStatus.roundPoints;
    if (points == null || !this._seats) {
      this._selfStatsEl.classList.add('hidden');
      this._leftOpponent.setRoundStats(null, null);
      this._rightOpponent.setRoundStats(null, null);
      return;
    }
    const counts = gameStatus.collectedTrickCounts ?? { 0: 0, 1: 0, 2: 0 };
    const { self, left, right } = this._seats;
    this._selfStatsEl.textContent = formatRoundStats(counts[self], points[self]);
    this._selfStatsEl.classList.remove('hidden');
    this._leftOpponent.setRoundStats(counts[left] ?? 0, points[left] ?? 0);
    this._rightOpponent.setRoundStats(counts[right] ?? 0, points[right] ?? 0);
  }

  _renderStatus(gameStatus) {
    this._statusBar.render(gameStatus, this._sellWinnerNickname);
    if (this._seats) {
      this._scoreboard.render(
        gameStatus.scoreHistory ?? [],
        gameStatus.cumulativeScores ?? { 0: 0, 1: 0, 2: 0 },
        this._seats,
      );
    }
    this._renderRoundStats(gameStatus);
    if (this._statusOverride) { return; }
    const { text, isActive } = computeStatusText(gameStatus, {
      viewerIsNewDeclarer: this._viewerIsNewDeclarer,
      sellSubPhase: this._sellSubPhase,
    });
    this._statusBox.setText(text, isActive);
  }

  setStatusOverride(text, durationMs) {
    if (this._statusOverrideScheduleId != null) {
      this._antlion.cancelScheduled?.(this._statusOverrideScheduleId);
      this._statusOverrideScheduleId = null;
    }
    this._statusOverride = { text };
    this._statusBox.setText(text, true);
    this._statusOverrideScheduleId = this._antlion.schedule(durationMs, () => {
      this._statusOverrideScheduleId = null;
      this._statusOverride = null;
      if (this._lastGameStatus) { this._renderStatus(this._lastGameStatus); }
    });
  }

  playerNicknameForSeat(seat) {
    return this._seats?.players.find((p) => p.seat === seat)?.nickname ?? null;
  }

  // FR-003: open the blocking four-nines modal. `alreadyAcknowledged` restores the
  // sticky waiting-state for a player reconnecting after they had pressed it (FR-010).
  showFourNinesPrompt(nickname, amount, alreadyAcknowledged = false) {
    this._fourNinesPrompt.show(nickname, amount);
    if (alreadyAcknowledged) { this._fourNinesPrompt.markAcknowledged(); }
  }

  updateFourNinesProgress(acknowledgedSeats) {
    this._fourNinesPrompt.setProgress((acknowledgedSeats ?? []).length);
  }

  hideFourNinesPrompt() {
    this._fourNinesPrompt.hide();
  }

  // FR-018: reflect the mid-round +100 cumulative bump immediately on
  // four_nines_awarded (the message carries post-bonus cumulative scores but no
  // full view-model), re-rendering the status bar and scoreboard.
  applyCumulativeBump(cumulativeScores) {
    if (!cumulativeScores || !this._lastGameStatus) { return; }
    this._lastGameStatus = { ...this._lastGameStatus, cumulativeScores };
    this._renderStatus(this._lastGameStatus);
  }
}

export default GameScreen;
