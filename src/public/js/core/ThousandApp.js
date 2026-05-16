import { IdentityStore } from '../storage/IdentityStore.js';
import { ReconnectOverlay } from '../overlays/ReconnectOverlay.js';
import HtmlContainer from '../antlion/HtmlContainer.js';
import NicknameScreen from '../screens/NicknameScreen.js';
import GameList from '../screens/GameList.js';
import PlayerTooltip from '../overlays/PlayerTooltip.js';
import WaitingRoom from '../screens/WaitingRoom.js';
import Toast from '../overlays/Toast.js';
import ThousandSocket from '../network/ThousandSocket.js';
import GameApi from '../network/GameApi.js';
import NewGameModal from '../overlays/NewGameModal.js';
import GameScreen from '../thousand/GameScreen.js';
import RoundActionDispatcher from '../thousand/RoundActionDispatcher.js';
import ThousandMessageRouter from './ThousandMessageRouter.js';
import LobbyBinder from './LobbyBinder.js';

const $ = (id) => document.getElementById(id);

class ThousandApp {
  constructor(antlion, scene) {
    this._antlion = antlion;
    this._scene = scene;
    this._playerId = null;
    this._sessionToken = null;
    this._nickname = null;
    this._gameId = null;
    this._inviteCode = null;
    this._selectedGameId = null;
    this._roundEnded = false;
    this._toast = new Toast(antlion);
    this._api = new GameApi((msg) => this._toast.show(msg));
    this._modal = new NewGameModal(
      antlion,
      () => this._nickname,
      (type, requiredPlayers) => this._createGame(type, requiredPlayers),
      (msg) => this._toast.show(msg),
    );
    this._router = new ThousandMessageRouter(this);
    this._lobbyBinder = new LobbyBinder(antlion, this);
    this._socket = new ThousandSocket(
      antlion,
      (msg) => this._router.handle(msg),
      (err) => this._toast.show(err),
      () => this._reconnectOverlay?.show(),
      () => this._reconnectOverlay?.hide(),
    );
  }

  init() {
    const nicknameEl = $('nickname-screen');
    const lobbyEl = $('lobby-screen');
    const gameEl = $('game-screen');

    this._nicknameScreen = new NicknameScreen(nicknameEl, this._api, this._toast);
    this._lobbyContainer = HtmlContainer.adopt('lobby-screen', lobbyEl);
    this._gameContainer = HtmlContainer.adopt('game-screen', gameEl);
    this._gameList = new GameList($('game-list'));
    this._playerTooltip = new PlayerTooltip();
    this._waitingRoomCard = gameEl.querySelector('.card');
    this._waitingRoom = new WaitingRoom(this._waitingRoomCard);

    this._roundScreenEl = document.createElement('div');
    this._roundScreenEl.className = 'round-screen hidden';
    gameEl.appendChild(this._roundScreenEl);
    this._dispatcher = new RoundActionDispatcher(this._socket);
    this._gameScreen = new GameScreen(this._antlion, this._roundScreenEl, this._dispatcher);

    this._reconnectOverlay = new ReconnectOverlay($('reconnect-overlay'));

    this._scene.root.addChild(this._nicknameScreen);
    this._scene.root.addChild(this._lobbyContainer);
    this._scene.root.addChild(this._gameContainer);
    this._lobbyContainer.addChild(this._gameList);
    this._lobbyContainer.addChild(this._playerTooltip);
    this._gameContainer.addChild(this._waitingRoom);

    this._antlion.onInput('nickname-entered', ({ nick }) => {
      this._nickname = nick;
      $('player-name-display').textContent = nick;
      this._showScreen('lobby-screen');
      this._gameList.startElapsedTimer();
    });

    this._antlion.onInput('round-summary-back', () => this._returnFromRound());
    this._antlion.onInput('final-results-back-click', () => this._returnFromRound());
    this._antlion.onInput('round-ready-back-click', () => this._returnFromRound());

    this._bindUI();
    if (IdentityStore.load().playerId) {
      this._reconnectOverlay.show();
    }
    this._socket.connect();
  }

  _showScreen(name) {
    this._nicknameScreen.hide();
    this._lobbyContainer.hide();
    this._gameContainer.hide();
    if (name === 'nickname-screen') {
      this._nicknameScreen.show();
    } else if (name === 'lobby-screen') {
      this._lobbyContainer.show();
    } else if (name === 'game-screen') {
      this._gameContainer.show();
      this._showGameSubscreen('waiting');
    }
  }

  // Toggles between the waiting-room card and the in-round game view.
  _showGameSubscreen(sub) {
    const waiting = sub === 'waiting';
    this._waitingRoomCard.classList.toggle('hidden', !waiting);
    this._roundScreenEl.classList.toggle('hidden', waiting);
  }

  _bindUI() {
    this._modal.bind();
    this._lobbyBinder.bind();
    this._bindLeaveGame();
  }

  _clearGameSelection() {
    const selected = $('game-list').querySelector('li.selected');
    if (selected) {
      selected.classList.remove('selected');
    }
    this._selectedGameId = null;
    $('join-selected-btn').disabled = true;
  }

  _bindLeaveGame() {
    const openLeaveModal = () => this._openLeaveModal();
    const closeLeaveModal = () => this._closeLeaveModal();

    this._antlion.bindInput($('leave-game-btn'), 'click', 'leave-game-click');
    this._antlion.onInput('leave-game-click', openLeaveModal);

    this._antlion.bindInput($('leave-cancel-btn'), 'click', 'leave-cancel-click');
    this._antlion.onInput('leave-cancel-click', closeLeaveModal);

    this._antlion.bindInput($('leave-confirm-modal'), 'click', 'leave-overlay-click');
    this._antlion.onInput('leave-overlay-click', (e) => {
      if (e.target === $('leave-confirm-modal')) {
        closeLeaveModal();
      }
    });

    this._antlion.onInput('keydown', (e) => this._handleLeaveGameKeydown(e));

    this._antlion.bindInput($('leave-confirm-btn'), 'click', 'leave-confirm-click');
    this._antlion.onInput('leave-confirm-click', () => this._confirmLeaveGame());
  }

  _openLeaveModal() {
    $('leave-confirm-modal').classList.remove('hidden');
  }

  _closeLeaveModal() {
    $('leave-confirm-modal').classList.add('hidden');
  }

  _handleLeaveGameKeydown(e) {
    if (e.key !== 'Escape') {
      return;
    }
    const modal = $('leave-confirm-modal');
    if (!modal.classList.contains('hidden')) {
      this._closeLeaveModal();
    } else if (this._roundEnded) {
      this._antlion.emit('round-ready-back-click', {});
    } else if (!$('game-screen').classList.contains('hidden')) {
      this._openLeaveModal();
    }
  }

  async _confirmLeaveGame() {
    this._closeLeaveModal();
    const ok = await this._api.leave(this._gameId);
    if (!ok) {
      return;
    }
    this._gameId = null;
    this._inviteCode = null;
    this._waitingRoom.stopTimer();
    this._showScreen('lobby-screen');
    this._gameList.startElapsedTimer();
  }

  async _joinGame(gameId) {
    const data = await this._api.join(gameId, this._nickname);
    if (data) {
      this._gameId = data.gameId;
    }
  }

  async _createGame(type, requiredPlayers) {
    const data = await this._api.create(type, this._nickname, requiredPlayers);
    if (data) {
      this._gameId = data.gameId;
      this._inviteCode = data.inviteCode;
    }
  }

  _returnFromRound() {
    this._roundEnded = false;
    this._gameId = null;
    this._inviteCode = null;
    this._showScreen('lobby-screen');
    this._gameList.startElapsedTimer();
  }

  async _joinWithCode(code) {
    const data = await this._api.joinWithCode(code, this._nickname);
    if (data) {
      this._gameId = data.gameId;
      $('invite-code-input').value = '';
      $('join-invite-btn').disabled = true;
    }
  }

  // card_exchange_started: declarer's hand is revealed as part of exchange setup.
  onCardExchangeStarted(msg) {
    this._applyHandToCardsById(msg.gameStatus?.myHand);
    this._gameScreen.updateStatus(msg.gameStatus);
  }

  // card_passed: the passed card's identity is revealed to the viewer via the updated hand (FR-019).
  // The recipient (msg.passedCard present) sees the card inserted into their HandView; the
  // declarer's hand is reduced via the optimistic markLeaving → render → removeLeaving cycle.
  onCardPassed(msg) {
    if (msg.passedCard) {
      const { passedCard } = msg;
      this._gameScreen.cardsById[passedCard.id] = passedCard;
      this._gameScreen.addCardToHand(passedCard);
    }
    this._gameScreen.updateStatus(msg.gameStatus);
  }

  onTrickPlayStarted(msg) {
    this._applyHandToCardsById(msg.gameStatus?.myHand);
    this._gameScreen.updateStatus(msg.gameStatus);
  }

  onCardPlayed(msg) {
    if (typeof msg.playerSeat === 'number' && typeof msg.cardId === 'number') {
      this._gameScreen.handlePlayedCard(msg.playerSeat, msg.cardId);
    }
    this._gameScreen.updateStatus(msg.gameStatus);
  }

  onMarriageDeclared(msg) {
    this._gameScreen.updateStatus(msg.gameStatus);
  }

  onTrumpChanged(msg) {
    this._gameScreen.updateStatus(msg.gameStatus);
  }

  onRoundSummary(msg) {
    this._gameScreen.updateSnapshot({ summary: msg.summary });
    this._gameScreen.updateStatus(msg.gameStatus);
  }

  // Accumulates revealed card identities into GameScreen's lookup table.
  // Each viewer only ever sees their own hand, so we grow the map as cards appear.
  _applyHandToCardsById(hand) {
    if (!hand) {return;}
    const cardsById = this._gameScreen.cardsById;
    for (const card of hand) {
      cardsById[card.id] = card;
    }
  }
}

export default ThousandApp;
