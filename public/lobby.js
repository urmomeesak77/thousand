'use strict';

/* ============================================================
   Lobby client — Card Game 1000
   ============================================================ */

(function () {
  // State
  let myPlayerId = null;
  let myNickname = null;
  let currentGameId = null;
  let currentInviteCode = null;
  let ws = null;
  let toastTimer = null;

  // DOM refs (populated after DOMContentLoaded)
  const $ = (id) => document.getElementById(id);

  // ============================================================
  // Initialise
  // ============================================================

  document.addEventListener('DOMContentLoaded', () => {
    setupWebSocket();
    bindUI();
  });

  // ============================================================
  // WebSocket
  // ============================================================

  function setupWebSocket() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);

    // Expose for tests (jsdom looks for window._lobbyWS)
    window._lobbyWS = ws;
    // Also expose on self for environments where window !== globalThis
    try { self._lobbyWS = ws; } catch (_) {}

    ws.onopen = () => {};

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      handleServerMessage(msg);
    };

    ws.onerror = () => showToast('Connection error. Please refresh.');

    ws.onclose = () => {
      // Attempt reconnect after 3 s
      setTimeout(setupWebSocket, 3000);
    };
  }

  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'connected':
        myPlayerId = msg.playerId;
        break;

      case 'lobby_update':
        // T038 — diff-render the game list
        renderGameList(msg.games);
        break;

      case 'game_joined':
        currentGameId = msg.gameId;
        renderWaitingRoom(msg.players);
        showScreen('game-screen');
        break;

      case 'player_joined':
        renderWaitingRoomPlayers(msg.players);
        break;

      case 'player_left':
        renderWaitingRoomPlayers(msg.players);
        break;

      case 'error':
        showToast(msg.message || 'An error occurred');
        break;

      default:
        break;
    }
  }

  // ============================================================
  // UI binding
  // ============================================================

  function bindUI() {
    // Nickname form
    $('nickname-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const nick = $('nickname-input').value.trim();
      if (!nick) return;
      if (nick.length < 3 || nick.length > 20) {
        showToast('Nickname must be 3–20 characters.');
        return;
      }
      myNickname = nick;
      $('player-name-display').textContent = nick;
      showScreen('lobby-screen');
    });

    // New Game button
    $('new-game-btn').addEventListener('click', () => openModal());

    // Modal cancel
    $('modal-cancel-btn').addEventListener('click', () => closeModal());

    // Close modal on overlay click
    $('new-game-modal').addEventListener('click', (e) => {
      if (e.target === $('new-game-modal')) closeModal();
    });

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // New Game form submit
    $('new-game-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!myNickname) { showToast('Enter a nickname first.'); return; }
      const type = document.querySelector('input[name="game-type"]:checked').value;
      createGame(type);
    });

    // Join with invite code
    $('join-invite-btn').addEventListener('click', () => {
      const code = $('invite-code-input').value.trim().toUpperCase();
      if (!code) { showToast('Enter an invite code.'); return; }
      if (!myNickname) { showToast('Enter a nickname first.'); return; }
      joinWithCode(code);
    });

    // Copy invite code button
    $('copy-invite-btn').addEventListener('click', () => {
      const code = $('invite-code-value').textContent;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => showToast('Code copied!'));
      } else {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Code copied!');
      }
    });
  }

  // ============================================================
  // Screen management
  // ============================================================

  function showScreen(id) {
    ['nickname-screen', 'lobby-screen', 'game-screen'].forEach((s) => {
      const el = $(s);
      if (el) el.classList.toggle('hidden', s !== id);
    });
  }

  // ============================================================
  // Modal
  // ============================================================

  function openModal() {
    const modal = $('new-game-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }

  function closeModal() {
    const modal = $('new-game-modal');
    modal.classList.add('hidden');
    modal.style.display = '';
  }

  // ============================================================
  // Game list rendering  (T021 / T038)
  // ============================================================

  function renderGameList(games) {
    const list = $('game-list');
    const emptyState = $('empty-state');

    if (!games || games.length === 0) {
      list.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // Diff: track existing ids
    const existingIds = new Set([...list.querySelectorAll('li')].map((li) => li.dataset.id));
    const newIds = new Set(games.map((g) => g.id));

    // Remove rows that are no longer in the list
    for (const li of [...list.querySelectorAll('li')]) {
      if (!newIds.has(li.dataset.id)) li.remove();
    }

    // Add or update rows
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
      li.querySelector('.join-btn').addEventListener('click', () => joinGame(game.id));
    }
  }

  // ============================================================
  // Join a public game  (T021)
  // ============================================================

  async function joinGame(gameId) {
    if (!myNickname) { showToast('Enter a nickname first.'); return; }
    try {
      const res = await fetch(`/api/games/${gameId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: myNickname, playerId: myPlayerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          showToast(data.message || 'Game is full');
        } else {
          showToast(data.message || 'Failed to join game');
        }
        return;
      }
      currentGameId = data.gameId;
      // game_joined WS message will trigger screen transition
    } catch {
      showToast('Network error. Please try again.');
    }
  }

  // ============================================================
  // Create a new game  (T031)
  // ============================================================

  async function createGame(type) {
    closeModal();
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, nickname: myNickname, playerId: myPlayerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.message || 'Failed to create game');
        return;
      }
      currentGameId = data.gameId;
      currentInviteCode = data.inviteCode;
      // game_joined WS message will trigger screen transition; store invite code for display
    } catch {
      showToast('Network error. Please try again.');
    }
  }

  // ============================================================
  // Join via invite code  (T031)
  // ============================================================

  async function joinWithCode(code) {
    try {
      const res = await fetch('/api/games/join-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, nickname: myNickname, playerId: myPlayerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          showToast(data.message || 'Game is full');
        } else if (res.status === 404) {
          showToast('Invalid or expired invite code');
        } else {
          showToast(data.message || 'Failed to join game');
        }
        return;
      }
      currentGameId = data.gameId;
      $('invite-code-input').value = '';
      // game_joined WS message will trigger screen transition
    } catch {
      showToast('Network error. Please try again.');
    }
  }

  // ============================================================
  // Waiting room  (T031 / T038)
  // ============================================================

  function renderWaitingRoom(playerList) {
    $('game-id-display').textContent = `Game #${currentGameId}`;

    // Show invite code if we have one (i.e. we created the game)
    if (currentInviteCode) {
      $('invite-code-value').textContent = currentInviteCode;
      $('invite-display').classList.remove('hidden');
    } else {
      $('invite-display').classList.add('hidden');
    }

    renderWaitingRoomPlayers(playerList);
  }

  function renderWaitingRoomPlayers(playerList) {
    const ul = $('player-list');
    ul.innerHTML = '';
    for (const p of playerList) {
      const li = document.createElement('li');
      li.textContent = p.nickname || p.id;
      ul.appendChild(li);
    }
  }

  // ============================================================
  // Error toast  (T043)
  // ============================================================

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
      toastTimer = null;
    }, 4000);
  }
})();
