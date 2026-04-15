import Toast from './Toast.js';
import ThousandRenderer from './ThousandRenderer.js';
import ThousandSocket from './ThousandSocket.js';
import GameApi from './GameApi.js';
import ModalController from './ModalController.js';

const $ = (id) => document.getElementById(id);

// ============================================================
// ThousandApp — coordinator: player state, UI binding, message handling
// ============================================================

class ThousandApp {
  constructor(antlion) {
    this._antlion = antlion;
    this._playerId = null;
    this._nickname = null;
    this._gameId = null;
    this._inviteCode = null;
    this._toast = new Toast();
    this._api = new GameApi((msg) => this._toast.show(msg));
    this._modal = new ModalController(
      antlion,
      () => this._nickname,
      (type) => this._createGame(type),
      (msg) => this._toast.show(msg),
    );
    this._socket = new ThousandSocket(
      antlion,
      (msg) => this._handleMessage(msg),
      (err) => this._toast.show(err),
    );
  }

  init() {
    this._bindUI();
    this._socket.connect();
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'connected':
        this._playerId = msg.playerId;
        break;
      case 'lobby_update':
        ThousandRenderer.renderGameList(msg.games);
        break;
      case 'game_joined':
        this._gameId = msg.gameId;
        ThousandRenderer.renderWaitingRoom(this._gameId, this._inviteCode, msg.players);
        ThousandRenderer.showScreen('game-screen');
        break;
      case 'player_joined':
      case 'player_left':
        ThousandRenderer.renderWaitingRoomPlayers(msg.players);
        break;
      case 'error':
        this._toast.show(msg.message || 'An error occurred');
        break;
    }
  }

  _bindUI() {
    this._bindNicknameForm();
    this._modal.bind();
    this._bindInviteJoin();
    this._bindCopyInvite();
    this._bindGameListJoin();
  }

  _bindNicknameForm() {
    this._antlion.bindInput($('nickname-form'), 'submit', 'nickname-submit');
    this._antlion.onInput('nickname-submit', async (e) => {
      e.preventDefault();
      const nick = $('nickname-input').value.trim();
      if (!nick) return;
      if (nick.length < 3 || nick.length > 20) {
        this._toast.show('Nickname must be 3–20 characters.');
        return;
      }
      const ok = await this._api.claimNickname(nick, this._playerId);
      if (!ok) return;
      this._nickname = nick;
      $('player-name-display').textContent = nick;
      ThousandRenderer.showScreen('lobby-screen');
    });
  }

  _bindInviteJoin() {
    this._antlion.bindInput($('join-invite-btn'), 'click', 'invite-join-click');
    this._antlion.onInput('invite-join-click', () => {
      const code = $('invite-code-input').value.trim().toUpperCase();
      if (!code) { this._toast.show('Enter an invite code.'); return; }
      if (!this._nickname) { this._toast.show('Enter a nickname first.'); return; }
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

  _bindGameListJoin() {
    this._antlion.bindInput($('game-list'), 'click', 'game-list-click');
    this._antlion.onInput('game-list-click', (e) => {
      const btn = e.target.closest('.join-btn');
      if (btn) this._joinGame(btn.dataset.gameId);
    });
  }

  async _joinGame(gameId) {
    const data = await this._api.join(gameId, this._nickname, this._playerId);
    if (data) this._gameId = data.gameId;
  }

  async _createGame(type) {
    const data = await this._api.create(type, this._nickname, this._playerId);
    if (data) { this._gameId = data.gameId; this._inviteCode = data.inviteCode; }
  }

  async _joinWithCode(code) {
    const data = await this._api.joinWithCode(code, this._nickname, this._playerId);
    if (data) { this._gameId = data.gameId; $('invite-code-input').value = ''; }
  }
}

export default ThousandApp;
