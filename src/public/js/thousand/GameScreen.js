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
import BidControls from './BidControls.js';
import DeclarerDecisionControls from './DeclarerDecisionControls.js';
import SellSelectionControls from './SellSelectionControls.js';
import SellBidControls from './SellBidControls.js';
import RoundReadyScreen from './RoundReadyScreen.js';
import CardSprite from './CardSprite.js';

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
    this._declarerControls = null;
    this._sellSelectionControls = null;
    this._sellBidControls = null;
    this._sellSubPhase = null;
    this._exposedCardIds = [];
    this._roundReadyScreen = null;
    this._talonCardIds = [];
    this._viewerIsNewDeclarer = false;
    this._sellWinnerNickname = null;

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
    if (leftPlayer) this._leftOpponent.setNickname(leftPlayer.nickname);
    if (rightPlayer) this._rightOpponent.setNickname(rightPlayer.nickname);

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
    this._controlsLocked = false;
    this._viewerIsNewDeclarer = false;
    this._sellWinnerNickname = null;
    this._clearLastAction();

    this._tableEl.classList.remove('hidden');
    this._controlsEl.classList.remove('hidden');

    for (const card of msg.myHand) {
      this._cardsById[card.id] = { id: card.id, rank: card.rank, suit: card.suit };
    }
    if (msg.exposed) {
      for (const card of msg.exposed) {
        this._cardsById[card.id] = { id: card.id, rank: card.rank, suit: card.suit };
      }
    }

    const leftPlayer = msg.seats.players.find(p => p.seat === msg.seats.left);
    const rightPlayer = msg.seats.players.find(p => p.seat === msg.seats.right);
    if (leftPlayer) this._leftOpponent.setNickname(leftPlayer.nickname);
    if (rightPlayer) this._rightOpponent.setNickname(rightPlayer.nickname);

    this._renderStatus(msg.gameStatus);
    this._lastGameStatus = msg.gameStatus;

    if (msg.dealSequence) {
      this._startDealAnimation(msg.dealSequence, msg.opponentHandSizes);
      return;
    }

    this._leftOpponent.setCardCount(msg.opponentHandSizes[msg.seats.left] ?? 0);
    this._rightOpponent.setCardCount(msg.opponentHandSizes[msg.seats.right] ?? 0);

    this._handView.setHand(msg.myHand);

    if (msg.exposed && msg.exposed.length > 0) {
      this._talonView.setCards(msg.exposed);
    } else if (msg.talonIds && msg.talonIds.length > 0) {
      this._talonView.setFaceDownCount(msg.talonIds.length);
    } else {
      this._talonView.clear();
    }

    if (msg.gameStatus.phase === 'Selling') {
      if (msg.exposed && msg.exposed.length > 0) {
        this._sellSubPhase = 'bidding';
        this._exposedCardIds = msg.exposedSellCardIds ?? msg.exposed.map(c => c.id);
      } else {
        this._sellSubPhase = 'selection';
      }
    }

    this._mountControlsForPhase(msg.gameStatus);
  }

  // Called on every phase_changed, bid_accepted, pass_accepted, etc.
  updateStatus(gameStatus) {
    this._lastGameStatus = gameStatus;
    this._renderStatus(gameStatus);
    if (!this._controlsLocked) {
      this._mountControlsForPhase(gameStatus);
    }
  }

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

  setBidAction(playerId, amount) {
    this._setPlayerLastAction(playerId, `bid ${amount}`);
  }

  setPassAction(playerId) {
    this._setPlayerLastAction(playerId, 'passed');
  }

  _setPlayerLastAction(playerId, text) {
    if (!this._seats) return;
    const player = this._seats.players.find(p => p.playerId === playerId);
    if (!player) return;
    if (player.seat === this._seats.self) {
      this._lastActionEl.textContent = text;
      this._lastActionEl.classList.remove('hidden');
    } else if (player.seat === this._seats.left) {
      this._leftOpponent.setLastAction(text);
    } else if (player.seat === this._seats.right) {
      this._rightOpponent.setLastAction(text);
    }
  }

  // Animates the 3 talon cards flying into the declarer's hand (FR-023, FR-024).
  absorbTalon(msg) {
    const { declarerId, talonIds, identities, gameStatus } = msg;
    const viewerSeat = this._seats?.self;
    const declarerPlayer = this._seats?.players.find(p => p.playerId === declarerId);
    const declarerSeat = declarerPlayer?.seat;
    const viewerIsDeclarer = viewerSeat === declarerSeat;

    this._renderStatus(gameStatus);
    this._lastGameStatus = gameStatus;
    this._controlsLocked = true;

    // Remove the static talon sprites so they don't stay visible during animation
    this._talonView.clear();

    const talonSlot = this._cardTable.getSlot('talon');
    const slots = this._cardTable.slotsForSeat(viewerSeat);
    const destSlot = slots[declarerSeat] ?? talonSlot;

    this._animateSprites(talonIds, talonSlot, destSlot, () => {
      if (viewerIsDeclarer) {
        if (identities) {
          for (const id of talonIds) {
            const identity = identities[String(id)];
            if (identity) this._cardsById[id] = { id, ...identity };
          }
        }
        this._handView.setHand(Object.values(this._cardsById));
      } else {
        for (const id of talonIds) {
          delete this._cardsById[id];
        }
        if (declarerSeat === this._seats?.left) {
          this._leftOpponent.setCardCount(10);
        } else if (declarerSeat === this._seats?.right) {
          this._rightOpponent.setCardCount(10);
        }
      }
      this._controlsLocked = false;
      this._mountControlsForPhase(this._lastGameStatus);
    });
  }

  // Updates the "Connection lost…" indicator for an opponent (FR-021).
  setPlayerDisconnected(playerId, disconnected) {
    if (!this._seats) return;
    const player = this._seats.players.find(p => p.playerId === playerId);
    if (!player) return;
    if (player.seat === this._seats.left) {
      this._leftOpponent.setDisconnected(disconnected);
    } else if (player.seat === this._seats.right) {
      this._rightOpponent.setDisconnected(disconnected);
    }
  }

  // Hides the table/controls and shows the round-ready (or aborted) screen.
  showRoundReady(mode, context, onBack) {
    this._tableEl.classList.add('hidden');
    this._controlsEl.classList.add('hidden');
    this._controlsEl.textContent = '';
    this._bidControls = null;
    this._declarerControls = null;
    this._sellSelectionControls = null;
    this._sellBidControls = null;
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

  _clearLastAction() {
    this._lastActionEl.textContent = '';
    this._lastActionEl.classList.add('hidden');
    this._leftOpponent.setLastAction('');
    this._rightOpponent.setLastAction('');
  }

  _dropControl(name) {
    if (!this[name]) return false;
    this[name] = null;
    return true;
  }

  _tearDownAllControls() {
    const hadAny = this._bidControls || this._declarerControls
      || this._sellSelectionControls || this._sellBidControls
      || this._controlsEl.querySelector('.waiting');
    this._bidControls = null;
    this._declarerControls = null;
    this._sellSelectionControls = null;
    this._sellBidControls = null;
    if (hadAny) this._controlsEl.textContent = '';
  }

  _mountControlsForPhase(gameStatus) {
    const { phase, viewerIsActive, passedPlayers } = gameStatus;

    const sellBiddingActive = phase === 'Selling' && this._sellSubPhase === 'bidding';
    if (phase !== 'Bidding' && !sellBiddingActive) this._clearLastAction();

    if (phase === 'Bidding') {
      if (this._dropControl('_declarerControls')) this._controlsEl.textContent = '';
      if (!this._bidControls) {
        this._controlsEl.textContent = '';
        this._bidControls = new BidControls(this._controlsEl, this._antlion, this._dispatcher);
      }
      this._bidControls.setCurrentHighBid(gameStatus.currentHighBid);
      const viewerPlayer = this._seats?.players.find((p) => p.seat === this._seats.self);
      const viewerNickname = viewerPlayer?.nickname;
      const viewerHasPassed = viewerNickname ? (passedPlayers ?? []).includes(viewerNickname) : false;
      this._bidControls.setActiveState({ isActiveBidder: viewerIsActive, isEligible: !viewerHasPassed });

    } else if (phase === 'Declarer deciding') {
      if (this._dropControl('_bidControls')) this._controlsEl.textContent = '';
      if (this._sellSelectionControls) {
        this._handView.setSelectionMode(false);
        this._sellSelectionControls = null;
      }
      this._sellBidControls = null;
      this._sellSubPhase = null;

      if (viewerIsActive) {
        if (!this._declarerControls) {
          this._controlsEl.textContent = '';
          this._declarerControls = new DeclarerDecisionControls(
            this._controlsEl, this._antlion, this._dispatcher,
          );
        }
        this._declarerControls.setMode(this._declarerMode(gameStatus));
      } else {
        if (this._dropControl('_declarerControls')) this._controlsEl.textContent = '';
        const declarerNickname = gameStatus.declarer?.nickname ?? 'declarer';
        let waitDiv = this._controlsEl.querySelector('.waiting');
        if (!waitDiv) {
          this._controlsEl.textContent = '';
          waitDiv = document.createElement('div');
          waitDiv.className = 'waiting';
          this._controlsEl.appendChild(waitDiv);
        }
        waitDiv.textContent = `Waiting for ${declarerNickname}…`;
      }

    } else if (phase === 'Selling') {
      if (this._dropControl('_bidControls')) this._controlsEl.textContent = '';
      if (this._dropControl('_declarerControls')) this._controlsEl.textContent = '';
      if (this._sellSubPhase) this._mountControlsForSelling(gameStatus);

    } else {
      this._tearDownAllControls();
    }
  }

  // Returns the correct mode for DeclarerDecisionControls based on game state.
  _declarerMode(gameStatus) {
    const { sellAttempt } = gameStatus;
    if (sellAttempt === 3) return 'sell-disabled';
    if (this._viewerIsNewDeclarer) return 'sell-hidden';
    return 'full';
  }

  // Called from ThousandApp on sell_started — puts the declarer into card-selection mode.
  enterSellSelection(gameStatus) {
    this._sellSubPhase = 'selection';
    this._sellWinnerNickname = null;
    this._lastGameStatus = gameStatus;
    this._renderStatus(gameStatus);
    if (!this._controlsLocked) this._mountControlsForPhase(gameStatus);
  }

  // Called from ThousandApp on sell_exposed — animates the 3 selected cards to the centre.
  enterSellBidding(msg) {
    const { declarerId, exposedIds, identities, gameStatus } = msg;

    if (identities) {
      for (const id of exposedIds) {
        const ident = identities[String(id)];
        if (ident) this._cardsById[id] = { id, ...ident };
      }
    }

    this._exposedCardIds = [...exposedIds];
    this._sellSubPhase = 'bidding';
    this._renderStatus(gameStatus);
    this._lastGameStatus = gameStatus;
    this._controlsLocked = true;

    this._handView.setSelectionMode(false);
    this._sellSelectionControls = null;
    this._controlsEl.textContent = '';

    const viewerSeat = this._seats?.self;
    const declarerPlayer = this._seats?.players.find(p => p.playerId === declarerId);
    const declarerSeat = declarerPlayer?.seat;
    const viewerIsDeclarer = viewerSeat === declarerSeat;

    if (viewerIsDeclarer) {
      const exposed = new Set(exposedIds);
      this._handView.setHand(Object.values(this._cardsById).filter(c => !exposed.has(c.id)));
    } else {
      if (declarerSeat === this._seats?.left) this._leftOpponent.setCardCount(7);
      else if (declarerSeat === this._seats?.right) this._rightOpponent.setCardCount(7);
    }

    const slots = this._cardTable.slotsForSeat(viewerSeat);
    const fromSlot = (declarerSeat !== undefined ? slots[declarerSeat] : null) ?? this._cardTable.getSlot('talon');
    const toSlot = this._cardTable.getSlot('talon');

    this._animateSprites(exposedIds, fromSlot, toSlot, () => {
      const talonCards = exposedIds.map(id => this._cardsById[id]).filter(Boolean);
      this._talonView.setCards(talonCards);
      this._controlsLocked = false;
      this._mountControlsForPhase(this._lastGameStatus);
    });
  }

  // Called from ThousandApp on sell_resolved — animates the 3 centre cards to their destination.
  exitSelling(msg) {
    const { outcome, oldDeclarerId, newDeclarerId, exposedIds, gameStatus } = msg;
    const viewerSeat = this._seats?.self;

    this._renderStatus(gameStatus);
    this._lastGameStatus = gameStatus;
    this._controlsLocked = true;

    this._handView.setSelectionMode(false);
    if (this._sellBidControls) { this._controlsEl.textContent = ''; this._sellBidControls = null; }
    if (this._sellSelectionControls) { this._controlsEl.textContent = ''; this._sellSelectionControls = null; }

    const oldDeclarerSeat = this._seats?.players.find(p => p.playerId === oldDeclarerId)?.seat;
    const newDeclarerSeat = newDeclarerId
      ? this._seats?.players.find(p => p.playerId === newDeclarerId)?.seat
      : undefined;

    const slots = this._cardTable.slotsForSeat(viewerSeat);
    const talonSlot = this._cardTable.getSlot('talon');
    const destSeat = outcome === 'sold' ? newDeclarerSeat : oldDeclarerSeat;
    const destSlot = (destSeat !== undefined ? slots[destSeat] : null) ?? talonSlot;

    this._talonView.clear();

    this._animateSprites(exposedIds, talonSlot, destSlot, () => {
      this._applySellResolved(outcome, exposedIds, oldDeclarerSeat, newDeclarerSeat, viewerSeat);
      this._sellSubPhase = null;
      this._exposedCardIds = [];
      this._controlsLocked = false;
      this._renderStatus(this._lastGameStatus);
      this._mountControlsForPhase(this._lastGameStatus);
    });
  }

  _applySellResolved(outcome, exposedIds, oldDeclarerSeat, newDeclarerSeat, viewerSeat) {
    if (outcome === 'returned') {
      if (viewerSeat === oldDeclarerSeat) {
        this._handView.setHand(Object.values(this._cardsById));
      } else {
        for (const id of exposedIds) delete this._cardsById[id];
        if (oldDeclarerSeat === this._seats?.left) this._leftOpponent.setCardCount(10);
        else if (oldDeclarerSeat === this._seats?.right) this._rightOpponent.setCardCount(10);
      }
    } else if (outcome === 'sold') {
      this._viewerIsNewDeclarer = (viewerSeat === newDeclarerSeat);
      const winnerPlayer = this._seats?.players.find(p => p.seat === newDeclarerSeat);
      const winnerNickname = winnerPlayer?.nickname;
      const winnerAmount = this._lastGameStatus?.currentHighBid;
      this._sellWinnerNickname = winnerNickname
        ? `${winnerNickname}${winnerAmount != null ? ` (${winnerAmount})` : ''}`
        : null;
      if (viewerSeat === newDeclarerSeat) {
        this._handView.setHand(Object.values(this._cardsById));
      } else {
        for (const id of exposedIds) delete this._cardsById[id];
        if (viewerSeat === oldDeclarerSeat) {
          this._handView.setHand(Object.values(this._cardsById));
        }
      }
      if (newDeclarerSeat === this._seats?.left) this._leftOpponent.setCardCount(10);
      else if (newDeclarerSeat === this._seats?.right) this._rightOpponent.setCardCount(10);
      if (oldDeclarerSeat === this._seats?.left) this._leftOpponent.setCardCount(7);
      else if (oldDeclarerSeat === this._seats?.right) this._rightOpponent.setCardCount(7);
    }
  }

  // Mounts selling controls for selection or bidding sub-phase.
  _mountControlsForSelling(gameStatus) {
    const { viewerIsActive, passedPlayers } = gameStatus;

    if (this._sellSubPhase === 'selection') {
      if (viewerIsActive) {
        if (this._sellSelectionControls) return;
        this._controlsEl.textContent = '';
        this._handView.setSelectionMode(true);
        this._sellSelectionControls = new SellSelectionControls(
          this._controlsEl, this._antlion, this._dispatcher,
        );
        this._sellSelectionControls.show();
      } else {
        if (this._controlsEl.querySelector('.waiting')) return;
        this._controlsEl.textContent = '';
        const w = document.createElement('div');
        w.className = 'waiting';
        w.textContent = `Waiting for ${gameStatus.declarer?.nickname ?? 'declarer'} to choose cards…`;
        this._controlsEl.appendChild(w);
      }
    } else if (this._sellSubPhase === 'bidding') {
      if (!this._sellBidControls) {
        this._controlsEl.textContent = '';
        this._sellBidControls = new SellBidControls(this._controlsEl, this._antlion, this._dispatcher);
      }
      this._sellBidControls.setCurrentHighBid(gameStatus.currentHighBid ?? 100);

      const viewerPlayer = this._seats?.players.find(p => p.seat === this._seats.self);
      const viewerNickname = viewerPlayer?.nickname;
      const viewerIsOriginalDeclarer = viewerNickname === gameStatus.declarer?.nickname;
      const viewerHasPassed = (passedPlayers ?? []).includes(viewerNickname);

      this._sellBidControls.setActiveState({
        isActiveSeller: viewerIsActive && !viewerIsOriginalDeclarer,
        isEligible: !viewerIsOriginalDeclarer && !viewerHasPassed,
      });
    }
  }

  _startDealAnimation(sequence, opponentHandSizes = {}) {
    this._talonCardIds = sequence.filter(s => s.to === 'talon').map(s => s.id);
    this._controlsLocked = true;
    const animation = new DealAnimation(
      this._antlion, sequence, this._cardsById, this._seats.self, this._cardTable,
      () => {
        this._tableEl.querySelectorAll('.card-sprite').forEach(el => el.remove());
        const selfCards = Object.values(this._cardsById)
          .filter(c => !this._talonCardIds.includes(c.id));
        this._handView.setHand(selfCards);
        // Talon stays face-down during bidding; declarer reveals it on take
        this._talonView.setFaceDownCount(this._talonCardIds.length);
        this._leftOpponent.setCardCount(opponentHandSizes[this._seats.left] ?? 7);
        this._rightOpponent.setCardCount(opponentHandSizes[this._seats.right] ?? 7);
        this._controlsLocked = false;
        if (this._lastGameStatus) this._mountControlsForPhase(this._lastGameStatus);
      },
    );
    animation.start(this._tableEl);
  }

  _renderStatus(gameStatus) {
    this._statusBar.render(gameStatus, this._sellWinnerNickname);
    const { text, isActive } = this._computeStatusText(gameStatus);
    this._statusBox.setText(text, isActive);
  }

  _computeStatusText(gameStatus) {
    const { phase, viewerIsActive, activePlayer, declarer } = gameStatus;
    if (phase === 'Bidding') {
      if (viewerIsActive) return { text: 'Your turn', isActive: true };
      return { text: `Waiting for ${activePlayer?.nickname ?? '…'}`, isActive: false };
    }
    if (phase === 'Declarer deciding') {
      if (viewerIsActive) {
        if (this._viewerIsNewDeclarer) return { text: 'Start the game', isActive: true };
        return { text: 'Take the talon or sell?', isActive: true };
      }
      const name = declarer?.nickname ?? activePlayer?.nickname ?? '…';
      return { text: `Waiting for ${name}`, isActive: false };
    }
    if (phase === 'Selling') {
      if (this._sellSubPhase === 'selection') {
        if (viewerIsActive) return { text: 'Choose 3 cards to show', isActive: true };
        return { text: `Waiting for ${declarer?.nickname ?? '…'} to choose cards`, isActive: false };
      }
      if (viewerIsActive) return { text: 'Your turn', isActive: true };
      return { text: `Waiting for ${activePlayer?.nickname ?? '…'}`, isActive: false };
    }
    return { text: '', isActive: false };
  }

  // Animate an array of card ids from one slot to another; calls onComplete when done.
  _animateSprites(ids, fromSlot, toSlot, onComplete) {
    const OFFSET = 18;
    const ANIM_MS = 300;

    const sprites = ids.map((id, i) => {
      const sprite = new CardSprite(id);
      sprite.setFace('up');
      const identity = this._cardsById[id];
      if (identity) sprite.setIdentity(identity);
      sprite.setPosition(fromSlot.x + i * OFFSET, fromSlot.y);
      this._tableEl.appendChild(sprite.element);
      sprite.setPosition(toSlot.x + i * OFFSET, toSlot.y, ANIM_MS);
      return sprite;
    });

    const cancelTick = this._antlion.onTick(() => {
      let anyAnimating = false;
      for (const sprite of sprites) {
        if (sprite.update()) anyAnimating = true;
      }
      if (anyAnimating) return;
      cancelTick();
      for (const sprite of sprites) sprite.element.remove();
      onComplete();
    });
  }
}

export default GameScreen;
