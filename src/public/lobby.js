'use strict';

// Pure DOM lookup utility — no state
const $ = (id) => document.getElementById(id);

// ============================================================
// Toast — owns toast timer state  (T043)
// ============================================================

class Toast {
  constructor() {
    this._timer = null;
  }

  show(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.remove('hidden');
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      el.classList.add('hidden');
      this._timer = null;
    }, 4000);
  }
}

// ============================================================
// LobbyRenderer — stateless DOM rendering  (T021 / T038)
// ============================================================

class LobbyRenderer {
  static showScreen(id) {
    ['nickname-screen', 'lobby-screen', 'game-screen'].forEach((s) => {
      const el = $(s);
      if (el) el.classList.toggle('hidden', s !== id);
    });
  }

  static renderGameList(games, onJoin) {
    const list = $('game-list');
    const emptyState = $('empty-state');

    if (!games || games.length === 0) {
      list.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    const newIds = new Set(games.map((g) => g.id));
    for (const li of [...list.querySelectorAll('li')]) {
      if (!newIds.has(li.dataset.id)) li.remove();
    }

    for (const game of games) {
      let li = list.querySelector(`li[data-id="${game.id}"]`);
      if (!li) {
        li = document.createElement('li');
        li.dataset.id = game.id;
        list.appendChild(li);
      }
      li.innerHTML = `
        <div class="game-info">
          <span class="game-id-label">Game #${game.id}</span>
          <span class="game-player-count">${game.playerCount} / ${game.maxPlayers} players</span>
        </div>
        <button class="btn btn-secondary join-btn" data-game-id="${game.id}">Join</button>
      `;
      li.querySelector('.join-btn').addEventListener('click', () => onJoin(game.id));
    }
  }

  static renderWaitingRoom(gameId, inviteCode, players) {
    $('game-id-display').textContent = `Game #${gameId}`;
    if (inviteCode) $('invite-code-value').textContent = inviteCode;
    $('invite-display').classList.toggle('hidden', !inviteCode);
    LobbyRenderer.renderWaitingRoomPlayers(players);
  }

  static renderWaitingRoomPlayers(players) {
    const ul = $('player-list');
    ul.innerHTML = '';
    for (const p of players) {
      const li = document.createElement('li');
      li.textContent = p.nickname || p.id;
      ul.appendChild(li);
    }
  }
}

// ============================================================
// LobbySocket — owns WebSocket connection and reconnect logic
// ============================================================

class LobbySocket {
  constructor(onMessage, onError) {
    this._onMessage = onMessage;
    this._onError = onError;
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);

    // Expose for tests (jsdom looks for window._lobbyWS)
    window._lobbyWS = ws;
    try { self._lobbyWS = ws; } catch (_) {}

    ws.onopen = () => {};
    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      this._onMessage(msg);
    };
    ws.onerror = () => this._onError('Connection error. Please refresh.');
    ws.onclose = () => setTimeout(() => this.connect(), 3000);
  }
}

// ============================================================
// LobbyApp — coordinator: player state, UI binding, API calls
// ============================================================

class LobbyApp {
  constructor() {
    this._playerId = null;
    this._nickname = null;
    this._gameId = null;
    this._inviteCode = null;
    this._toast = new Toast();
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
    this._bindModal();
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

  _bindModal() {
    $('new-game-btn').addEventListener('click', () => this._openModal());
    $('modal-cancel-btn').addEventListener('click', () => this._closeModal());
    $('new-game-modal').addEventListener('click', (e) => {
      if (e.target === $('new-game-modal')) this._closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._closeModal();
    });
    $('new-game-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!this._nickname) { this._toast.show('Enter a nickname first.'); return; }
      const type = document.querySelector('input[name="game-type"]:checked').value;
      this._createGame(type);
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

  _openModal() {
    const modal = $('new-game-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }

  _closeModal() {
    const modal = $('new-game-modal');
    modal.classList.add('hidden');
    modal.style.display = '';
  }

  async _post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json() };
  }

  async _joinGame(gameId) {
    if (!this._nickname) { this._toast.show('Enter a nickname first.'); return; }
    try {
      const { res, data } = await this._post(`/api/games/${gameId}/join`, {
        nickname: this._nickname, playerId: this._playerId,
      });
      if (!res.ok) {
        this._toast.show(data.message || (res.status === 409 ? 'Game is full' : 'Failed to join game'));
        return;
      }
      this._gameId = data.gameId;
    } catch {
      this._toast.show('Network error. Please try again.');
    }
  }

  async _createGame(type) {
    this._closeModal();
    try {
      const { res, data } = await this._post('/api/games', {
        type, nickname: this._nickname, playerId: this._playerId,
      });
      if (!res.ok) { this._toast.show(data.message || 'Failed to create game'); return; }
      this._gameId = data.gameId;
      this._inviteCode = data.inviteCode;
    } catch {
      this._toast.show('Network error. Please try again.');
    }
  }

  async _joinWithCode(code) {
    try {
      const { res, data } = await this._post('/api/games/join-invite', {
        code, nickname: this._nickname, playerId: this._playerId,
      });
      if (!res.ok) {
        const msg = res.status === 409 ? 'Game is full'
          : res.status === 404 ? 'Invalid or expired invite code'
          : data.message || 'Failed to join game';
        this._toast.show(msg);
        return;
      }
      this._gameId = data.gameId;
      $('invite-code-input').value = '';
    } catch {
      this._toast.show('Network error. Please try again.');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => new LobbyApp().init());
