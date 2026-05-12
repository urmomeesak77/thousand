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

const $ = (id) => document.getElementById(id);

// Defensive shape checks for server→client WS messages. Today renderers use
// textContent so an unexpected shape can't trip XSS, but if a future renderer
// switches to innerHTML this gate keeps the surface narrow.
const isObj = (v) => v !== null && typeof v === 'object';

const MESSAGE_VALIDATORS = {
  connected: (m) => typeof m.playerId === 'string' && typeof m.sessionToken === 'string' && typeof m.restored === 'boolean' && (m.nickname === null || typeof m.nickname === 'string'),
  session_replaced: () => true,
  lobby_update: (m) => Array.isArray(m.games),
  game_joined: (m) => typeof m.gameId === 'string' && Array.isArray(m.players) && typeof m.requiredPlayers === 'number',
  player_joined: (m) => Array.isArray(m.players) && m.player && typeof m.player.nickname === 'string',
  player_left: (m) => Array.isArray(m.players) && (m.nickname === null || typeof m.nickname === 'string'),
  game_disbanded: () => true,
  error: (m) => m.message === undefined || typeof m.message === 'string',
  round_started: (m) => isObj(m.seats) && typeof m.seats.self === 'number' && Array.isArray(m.seats.players) && Array.isArray(m.dealSequence) && isObj(m.gameStatus),
  phase_changed: (m) => typeof m.phase === 'string' && isObj(m.gameStatus),
  bid_accepted: (m) => typeof m.playerId === 'string' && typeof m.amount === 'number' && isObj(m.gameStatus),
  pass_accepted: (m) => typeof m.playerId === 'string' && isObj(m.gameStatus),
  talon_absorbed: (m) => typeof m.declarerId === 'string' && Array.isArray(m.talonIds) && isObj(m.gameStatus),
  sell_started: (m) => isObj(m.gameStatus),
  sell_exposed: (m) => typeof m.declarerId === 'string' && Array.isArray(m.exposedIds) && isObj(m.gameStatus),
  sell_resolved: (m) => typeof m.outcome === 'string' && typeof m.oldDeclarerId === 'string' && Array.isArray(m.exposedIds) && isObj(m.gameStatus),
  play_phase_ready: (m) => typeof m.declarerId === 'string' && typeof m.finalBid === 'number' && isObj(m.gameStatus),
  round_aborted: (m) => typeof m.reason === 'string' && typeof m.disconnectedNickname === 'string' && isObj(m.gameStatus),
  action_rejected: (m) => typeof m.reason === 'string',
  round_state_snapshot: (m) => typeof m.phase === 'string' && isObj(m.gameStatus) && isObj(m.seats) && Array.isArray(m.myHand) && isObj(m.opponentHandSizes),
  player_disconnected: (m) => typeof m.playerId === 'string' && isObj(m.gameStatus),
  player_reconnected: (m) => typeof m.playerId === 'string' && isObj(m.gameStatus),
};

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
    this._toast = new Toast(antlion);
    this._api = new GameApi((msg) => this._toast.show(msg));
    this._modal = new NewGameModal(
      antlion,
      () => this._nickname,
      (type, requiredPlayers) => this._createGame(type, requiredPlayers),
      (msg) => this._toast.show(msg),
    );
    this._socket = new ThousandSocket(
      antlion,
      (msg) => this._handleMessage(msg),
      (err) => this._toast.show(err),
      () => this._reconnectOverlay?.show(),
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

  _handleMessage(msg) {
    if (!msg || typeof msg.type !== 'string') {
      return;
    }
    const validator = MESSAGE_VALIDATORS[msg.type];
    if (!validator || !validator(msg)) {
      return;
    }
    switch (msg.type) {
      case 'connected':
        this._playerId = msg.playerId;
        this._sessionToken = msg.sessionToken;
        this._api.setSessionToken(this._sessionToken);
        IdentityStore.save(msg.playerId, msg.sessionToken);
        this._reconnectOverlay.hide();
        if (msg.restored && msg.nickname !== null) {
          this._nickname = msg.nickname;
          $('player-name-display').textContent = msg.nickname;
          this._showScreen('lobby-screen');
          this._gameList.startElapsedTimer();
        } else {
          this._showScreen('nickname-screen');
        }
        break;
      case 'lobby_update':
        this._gameList.setGames(msg.games);
        if (this._selectedGameId && !msg.games.find((g) => g.id === this._selectedGameId)) {
          this._clearGameSelection();
        }
        break;
      case 'game_joined':
        this._gameId = msg.gameId;
        this._inviteCode = msg.inviteCode ?? null;
        this._clearGameSelection();
        this._gameList.stopElapsedTimer();
        this._waitingRoom.load(this._gameId, this._inviteCode, msg.players, msg.requiredPlayers);
        this._showScreen('game-screen');
        this._waitingRoom.startTimer(msg.createdAt);
        break;
      case 'player_joined':
        this._waitingRoom.updatePlayers(msg.players);
        this._toast.show(`${msg.player.nickname} joined the game.`);
        break;
      case 'player_left':
        this._waitingRoom.updatePlayers(msg.players);
        this._toast.show(`${msg.nickname || 'A player'} left the game.`);
        break;
      case 'game_disbanded':
        this._gameId = null;
        this._inviteCode = null;
        this._waitingRoom.stopTimer();
        this._showScreen('lobby-screen');
        this._gameList.startElapsedTimer();
        this._toast.show(
          msg.reason === 'waiting_room_timeout'
            ? 'Waiting room closed — the game wasn\'t started within 10 minutes.'
            : 'The host left — game was disbanded.'
        );
        break;
      case 'session_replaced':
        this._toast.show('Connected from another tab or browser — this session ended.');
        break;
      case 'error':
        this._toast.show(msg.message || 'An error occurred');
        break;
      case 'round_started':
        this._waitingRoom.stopTimer();
        this._showGameSubscreen('round');
        this._gameScreen.init(msg);
        break;
      case 'phase_changed':
        this._gameScreen.updateStatus(msg.gameStatus);
        break;
      case 'action_rejected':
        this._toast.show(msg.reason);
        break;
      case 'bid_accepted':
        this._gameScreen.updateStatus(msg.gameStatus);
        this._gameScreen.flashPlayer(msg.playerId);
        break;
      case 'pass_accepted':
        this._gameScreen.updateStatus(msg.gameStatus);
        this._gameScreen.flashPlayer(msg.playerId);
        break;
      case 'talon_absorbed':
        this._gameScreen.absorbTalon(msg);
        break;
      case 'play_phase_ready':
        this._gameScreen.updateStatus(msg.gameStatus);
        this._gameScreen.showRoundReady(
          'ready',
          { declarerNickname: msg.gameStatus.declarer?.nickname, finalBid: msg.finalBid },
          () => this._returnFromRound(),
        );
        break;
      case 'round_aborted':
        this._gameScreen.updateStatus(msg.gameStatus);
        this._gameScreen.showRoundReady(
          'aborted',
          { disconnectedNickname: msg.disconnectedNickname },
          () => this._returnFromRound(),
        );
        break;
      case 'player_disconnected':
        this._gameScreen.updateStatus(msg.gameStatus);
        this._gameScreen.setPlayerDisconnected(msg.playerId, true);
        break;
      case 'player_reconnected':
        this._gameScreen.updateStatus(msg.gameStatus);
        this._gameScreen.setPlayerDisconnected(msg.playerId, false);
        break;
      case 'round_state_snapshot':
        this._waitingRoom.stopTimer();
        this._showScreen('game-screen');
        this._showGameSubscreen('round');
        this._gameScreen.initFromSnapshot(msg);
        break;
      // TODO T070 (US3): sell_started — GameScreen.updateStatus
      // TODO T071 (US3): sell_exposed — animate exposed cards
      // TODO T072 (US3): sell_resolved — animate sell resolution
    }
  }

  _bindUI() {
    this._modal.bind();
    this._bindInviteJoin();
    this._bindCopyInvite();
    this._bindGameListSelect();
    this._bindJoinSelectedBtn();
    this._bindLeaveGame();
  }

  _bindInviteJoin() {
    this._antlion.bindInput($('invite-code-input'), 'input', 'invite-code-input');
    this._antlion.onInput('invite-code-input', () => {
      $('join-invite-btn').disabled = !$('invite-code-input').value.trim();
    });
    this._antlion.bindInput($('join-invite-btn'), 'click', 'invite-join-click');
    this._antlion.onInput('invite-join-click', () => {
      const code = $('invite-code-input').value.trim().toUpperCase();
      if (!code) {
        this._toast.show('Enter an invite code.');
        return;
      }
      if (!this._nickname) {
        this._toast.show('Enter a nickname first.');
        return;
      }
      this._joinWithCode(code);
    });
  }

  _bindCopyInvite() {
    this._antlion.bindInput($('copy-invite-btn'), 'click', 'copy-invite-click');
    this._antlion.onInput('copy-invite-click', () => {
      const code = $('invite-code-value').textContent;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => this._toast.show('Code copied!'));
        return;
      }
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this._toast.show('Code copied!');
    });
  }

  _bindGameListSelect() {
    this._antlion.bindInput($('game-list'), 'click', 'game-list-click');
    this._antlion.onInput('game-list-click', (e) => {
      const li = e.target.closest('li[data-id]');
      if (!li) {
        return;
      }
      const gameId = li.dataset.id;
      if (this._selectedGameId === gameId) {
        this._clearGameSelection();
      } else {
        const prev = $('game-list').querySelector('li.selected');
        if (prev) {
          prev.classList.remove('selected');
        }
        li.classList.add('selected');
        this._selectedGameId = gameId;
        $('join-selected-btn').disabled = false;
      }
    });

    this._antlion.bindInput($('game-list'), 'dblclick', 'game-list-dblclick');
    this._antlion.onInput('game-list-dblclick', (e) => {
      const li = e.target.closest('li[data-id]');
      if (!li) {
        return;
      }
      this._joinGame(li.dataset.id);
    });
  }

  _bindJoinSelectedBtn() {
    this._antlion.bindInput($('join-selected-btn'), 'click', 'join-selected-click');
    this._antlion.onInput('join-selected-click', () => {
      if (this._selectedGameId) {
        this._joinGame(this._selectedGameId);
      }
    });
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
    this._antlion.bindInput($('leave-game-btn'), 'click', 'leave-game-click');
    this._antlion.onInput('leave-game-click', () => {
      const modal = $('leave-confirm-modal');
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    });

    const closeLeaveModal = () => {
      const modal = $('leave-confirm-modal');
      modal.classList.add('hidden');
      modal.style.display = '';
    };

    this._antlion.bindInput($('leave-cancel-btn'), 'click', 'leave-cancel-click');
    this._antlion.onInput('leave-cancel-click', closeLeaveModal);

    this._antlion.bindInput($('leave-confirm-modal'), 'click', 'leave-overlay-click');
    this._antlion.onInput('leave-overlay-click', (e) => {
      if (e.target === $('leave-confirm-modal')) {
        closeLeaveModal();
      }
    });

    this._antlion.onInput('keydown', (e) => {
      if (e.key !== 'Escape') {
        return;
      }
      const modal = $('leave-confirm-modal');
      if (!modal.classList.contains('hidden')) {
        closeLeaveModal();
      } else if (!$('game-screen').classList.contains('hidden')) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
      }
    });

    this._antlion.bindInput($('leave-confirm-btn'), 'click', 'leave-confirm-click');
    this._antlion.onInput('leave-confirm-click', async () => {
      closeLeaveModal();
      const ok = await this._api.leave(this._gameId);
      if (!ok) {
        return;
      }
      this._gameId = null;
      this._inviteCode = null;
      this._waitingRoom.stopTimer();
      this._showScreen('lobby-screen');
      this._gameList.startElapsedTimer();
    });
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
}

export default ThousandApp;
