import { IdentityStore } from '../storage/IdentityStore.js';
import { MutePreferenceStore } from '../storage/MutePreferenceStore.js';
import { TabSync } from '../storage/TabSync.js';
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
import RulesModal from '../overlays/RulesModal.js';
import GameScreen from '../thousand/GameScreen.js';
import SoundManager from '../thousand/SoundManager.js';
import MuteButton from '../thousand/MuteButton.js';
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
    this._tabSync = new TabSync();
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

    // Consumes engine sound:* events. The store seeds the remembered mute
    // preference (default unmuted) and records changes from the mute button.
    this._soundManager = new SoundManager(this._antlion, { store: new MutePreferenceStore() });

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
    // Resolve the shared identity (electing with sibling tabs if this is a
    // fresh load) BEFORE the first connect, so the hello carries the agreed
    // identity and two fresh tabs don't become two players.
    this._tabSync.resolveIdentity().then(() => this._socket.connect());
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
    this._rulesModal = new RulesModal(this._antlion);
    this._rulesModal.bind();
    // The scoreboard chrome (built in GameScreen's constructor) already carries
    // every .mute-btn by now, so bind it the same way as the rules modal.
    this._muteButton = new MuteButton(this._antlion, this._soundManager);
    this._muteButton.bind();
    this._lobbyBinder.bind();
    this._bindLeaveGame();
    this._bindAddBot();
    this._bindLogout();
  }

  _bindAddBot() {
    this._antlion.bindInput($('add-bot-btn'), 'click', 'add-bot-click');
    this._antlion.onInput('add-bot-click', () => this._addBot());
    // Per-bot Remove controls are rendered dynamically, so delegate from the
    // static player-list container (no raw per-button DOM listeners, per §XI).
    this._antlion.bindInput($('player-list'), 'click', 'player-list-click');
    this._antlion.onInput('player-list-click', (e) => this._onPlayerListClick(e));
  }

  async _addBot() {
    if (!this._gameId) {return;}
    await this._api.addBot(this._gameId);
  }

  async _onPlayerListClick(e) {
    const btn = e.target.closest('.remove-bot-btn');
    if (!btn || !this._gameId) {return;}
    await this._api.removeBot(this._gameId, btn.dataset.botId);
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
    // The rules modal owns Escape while it's open (closed via the separate
    // rules-keydown handler); don't also pop the leave-confirm modal on the
    // same keypress. This handler runs first because NewGameModal binds the
    // document keydown before RulesModal does, so the modal is still visible.
    if (!$('rules-modal').classList.contains('hidden')) {
      return;
    }
    if (!$('logout-confirm-modal').classList.contains('hidden')) {
      this._closeLogoutModal();
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

  _bindLogout() {
    this._antlion.bindInput($('logout-btn'), 'click', 'logout-click');
    this._antlion.onInput('logout-click', () => this._openLogoutModal());

    this._antlion.bindInput($('logout-cancel-btn'), 'click', 'logout-cancel-click');
    this._antlion.onInput('logout-cancel-click', () => this._closeLogoutModal());

    this._antlion.bindInput($('logout-confirm-modal'), 'click', 'logout-overlay-click');
    this._antlion.onInput('logout-overlay-click', (e) => {
      if (e.target === $('logout-confirm-modal')) {
        this._closeLogoutModal();
      }
    });

    this._antlion.bindInput($('logout-confirm-btn'), 'click', 'logout-confirm-click');
    this._antlion.onInput('logout-confirm-click', () => this._confirmLogout());
  }

  _openLogoutModal() {
    $('logout-confirm-modal').classList.remove('hidden');
  }

  _closeLogoutModal() {
    $('logout-confirm-modal').classList.add('hidden');
  }

  async _confirmLogout() {
    // Tell the server to purge us first so the nickname/session free up
    // immediately; otherwise the disconnect grace window keeps the nickname
    // reserved and re-login with the same name fails with "already taken".
    await this._api.logout();
    IdentityStore.clear();
    // Full reload guarantees a clean socket/app state; with the identity cleared,
    // boot lands on the nickname (login) screen without a reconnect attempt.
    location.reload();
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
    // The held-back trick_play_started arrives once the four-nines gate closes —
    // dismiss the modal for everyone (FR-003).
    this._gameScreen.hideFourNinesPrompt();
    this._applyHandToCardsById(msg.gameStatus?.myHand);
    this._gameScreen.updateStatus(msg.gameStatus);
  }

  // four_nines_awarded: open the blocking modal and reflect the banked +100 in the
  // always-visible cumulative display immediately (FR-003, FR-018).
  onFourNinesAwarded(msg) {
    this._gameScreen.applyCumulativeBump(msg.cumulativeScores);
    this._gameScreen.showFourNinesPrompt(msg.nickname, msg.amount);
  }

  onFourNinesAckProgress(msg) {
    if (msg.gameStatus) { this._gameScreen.updateStatus(msg.gameStatus); }
    this._gameScreen.updateFourNinesProgress(msg.acknowledgedSeats);
  }

  onCardPlayed(msg) {
    if (typeof msg.playerSeat === 'number' && typeof msg.cardId === 'number') {
      if (msg.card?.rank && msg.card?.suit) {
        this._gameScreen.cardsById[msg.cardId] = {
          id: msg.cardId, rank: msg.card.rank, suit: msg.card.suit,
        };
      }
      this._gameScreen.notifyCardPlayed(msg.playerSeat, msg.cardId);
      this._gameScreen.handlePlayedCard(msg.playerSeat, msg.cardId);
    }
    this._gameScreen.updateStatus(msg.gameStatus);
  }

  // crawl_committed: progress only — no faces (FR-005). GameScreen removes the
  // viewer's own committed card from hand (echoed via gameStatus.viewerCrawlCommit).
  onCrawlCommitted(msg) {
    this._gameScreen.onCrawlCommitted(msg);
  }

  // crawl_revealed: the three faces + winner (FR-006). Seed the lookup table so
  // the centre/flight can render every revealed card, then run the reveal.
  onCrawlRevealed(msg) {
    for (const c of msg.commits) {
      if (typeof c.cardId === 'number' && c.rank && c.suit) {
        this._gameScreen.cardsById[c.cardId] = { id: c.cardId, rank: c.rank, suit: c.suit };
      }
    }
    this._gameScreen.onCrawlRevealed(msg);
  }

  onMarriageDeclared(msg) {
    this._gameScreen.updateStatus(msg.gameStatus);
    this._gameScreen.notifyMarriageDeclared(msg);
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
