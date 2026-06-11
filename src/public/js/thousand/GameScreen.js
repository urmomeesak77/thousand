// ============================================================
// GameScreen — container for the in-round game view
// ============================================================

import StatusBar from './StatusBar.js';
import ScoreboardPanel from './ScoreboardPanel.js';
import HistoryPanel from './HistoryPanel.js';
import GameStatusBox from './GameStatusBox.js';
import TrumpBox from './TrumpBox.js';
import CardTable from './CardTable.js';
import HandView from './HandView.js';
import OpponentView from './OpponentView.js';
import TalonView from './TalonView.js';
import DealAnimation from './DealAnimation.js';
import RoundReadyScreen from './RoundReadyScreen.js';
import GameScreenControls from './GameScreenControls.js';
import SellPhaseView from './SellPhaseView.js';
import FourNinesPrompt from './FourNinesPrompt.js';
import MarriageNotice from './MarriageNotice.js';
import TurnReminder from './TurnReminder.js';
import { computeStatusText } from './statusText.js';
import { formatRoundStats } from './roundStatsText.js';

const FLASH_DURATION_MS = 600;
const OPPONENT_DEFAULT_HAND = 7;
const ACTIVE_TRUMP_PHASES = new Set([
  'Bidding', 'Declarer deciding', 'Selling', 'Card exchange', 'Trick play',
]);

class GameScreen {
  constructor(antlion, container, dispatcher, i18n) {
    this._antlion = antlion;
    this._container = container;
    this._dispatcher = dispatcher;
    this._i18n = i18n;
    // Bound translate function handed to sub-views and pure formatters.
    this._t = (key, params) => i18n.t(key, params);
    this._cardsById = {};
    this._seats = null;
    this._isControlsLocked = false;
    this._lastGameStatus = null;
    // Tracks the active seat across status renders so a change fires exactly one
    // turn cue (independent of _lastGameStatus, which is reassigned before render).
    this._lastActiveSeat = null;
    // Replays the wakeup cue every 30s while it is the viewer's turn (FR turn-reminder).
    this._turnReminder = new TurnReminder(antlion);
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
    this._fourNinesPrompt = new FourNinesPrompt(
      this._fourNinesEl, { antlion, dispatcher, t: this._t },
    );

    // Auto-closing notice shown to opponents when someone declares a marriage.
    // GameScreen-lifetime singleton — its single Antlion input persists across
    // rounds, just like the four-nines modal above.
    this._marriageNotice = new MarriageNotice(this._marriageNoticeEl, { antlion, t: this._t });

    // Live language switch (FR-005): re-render every visible label from retained
    // state — no round action, no socket, no game-state change.
    antlion.onInput('language:changed', () => this._onLanguageChanged());
  }

  // Re-render the in-round UI from already-held state when the language changes.
  // Status bar / trump box / scoreboard / history / round stats / status box all
  // refresh via _renderStatus; the phase controls are torn down and re-mounted so
  // their button labels pick up the new catalog. Skipped while controls are
  // locked (mid-animation) — the next render after unlock uses the new language.
  _onLanguageChanged() {
    if (!this._lastGameStatus) { return; }
    this._renderStatus(this._lastGameStatus);
    if (!this._isControlsLocked) {
      this._controls.tearDownAll();
      this._controls.mountForPhase(this._lastGameStatus);
    }
  }

  _buildDom(antlion, container) {
    const statusBarEl = document.createElement('div');
    const tableEl = document.createElement('div');
    tableEl.className = 'game-table';
    const leftEl = document.createElement('div');
    const acrossEl = document.createElement('div');
    const centerColEl = document.createElement('div');
    centerColEl.className = 'talon-col';
    const trumpBoxEl = document.createElement('div');
    const statusBoxEl = document.createElement('div');
    const talonEl = document.createElement('div');
    centerColEl.append(trumpBoxEl, statusBoxEl, talonEl);
    const rightEl = document.createElement('div');
    const handEl = document.createElement('div');
    const selfStatsEl = document.createElement('div');
    selfStatsEl.className = 'self-round-stats hidden';
    this._controlsEl = document.createElement('div');
    this._controlsEl.className = 'game-controls';

    const lastActionEl = document.createElement('div');
    lastActionEl.className = 'last-action-box hidden';
    this._lastActionEl = lastActionEl;

    tableEl.append(leftEl, acrossEl, centerColEl, rightEl, lastActionEl, selfStatsEl, handEl);
    const scoreboardEl = document.createElement('div');
    const historyEl = document.createElement('div');
    const fourNinesEl = document.createElement('div');
    fourNinesEl.style.display = 'none';
    const marriageNoticeEl = document.createElement('div');
    marriageNoticeEl.style.display = 'none';
    container.append(
      statusBarEl, tableEl, this._controlsEl, scoreboardEl, historyEl, fourNinesEl, marriageNoticeEl,
    );
    this._scoreboard = new ScoreboardPanel(scoreboardEl, antlion, this._t);
    this._history = new HistoryPanel(historyEl, antlion, this._t);
    this._fourNinesEl = fourNinesEl;
    this._marriageNoticeEl = marriageNoticeEl;

    this._tableEl = tableEl;
    this._leftEl = leftEl;
    this._acrossEl = acrossEl;
    this._rightEl = rightEl;
    this._handEl = handEl;
    this._selfStatsEl = selfStatsEl;
    this._talonEl = talonEl;

    this._statusBar = new StatusBar(statusBarEl, this._t);
    this._trumpBox = new TrumpBox(trumpBoxEl, this._t);
    this._statusBox = new GameStatusBox(statusBoxEl);
    this._cardTable = new CardTable(antlion, tableEl);
    this._handView = new HandView(handEl, antlion);
    // Three opponent views keyed by clockwise position. The 'across' view only
    // maps to a seat in 4-player rooms (seats.across is undefined for 3-player),
    // so it stays empty and hidden otherwise.
    this._leftOpponent = new OpponentView(leftEl, this._t);
    this._acrossOpponent = new OpponentView(acrossEl, this._t);
    this._rightOpponent = new OpponentView(rightEl, this._t);
    // Distinguishing hook so game.css can hide/place the 4th seat. Added AFTER
    // OpponentView's constructor (which sets 'opponent-view' on this container,
    // overwriting className) so the class survives; OpponentView only mutates
    // textContent on later renders, never className again.
    acrossEl.classList.add('across-zone');
    this._talonView = new TalonView(talonEl);
  }

  // Toggles the table's player-count modifier so game.css can place the 4th
  // (across) seat and widen the trick-centre only in 4-player rooms; 3-player
  // keeps the default layout untouched. Called wherever _seats is assigned.
  _applyPlayerCountLayout() {
    const isFour = this._seats?.across != null;
    this._tableEl.classList.toggle('game-table--four', isFour);
  }

  // Drives every per-opponent fan-out below. Across is absent in 3-player, so
  // filtering on a present seat collapses cleanly to two opponents.
  _opponents() {
    const s = this._seats;
    if (!s) { return []; }
    return [
      { view: this._leftOpponent, seat: s.left },
      { view: this._acrossOpponent, seat: s.across },
      { view: this._rightOpponent, seat: s.right },
    ].filter((o) => o.seat != null);
  }

  // Exposed to TrickPlayView so it can mount its centre cards into the talon area
  // and look up source elements for the seat-to-centre flight animation.
  get trickCenterEl() { return this._talonEl; }
  getSeatEl(seat) { return this._elForSeat(seat); }

  _seatOf(playerId) {
    return this._seats?.players.find((p) => p.playerId === playerId)?.seat ?? null;
  }

  _opponentForSeat(seat) {
    if (seat == null) {return null;}
    return this._opponents().find((o) => o.seat === seat)?.view ?? null;
  }

  _elForSeat(seat) {
    if (!this._seats || seat == null) {return null;}
    if (seat === this._seats.self) {return this._handEl;}
    if (seat === this._seats.left) {return this._leftEl;}
    if (seat === this._seats.across) {return this._acrossEl;}
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
    // Close the previous round's summary (or any lingering controls) before the
    // deal starts — otherwise the deal animation plays behind the still-visible
    // round-summary overlay, which only clears once the deal completes.
    this._controls.tearDownAll();
    this._cardTable.refresh();
    this._seats = msg.seats;
    this._applyPlayerCountLayout();
    this._cardsById = {};
    this._viewerIsNewDeclarer = false;
    this._sellWinnerNickname = null;
    this._clearLastAction();
    this._handView.setHand([]);
    this._talonView.clear();
    for (const o of this._opponents()) { o.view.setCardCount(0); }

    this._tableEl.classList.remove('hidden');
    this._controlsEl.classList.remove('hidden');

    for (const step of msg.dealSequence) {
      if (step.rank && step.suit) {
        this._cardsById[step.id] = { id: step.id, rank: step.rank, suit: step.suit };
      }
    }

    this._setOpponentNicknames(msg.seats);

    this._lastGameStatus = msg.gameStatus;
    this._startDealAnimation(msg.dealSequence);
    this._renderStatus(msg.gameStatus);
  }

  // Called on round_state_snapshot; rebuilds the layout, playing the deal animation if no
  // bids have been placed yet (server includes dealSequence in that case).
  initFromSnapshot(msg) {
    this._cardTable.refresh();
    this._seats = msg.seats;
    this._applyPlayerCountLayout();
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

    for (const o of this._opponents()) {
      o.view.setCardCount(msg.opponentHandSizes[o.seat] ?? 0);
    }
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
    for (const o of this._opponents()) {
      const player = seats.players.find((p) => p.seat === o.seat);
      if (player) {
        o.view.setNickname(player.nickname);
        o.view.setIsBot(player.isBot);
      }
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
    for (const o of this._opponents()) {
      const size = sizes[o.seat];
      if (typeof size === 'number') { o.view.setCardCount(size); }
    }
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
    this._setPlayerLastAction(playerId, this._t('game.lastActionBid', { amount }));
  }

  setPassAction(playerId) {
    this._setPlayerLastAction(playerId, this._t('game.lastActionPass'));
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

  // crawl_committed (feature 007): drop the viewer's own committed card from hand
  // (the server echoes it via viewerCrawlCommit; other players' commits stay
  // hidden), then refresh the trick view's placeholders/prompt.
  onCrawlCommitted(msg) {
    const own = msg.gameStatus?.viewerCrawlCommit;
    if (own && typeof own.cardId === 'number') {
      this._handView.removeCard(own.cardId);
    }
    this.updateStatus(msg.gameStatus);
  }

  // crawl_revealed (feature 007): run the reveal/collect animation, then refresh.
  onCrawlRevealed(msg) {
    // Each face-down crawl card turns face-up — one flip cue per revealed card (FR-002).
    for (let i = 0; i < msg.commits.length; i++) { this._antlion.emit('sound:flip'); }
    this._controls.revealCrawl(msg.commits, msg.winnerSeat, msg.gameStatus);
    this.updateStatus(msg.gameStatus);
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
      { mode, context, t: this._t },
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
    for (const o of this._opponents()) { o.view.setLastAction(''); }
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
      this._antlion, sequence, this._cardsById, this._seats.self,
      this._seats.players.length, this._cardTable,
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
        for (const o of this._opponents()) {
          o.view.setCardCount(opponentHandSizes[o.seat] ?? OPPONENT_DEFAULT_HAND);
        }
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
  // null otherwise). Driving self + every present opponent from the same
  // view-model keeps all seat displays consistent on every render.
  _renderRoundStats(gameStatus) {
    const points = gameStatus.roundPoints;
    if (points == null || !this._seats) {
      this._selfStatsEl.classList.add('hidden');
      for (const o of this._opponents()) { o.view.setRoundStats(null, null); }
      return;
    }
    const counts = gameStatus.collectedTrickCounts ?? {};
    this._selfStatsEl.textContent = formatRoundStats(this._t, {
      tricks: counts[this._seats.self] ?? 0,
      points: points[this._seats.self] ?? 0,
    });
    this._selfStatsEl.classList.remove('hidden');
    for (const o of this._opponents()) {
      o.view.setRoundStats(counts[o.seat] ?? 0, points[o.seat] ?? 0);
    }
  }

  _renderStatus(gameStatus) {
    this._emitTurnCueOnChange(gameStatus);
    this._turnReminder.update(gameStatus.viewerIsActive);
    this._trumpBox.render(
      gameStatus.currentTrumpSuit,
      ACTIVE_TRUMP_PHASES.has(gameStatus.phase),
    );
    // playerCount = seat count; lets the bar render count-aware text (FR-011/FR-020)
    const playerCount = this._seats?.players.length ?? 3;
    this._statusBar.render(gameStatus, this._sellWinnerNickname, playerCount);
    if (this._seats) {
      this._scoreboard.render(
        gameStatus.scoreHistory ?? [],
        gameStatus.cumulativeScores ?? {},
        this._seats,
      );
      this._history.render(gameStatus.actionHistory ?? [], this._seats);
    }
    this._renderRoundStats(gameStatus);
    if (this._statusOverride) { return; }
    const { text, isActive } = computeStatusText(this._t, gameStatus, {
      viewerIsNewDeclarer: this._viewerIsNewDeclarer,
      sellSubPhase: this._sellSubPhase,
    });
    this._statusBox.setText(text, isActive);
  }

  // Fire one turn cue when the active player changes to a real seat. All status
  // renders funnel through here, so this is the single de-duplication point (FR-003).
  _emitTurnCueOnChange(gameStatus) {
    const seat = gameStatus.activePlayer?.seat ?? null;
    if (seat !== this._lastActiveSeat && seat !== null) {
      this._antlion.emit('sound:turn');
    }
    this._lastActiveSeat = seat;
  }

  // Disarm the turn reminder when the game screen is abandoned (leave / logout /
  // game over); otherwise no further snapshot would flip viewerIsActive false and
  // the wakeup cue would keep firing in the lobby.
  stopTurnReminder() {
    this._turnReminder.stop();
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

  // Pop an auto-closing notice for opponents when a marriage is declared. The
  // declarer triggered the action themselves, so they are skipped.
  notifyMarriageDeclared(msg) {
    if (this._seats && msg.playerSeat === this._seats.self) { return; }
    this._marriageNotice.show(msg.playerNickname, msg.suit, msg.bonus);
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
