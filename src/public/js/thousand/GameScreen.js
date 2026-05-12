// ============================================================
// GameScreen — container for the in-round game view
// ============================================================

import StatusBar from './StatusBar.js';
import CardTable from './CardTable.js';
import HandView from './HandView.js';
import OpponentView from './OpponentView.js';
import TalonView from './TalonView.js';
import DealAnimation from './DealAnimation.js';
import BidControls from './BidControls.js';

class GameScreen {
  constructor(antlion, container, dispatcher) {
    this._antlion = antlion;
    this._container = container;
    this._dispatcher = dispatcher;
    this._cardsById = {};
    this._seats = null;
    this._controlsLocked = false;
    this._lastGameStatus = null;
    this._bidControls = null;

    const statusBarEl = document.createElement('div');
    const tableEl = document.createElement('div');
    tableEl.className = 'game-table';
    const leftEl = document.createElement('div');
    const talonEl = document.createElement('div');
    const rightEl = document.createElement('div');
    const handEl = document.createElement('div');
    this._controlsEl = document.createElement('div');
    this._controlsEl.className = 'game-controls';

    tableEl.append(leftEl, talonEl, rightEl, handEl);
    container.append(statusBarEl, tableEl, this._controlsEl);

    this._tableEl = tableEl;
    this._leftEl = leftEl;
    this._rightEl = rightEl;
    this._handEl = handEl;

    this._statusBar = new StatusBar(statusBarEl);
    this._cardTable = new CardTable(antlion, tableEl);
    this._handView = new HandView(handEl);
    this._leftOpponent = new OpponentView(leftEl);
    this._rightOpponent = new OpponentView(rightEl);
    this._talonView = new TalonView(talonEl);
  }

  // Called on round_started; seeds cardsById, lays out seats, starts the deal animation.
  init(msg) {
    this._seats = msg.seats;
    this._cardsById = {};

    for (const step of msg.dealSequence) {
      if (step.rank && step.suit) {
        this._cardsById[step.id] = { id: step.id, rank: step.rank, suit: step.suit };
      }
    }

    const leftPlayer = msg.seats.players.find((p) => p.seat === msg.seats.left);
    const rightPlayer = msg.seats.players.find((p) => p.seat === msg.seats.right);
    if (leftPlayer) this._leftOpponent.setNickname(leftPlayer.nickname);
    if (rightPlayer) this._rightOpponent.setNickname(rightPlayer.nickname);

    this._controlsLocked = true;
    this._lastGameStatus = msg.gameStatus;

    const animation = new DealAnimation(
      this._antlion,
      msg.dealSequence,
      this._cardsById,
      msg.seats.self,
      this._cardTable,
      () => {
        this._controlsLocked = false;
        if (this._lastGameStatus) this._mountControlsForPhase(this._lastGameStatus);
      },
    );
    animation.start(this._tableEl);

    this._statusBar.render(msg.gameStatus);
  }

  // Called on every phase_changed, bid_accepted, pass_accepted, etc.
  updateStatus(gameStatus) {
    this._lastGameStatus = gameStatus;
    this._statusBar.render(gameStatus);
    if (!this._controlsLocked) {
      this._mountControlsForPhase(gameStatus);
    }
  }

  // Exposes the cardsById map to animators and sub-controllers
  get cardsById() {
    return this._cardsById;
  }

  get controlsLocked() {
    return this._controlsLocked;
  }

  setControlsLocked(locked) {
    this._controlsLocked = locked;
  }

  // Adds a brief highlight ring to the seat that just bid or passed.
  flashPlayer(playerId) {
    if (!this._seats) return;
    const player = this._seats.players.find((p) => p.playerId === playerId);
    if (!player) return;

    let el;
    if (player.seat === this._seats.self) {
      el = this._handEl;
    } else if (player.seat === this._seats.left) {
      el = this._leftEl;
    } else {
      el = this._rightEl;
    }

    el.classList.add('bid-flash');
    this._antlion.schedule(600, () => el.classList.remove('bid-flash'));
  }

  _mountControlsForPhase(gameStatus) {
    const { phase, viewerIsActive, passedPlayers } = gameStatus;

    if (phase === 'Bidding') {
      if (!this._bidControls) {
        this._controlsEl.textContent = '';
        this._bidControls = new BidControls(this._controlsEl, this._antlion, this._dispatcher);
      }
      this._bidControls.setCurrentHighBid(gameStatus.currentHighBid);

      const viewerPlayer = this._seats?.players.find((p) => p.seat === this._seats.self);
      const viewerNickname = viewerPlayer?.nickname;
      const viewerHasPassed = viewerNickname
        ? (passedPlayers ?? []).includes(viewerNickname)
        : false;

      this._bidControls.setActiveState({
        isActiveBidder: viewerIsActive,
        isEligible: !viewerHasPassed,
      });
    } else if (this._bidControls) {
      this._controlsEl.textContent = '';
      this._bidControls = null;
    }

    // TODO T051 (US2): mount DeclarerDecisionControls when phase === 'Declarer deciding'
    // TODO T069 (US3): mount SellSelectionControls / SellBidControls when phase === 'Selling'
    // TODO T052 (US2): mount RoundReadyScreen when phase === 'Round ready to play' or 'Round aborted'
  }
}

export default GameScreen;
