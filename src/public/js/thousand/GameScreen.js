// ============================================================
// GameScreen — container for the in-round game view
// ============================================================

import StatusBar from './StatusBar.js';
import CardTable from './CardTable.js';
import HandView from './HandView.js';
import OpponentView from './OpponentView.js';
import TalonView from './TalonView.js';

class GameScreen {
  constructor(antlion, container) {
    this._antlion = antlion;
    this._container = container;
    this._cardsById = {};
    this._seats = null;
    this._controlsLocked = false;

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

    this._statusBar = new StatusBar(statusBarEl);
    this._cardTable = new CardTable(antlion, tableEl);
    this._handView = new HandView(handEl);
    this._leftOpponent = new OpponentView(leftEl);
    this._rightOpponent = new OpponentView(rightEl);
    this._talonView = new TalonView(talonEl);
  }

  // Called on round_started; seeds cardsById and lays out seat assignments.
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

    this.updateStatus(msg.gameStatus);
  }

  // Called on every phase_changed, bid_accepted, pass_accepted, etc.
  updateStatus(gameStatus) {
    this._statusBar.render(gameStatus);
    this._mountControlsForPhase(gameStatus);
  }

  // Exposes the cardsById map to animators and sub-controllers
  get cardsById() {
    return this._cardsById;
  }

  // Controls-locked flag: set true during DealAnimation (FR-024); cleared on complete
  get controlsLocked() {
    return this._controlsLocked;
  }

  setControlsLocked(locked) {
    this._controlsLocked = locked;
  }

  _mountControlsForPhase(gameStatus) {
    // TODO T031/T032 (US1): mount BidControls when phase === 'Bidding'
    // TODO T051 (US2): mount DeclarerDecisionControls when phase === 'Declarer deciding'
    // TODO T069 (US3): mount SellSelectionControls / SellBidControls when phase === 'Selling'
    // TODO T052 (US2): mount RoundReadyScreen when phase === 'Round ready to play' or 'Round aborted'
    void gameStatus;
  }
}

export default GameScreen;
