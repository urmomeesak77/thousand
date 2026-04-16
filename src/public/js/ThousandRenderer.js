const $ = (id) => document.getElementById(id);

// ============================================================
// ThousandRenderer — stateless DOM rendering  (T021 / T038)
// ============================================================

class ThousandRenderer {
  static showScreen(id) {
    ['nickname-screen', 'lobby-screen', 'game-screen'].forEach((s) => {
      const el = $(s);
      if (el) el.classList.toggle('hidden', s !== id);
    });
  }

  static _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  static renderGameList(games) {
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
      let li = list.querySelector(`li[data-id="${ThousandRenderer._escape(game.id)}"]`);
      if (!li) {
        li = document.createElement('li');
        li.dataset.id = game.id;
        list.appendChild(li);
      }
      li.dataset.createdAt = game.createdAt || '';
      const playerList = (game.players || []).join('\n');
      li.innerHTML = `
        <span class="game-id-label">Game #${ThousandRenderer._escape(game.id)}</span>
        <span class="game-owner">Created by: ${ThousandRenderer._escape(game.owner || 'Unknown')}</span>
        <span class="game-player-count">${game.playerCount} / ${game.maxPlayers} players</span>
        <span class="game-waiting-time"></span>
      `;
      li.querySelector('.game-player-count').dataset.players = playerList;
    }

    ThousandRenderer._updateElapsedTimes();
  }

  static _formatElapsed(secs) {
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  }

  static _updateElapsedTimes() {
    const items = document.querySelectorAll('#game-list li[data-created-at]');
    const now = Date.now();
    for (const li of items) {
      const createdAt = parseInt(li.dataset.createdAt, 10);
      if (!createdAt) continue;
      const elapsed = Math.floor((now - createdAt) / 1000);
      const span = li.querySelector('.game-waiting-time');
      if (span) span.textContent = ThousandRenderer._formatElapsed(elapsed);
    }
  }

  static init(antlion) {
    ThousandRenderer._antlion = antlion;

    const tip = document.createElement('div');
    tip.id = 'player-tooltip';
    tip.className = 'player-tooltip hidden';
    document.body.appendChild(tip);

    const list = $('game-list');

    antlion.bindInput(list, 'mouseover', 'renderer-mouseover');
    antlion.onInput('renderer-mouseover', (e) => {
      const span = e.target.closest('.game-player-count[data-players]');
      if (!span) return;
      const names = span.dataset.players;
      if (!names) return;
      tip.textContent = names;
      tip.classList.remove('hidden');
      ThousandRenderer._positionTooltip(tip, span);
    });

    antlion.bindInput(list, 'mousemove', 'renderer-mousemove');
    antlion.onInput('renderer-mousemove', (e) => {
      const span = e.target.closest('.game-player-count[data-players]');
      if (!span || tip.classList.contains('hidden')) return;
      ThousandRenderer._positionTooltip(tip, span);
    });

    antlion.bindInput(list, 'mouseout', 'renderer-mouseout');
    antlion.onInput('renderer-mouseout', (e) => {
      const span = e.target.closest('.game-player-count[data-players]');
      if (span) tip.classList.add('hidden');
    });
  }

  static _positionTooltip(tip, anchor) {
    const rect = anchor.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let top = rect.top - tipRect.height - 8;
    if (top < 4) top = rect.bottom + 8;
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
  }

  static startWaitingTimer(createdAt) {
    ThousandRenderer.stopWaitingTimer();
    const start = createdAt || Date.now();
    const el = document.getElementById('waiting-elapsed');
    ThousandRenderer._waitingTimerId = ThousandRenderer._antlion.scheduleInterval(1000, () => {
      if (el) el.textContent = ThousandRenderer._formatElapsed(Math.floor((Date.now() - start) / 1000));
    });
  }

  static stopWaitingTimer() {
    if (ThousandRenderer._waitingTimerId) {
      ThousandRenderer._antlion.cancelInterval(ThousandRenderer._waitingTimerId);
      ThousandRenderer._waitingTimerId = null;
    }
    const el = document.getElementById('waiting-elapsed');
    if (el) el.textContent = '0s';
  }

  static startElapsedTimer() {
    ThousandRenderer.stopElapsedTimer();
    ThousandRenderer._elapsedTimerId = ThousandRenderer._antlion.scheduleInterval(1000, ThousandRenderer._updateElapsedTimes);
  }

  static stopElapsedTimer() {
    if (ThousandRenderer._elapsedTimerId) {
      ThousandRenderer._antlion.cancelInterval(ThousandRenderer._elapsedTimerId);
      ThousandRenderer._elapsedTimerId = null;
    }
  }

  static renderWaitingRoom(gameId, inviteCode, players) {
    $('game-id-display').textContent = `Game #${gameId}`;
    if (inviteCode) $('invite-code-value').textContent = inviteCode;
    $('invite-display').classList.toggle('hidden', !inviteCode);
    ThousandRenderer.renderWaitingRoomPlayers(players);
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

export default ThousandRenderer;
