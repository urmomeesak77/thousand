import HtmlContainer from '../antlion/HtmlContainer.js';
import HtmlUtil from '../utils/HtmlUtil.js';

class WaitingRoom extends HtmlContainer {
  constructor(element) {
    super('waiting-room');
    this._element = element;
    this._visible = !element.classList.contains('hidden');
    this._gameId = null;
    this._inviteCode = null;
    this._players = [];
    this._requiredPlayers = null;
    this._timerId = null;
  }

  load(gameId, inviteCode, players, requiredPlayers) {
    this._gameId = gameId;
    this._inviteCode = inviteCode;
    this._players = players;
    this._requiredPlayers = requiredPlayers;
    this.renderContent();
  }

  updatePlayers(players) {
    this._players = players;
    this.renderContent();
  }

  renderContent() {
    const el = (id) => document.getElementById(id);
    el('game-id-display').textContent = `Game #${this._gameId}`;
    if (this._inviteCode) {
      el('invite-code-value').textContent = this._inviteCode;
    }
    el('invite-display').classList.toggle('hidden', !this._inviteCode);
    const ul = el('player-list');
    ul.innerHTML = '';
    for (const p of this._players) {
      const li = document.createElement('li');
      li.textContent = p.nickname || p.id;
      ul.appendChild(li);
    }
    const hint = document.querySelector('.waiting-hint');
    if (hint && this._requiredPlayers !== null) {
      hint.textContent = `Waiting for players… (${this._requiredPlayers} needed to start)`;
    }
  }

  startTimer(createdAt) {
    this.stopTimer();
    const start = createdAt || Date.now();
    const elapsed = document.getElementById('waiting-elapsed');
    this._timerId = this.getEngine().scheduleInterval(1000, () => {
      if (elapsed) {
        elapsed.textContent = HtmlUtil.formatElapsed(Math.floor((Date.now() - start) / 1000));
      }
    });
  }

  stopTimer() {
    if (this._timerId) {
      this.getEngine().cancelInterval(this._timerId);
      this._timerId = null;
    }
    const elapsed = document.getElementById('waiting-elapsed');
    if (elapsed) {
      elapsed.textContent = '0s';
    }
  }

  onDestroy() {
    if (this._timerId) {
      this.getEngine().cancelInterval(this._timerId);
      this._timerId = null;
    }
    super.onDestroy();
  }
}

export default WaitingRoom;
