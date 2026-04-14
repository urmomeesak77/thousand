'use strict';
/* global $ */

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
