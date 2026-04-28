import HtmlContainer from './antlion/HtmlContainer.js';

class WaitingRoom extends HtmlContainer {
  constructor(element) {
    super('waiting-room');
    this._element = element;
    this._visible = !element.classList.contains('hidden');
    this._gameId = null;
    this._inviteCode = null;
    this._players = [];
    this._timerId = null;
  }

  load(gameId, inviteCode, players) {
    this._gameId = gameId;
    this._inviteCode = inviteCode;
    this._players = players;
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
  }

  startTimer(createdAt) {
    this.stopTimer();
    const start = createdAt || Date.now();
    const elapsed = document.getElementById('waiting-elapsed');
    this._timerId = this.getEngine().scheduleInterval(1000, () => {
      if (elapsed) {
        elapsed.textContent = this._formatElapsed(Math.floor((Date.now() - start) / 1000));
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

  _formatElapsed(secs) {
    if (secs < 60) {
      return `${secs}s`;
    }
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  }
}

export default WaitingRoom;
