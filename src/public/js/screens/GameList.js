import HtmlGameObject from '../antlion/HtmlGameObject.js';
import HtmlUtil from '../utils/HtmlUtil.js';

class GameList extends HtmlGameObject {
  constructor(element) {
    super('game-list', 'ul');
    this._element = element;
    this._isVisible = !element.classList.contains('hidden');
    this._games = [];
    this._elapsedTimerId = null;
  }

  setGames(games) {
    this._games = games;
    this.renderContent();
  }

  renderContent() {
    const emptyState = document.getElementById('empty-state');
    if (!this._games || this._games.length === 0) {
      this._element.innerHTML = '';
      if (emptyState) {
        emptyState.classList.remove('hidden');
      }
      return;
    }
    if (emptyState) {
      emptyState.classList.add('hidden');
    }
    const newIds = new Set(this._games.map((g) => g.id));
    for (const li of [...this._element.querySelectorAll('li')]) {
      if (!newIds.has(li.dataset.id)) {
        li.remove();
      }
    }
    for (const game of this._games) {
      let li = this._element.querySelector(`li[data-id="${HtmlUtil.escapeSelector(game.id)}"]`);
      if (!li) {
        li = document.createElement('li');
        li.dataset.id = game.id;
        this._element.appendChild(li);
      }
      li.dataset.createdAt = game.createdAt || '';
      const playerList = (game.players || []).join('\n');
      li.innerHTML = `
        <span class="game-id-label">Game #${HtmlUtil.escape(game.id)}</span>
        <span class="game-owner">Created by: ${HtmlUtil.escape(game.owner || 'Unknown')}</span>
        <span class="game-player-count">${game.playerCount} / ${game.requiredPlayers} needed</span>
        <span class="game-waiting-time"></span>
      `;
      li.querySelector('.game-player-count').dataset.players = playerList;
    }
    this._updateElapsedTimes();
  }

  startElapsedTimer() {
    this.stopElapsedTimer();
    this._elapsedTimerId = this.getEngine().scheduleInterval(1000, () => this._updateElapsedTimes());
  }

  stopElapsedTimer() {
    if (this._elapsedTimerId) {
      this.getEngine().cancelInterval(this._elapsedTimerId);
      this._elapsedTimerId = null;
    }
  }

  onDestroy() {
    this.stopElapsedTimer();
    super.onDestroy();
  }

  _updateElapsedTimes() {
    const now = Date.now();
    for (const li of this._element.querySelectorAll('li[data-created-at]')) {
      const createdAt = parseInt(li.dataset.createdAt, 10);
      if (!createdAt) {
        continue;
      }
      const span = li.querySelector('.game-waiting-time');
      if (span) {
        span.textContent = HtmlUtil.formatElapsed(Math.floor((now - createdAt) / 1000));
      }
    }
  }
}

export default GameList;
