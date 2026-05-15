// ============================================================
// GameScreen — container for the in-round game view
// ============================================================

import StatusBar from './StatusBar.js';
import GameStatusBox from './GameStatusBox.js';
import CardTable from './CardTable.js';
import HandView from './HandView.js';
import OpponentView from './OpponentView.js';
import TalonView from './TalonView.js';
import DealAnimation from './DealAnimation.js';
import RoundReadyScreen from './RoundReadyScreen.js';
import GameScreenControls from './GameScreenControls.js';
import SellPhaseView from './SellPhaseView.js';
import { computeStatusText } from './statusText.js';

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
    this._lastSnapshot = null;
    this._sellSubPhase = null;
    this._exposedCardIds = [];
    this._roundReadyScreen = null;
    this._talonCardIds = [];
    this._viewerIsNewDeclarer = false;
    this._sellWinnerNickname = null;

    this._buildDom(antlion, container);

    this._controls = new GameScreenControls(
      this, antlion, this._controlsEl, this._handView, dispatcher,
    );
    this.sellPhase = new SellPhaseView(this);
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
    this._controlsEl = document.createElement('div');
    this._controlsEl.className = 'game-controls';

    const lastActionEl = document.createElement('div');
    lastActionEl.className = 'last-action-box hidden';
    this._lastActionEl = lastActionEl;

    tableEl.append(leftEl, centerColEl, rightEl, lastActionEl, handEl);
    container.append(statusBarEl, tableEl, this._controlsEl);

    this._tableEl = tableEl;
    this._leftEl = leftEl;
    this._rightEl = rightEl;
    this._handEl = handEl;

    this._statusBar = new StatusBar(statusBarEl);
    this._statusBox = new GameStatusBox(statusBoxEl);
    this._cardTable = new CardTable(antlion, tableEl);
    this._handView = new HandView(handEl, antlion);
    this._leftOpponent = new OpponentView(leftEl);
    this._rightOpponent = new OpponentView(rightEl);
    this._talonView = new TalonView(talonEl);
  }

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
  }

  // Called when a fresh snapshot arrives mid-round (e.g. card exchange or trick play update).
  updateSnapshot(snapshot) {
    this._lastSnapshot = snapshot;
    if (!this._isControlsLocked) {
      this._controls.mountForPhase(this._lastGameStatus ?? snapshot.gameStatus);
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

  // Called on every phase_changed, bid_accepted, pass_accepted, etc.
  updateStatus(gameStatus) {
    this._lastGameStatus = gameStatus;
    this._renderStatus(gameStatus);
    if (!this._isControlsLocked) {
      this._controls.mountForPhase(gameStatus);
    }
  }

  get cardsById() {
    return this._cardsById;
  }

  get isControlsLocked() {
    return this._isControlsLocked;
  }

  setControlsLocked(isLocked) {
    this._isControlsLocked = isLocked;
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

  // Hides the table/controls and shows the round-ready (or aborted) screen.
  showRoundReady(mode, context, onBack) {
    this._tableEl.classList.add('hidden');
    this._controlsEl.classList.add('hidden');
    this._controlsEl.textContent = '';
    this._controls.tearDownAll();
    this._sellSubPhase = null;
    this._handView.setSelectionMode(false);

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
    this._talonCardIds = sequence.filter(s => s.to === 'talon').map(s => s.id);
    this._isControlsLocked = true;
    const animation = new DealAnimation(
      this._antlion, sequence, this._cardsById, this._seats.self, this._cardTable,
      () => {
        this._tableEl.querySelectorAll('.card-sprite').forEach(el => el.remove());
        const selfCards = Object.values(this._cardsById)
          .filter(c => !this._talonCardIds.includes(c.id));
        this._handView.setHand(selfCards);
        // Talon stays face-down during bidding; declarer reveals it on take
        this._talonView.setFaceDownCount(this._talonCardIds.length);
        this._leftOpponent.setCardCount(opponentHandSizes[this._seats.left] ?? OPPONENT_DEFAULT_HAND);
        this._rightOpponent.setCardCount(opponentHandSizes[this._seats.right] ?? OPPONENT_DEFAULT_HAND);
        this._isControlsLocked = false;
        if (this._lastGameStatus) {this._controls.mountForPhase(this._lastGameStatus);}
      },
    );
    animation.start(this._tableEl);
  }

  _renderStatus(gameStatus) {
    this._statusBar.render(gameStatus, this._sellWinnerNickname);
    const { text, isActive } = computeStatusText(gameStatus, {
      viewerIsNewDeclarer: this._viewerIsNewDeclarer,
      sellSubPhase: this._sellSubPhase,
    });
    this._statusBox.setText(text, isActive);
  }
}

export default GameScreen;
