import BidControls from './BidControls.js';
import DeclarerDecisionControls from './DeclarerDecisionControls.js';
import SellSelectionControls from './SellSelectionControls.js';
import SellBidControls from './SellBidControls.js';
import CardExchangeView from './CardExchangeView.js';
import TrickPlayView from './TrickPlayView.js';
import RoundSummaryScreen from './RoundSummaryScreen.js';

const SELL_BID_DEFAULT = 100;
const SELL_DISABLED_ATTEMPT = 3;

class GameScreenControls {
  constructor(gameScreen, antlion, controlsEl, handView, dispatcher) {
    this._gs = gameScreen;
    this._antlion = antlion;
    this._controlsEl = controlsEl;
    this._handView = handView;
    this._dispatcher = dispatcher;

    this._bidControls = null;
    this._declarerControls = null;
    this._sellSelectionControls = null;
    this._sellBidControls = null;
    this._cardExchangeView = null;
    this._trickPlayView = null;
    this._roundSummaryScreen = null;
  }

  mountForPhase(gameStatus) {
    const { phase } = gameStatus;
    const sellBiddingActive = phase === 'Selling' && this._gs._sellSubPhase === 'bidding';
    if (phase !== 'Bidding' && !sellBiddingActive) {
      this._gs._clearLastAction();
    }

    if (phase === 'Bidding') {
      this._mountBidding(gameStatus);
    } else if (phase === 'Declarer deciding') {
      this._mountDeclarer(gameStatus);
    } else if (phase === 'Selling') {
      if (this._drop('_bidControls')) {
        this._controlsEl.textContent = '';
      }
      if (this._drop('_declarerControls')) {
        this._controlsEl.textContent = '';
      }
      if (this._gs._sellSubPhase) {
        this._mountForSelling(gameStatus);
      }
    } else if (phase === 'Card exchange') {
      this._mountCardExchange(gameStatus);
    } else if (phase === 'Trick play') {
      this._mountTrickPlay(gameStatus);
    } else if (phase === 'Round complete') {
      this._mountRoundSummary(gameStatus);
    } else {
      this.tearDownAll();
    }
  }

  tearDownAll() {
    const hadAny = this._bidControls || this._declarerControls
      || this._sellSelectionControls || this._sellBidControls
      || this._cardExchangeView || this._trickPlayView || this._roundSummaryScreen
      || this._controlsEl.querySelector('.waiting');
    this._bidControls = null;
    this._declarerControls = null;
    this._sellSelectionControls = null;
    this._sellBidControls = null;
    this._cardExchangeView = null;
    this._trickPlayView = null;
    this._roundSummaryScreen = null;
    if (hadAny) {this._controlsEl.textContent = '';}
  }

  // Sell flow drops these directly when entering bidding sub-phase or resolving.
  clearSellSelection() {
    if (this._sellSelectionControls) {
      this._handView.setSelectionMode(false);
      this._sellSelectionControls = null;
    }
  }

  clearSellBid() {
    this._sellBidControls = null;
  }

  _drop(name) {
    if (!this[name]) {return false;}
    this[name] = null;
    return true;
  }

  _mountBidding(gameStatus) {
    if (this._drop('_declarerControls')) {
      this._controlsEl.textContent = '';
    }
    if (!this._bidControls) {
      this._controlsEl.textContent = '';
      this._bidControls = new BidControls(this._controlsEl, this._antlion, this._dispatcher);
    }
    this._bidControls.setCurrentHighBid(gameStatus.currentHighBid);
    const seats = this._gs._seats;
    const viewerPlayer = seats?.players.find((p) => p.seat === seats.self);
    const viewerNickname = viewerPlayer?.nickname;
    const viewerHasPassed = viewerNickname
      ? (gameStatus.passedPlayers ?? []).includes(viewerNickname)
      : false;
    this._bidControls.setActiveState({
      isActiveBidder: gameStatus.viewerIsActive,
      isEligible: !viewerHasPassed,
    });
  }

  _mountDeclarer(gameStatus) {
    if (this._drop('_bidControls')) {
      this._controlsEl.textContent = '';
    }
    this.clearSellSelection();
    this._sellBidControls = null;
    this._gs._sellSubPhase = null;

    if (gameStatus.viewerIsActive) {
      if (!this._declarerControls) {
        this._controlsEl.textContent = '';
        this._declarerControls = new DeclarerDecisionControls(
          this._controlsEl, this._antlion, this._dispatcher,
        );
      }
      this._declarerControls.setMode(this._declarerMode(gameStatus));
    } else {
      this._renderWaitingForDeclarer(gameStatus);
    }
  }

  _renderWaitingForDeclarer(gameStatus) {
    if (this._drop('_declarerControls')) {
      this._controlsEl.textContent = '';
    }
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

  _declarerMode(gameStatus) {
    const { sellAttempt } = gameStatus;
    if (sellAttempt === SELL_DISABLED_ATTEMPT) {return 'sell-disabled';}
    if (this._gs._viewerIsNewDeclarer) {return 'sell-hidden';}
    return 'full';
  }

  _mountForSelling(gameStatus) {
    const { viewerIsActive, passedPlayers } = gameStatus;
    const seats = this._gs._seats;

    if (this._gs._sellSubPhase === 'selection') {
      if (viewerIsActive) {
        if (this._sellSelectionControls) {return;}
        this._controlsEl.textContent = '';
        this._handView.setSelectionMode(true);
        this._sellSelectionControls = new SellSelectionControls(
          this._controlsEl, this._antlion, this._dispatcher,
        );
        this._sellSelectionControls.show();
      } else {
        if (this._controlsEl.querySelector('.waiting')) {return;}
        this._controlsEl.textContent = '';
        const w = document.createElement('div');
        w.className = 'waiting';
        w.textContent = `Waiting for ${gameStatus.declarer?.nickname ?? 'declarer'} to choose cards…`;
        this._controlsEl.appendChild(w);
      }
    } else if (this._gs._sellSubPhase === 'bidding') {
      if (!this._sellBidControls) {
        this._controlsEl.textContent = '';
        this._sellBidControls = new SellBidControls(this._controlsEl, this._antlion, this._dispatcher);
      }
      this._sellBidControls.setCurrentHighBid(gameStatus.currentHighBid ?? SELL_BID_DEFAULT);

      const viewerPlayer = seats?.players.find(p => p.seat === seats.self);
      const viewerNickname = viewerPlayer?.nickname;
      const viewerIsOriginalDeclarer = viewerNickname === gameStatus.declarer?.nickname;
      const viewerHasPassed = (passedPlayers ?? []).includes(viewerNickname);

      this._sellBidControls.setActiveState({
        isActiveSeller: viewerIsActive && !viewerIsOriginalDeclarer,
        isEligible: !viewerIsOriginalDeclarer && !viewerHasPassed,
      });
    }
  }

  _buildSeats(gameStatus) {
    const seats = this._gs._seats;
    return {
      self: seats?.self ?? null,
      left: seats?.left ?? null,
      right: seats?.right ?? null,
      declarerSeat: gameStatus.declarer?.seat ?? null,
    };
  }

  _mountCardExchange(gameStatus) {
    const hadAny = ['_bidControls', '_declarerControls', '_trickPlayView', '_roundSummaryScreen']
      .some((f) => this._drop(f));
    if (hadAny) {
      this._controlsEl.textContent = '';
    }

    if (!this._cardExchangeView) {
      this._controlsEl.textContent = '';
      this._cardExchangeView = new CardExchangeView(this._controlsEl, {
        antlion: this._antlion,
        dispatcher: this._dispatcher,
        seats: this._buildSeats(gameStatus),
      });
    }

    const snapshot = this._gs._lastSnapshot;
    if (snapshot) {
      this._cardExchangeView.render(snapshot);
    }
  }

  _mountTrickPlay(gameStatus) {
    const hadAny = ['_bidControls', '_declarerControls', '_cardExchangeView', '_roundSummaryScreen']
      .some((f) => this._drop(f));
    if (hadAny) {
      this._controlsEl.textContent = '';
    }

    if (!this._trickPlayView) {
      this._controlsEl.textContent = '';
      this._trickPlayView = new TrickPlayView(this._controlsEl, {
        antlion: this._antlion,
        dispatcher: this._dispatcher,
        seats: this._buildSeats(gameStatus),
      });
    }

    const snapshot = this._gs._lastSnapshot;
    if (snapshot) {
      this._trickPlayView.render(snapshot);
    }
  }

  _mountRoundSummary(_gameStatus) {
    const hadAny = ['_bidControls', '_declarerControls', '_cardExchangeView', '_trickPlayView']
      .some((f) => this._drop(f));
    if (hadAny) {
      this._controlsEl.textContent = '';
    }

    if (!this._roundSummaryScreen) {
      this._controlsEl.textContent = '';
      this._roundSummaryScreen = new RoundSummaryScreen(this._controlsEl, {
        antlion: this._antlion,
        onBackToLobby: () => this._dispatcher.sendStartGame(),
      });
    }

    const snapshot = this._gs._lastSnapshot;
    if (snapshot?.summary) {
      this._roundSummaryScreen.render(snapshot.summary);
    }
  }
}

export default GameScreenControls;
