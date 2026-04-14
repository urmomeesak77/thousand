'use strict';
/* global $, Toast, LobbySocket, LobbyRenderer, GameApi, ModalController */

// ============================================================
// LobbyApp — coordinator: player state, UI binding, message handling
// ============================================================

class LobbyApp {
  constructor() {
    this._playerId = null;
    this._nickname = null;
    this._gameId = null;
    this._inviteCode = null;
    this._toast = new Toast();
    this._api = new GameApi((msg) => this._toast.show(msg));
    this._modal = new ModalController(
      () => this._nickname,
      (type) => this._createGame(type),
      (msg) => this._toast.show(msg),
    );
    this._socket = new LobbySocket(
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
        LobbyRenderer.renderGameList(msg.games, (id) => this._joinGame(id));
        break;
      case 'game_joined':
        this._gameId = msg.gameId;
        LobbyRenderer.renderWaitingRoom(this._gameId, this._inviteCode, msg.players);
        LobbyRenderer.showScreen('game-screen');
        break;
      case 'player_joined':
      case 'player_left':
        LobbyRenderer.renderWaitingRoomPlayers(msg.players);
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
  }

  _bindNicknameForm() {
    $('nickname-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const nick = $('nickname-input').value.trim();
      if (!nick) return;
      if (nick.length < 3 || nick.length > 20) {
        this._toast.show('Nickname must be 3–20 characters.');
        return;
      }
      this._nickname = nick;
      $('player-name-display').textContent = nick;
      LobbyRenderer.showScreen('lobby-screen');
    });
  }

  _bindInviteJoin() {
    $('join-invite-btn').addEventListener('click', () => {
      const code = $('invite-code-input').value.trim().toUpperCase();
      if (!code) { this._toast.show('Enter an invite code.'); return; }
      if (!this._nickname) { this._toast.show('Enter a nickname first.'); return; }
      this._joinWithCode(code);
    });
  }

  _bindCopyInvite() {
    $('copy-invite-btn').addEventListener('click', () => {
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
