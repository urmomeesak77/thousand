import HtmlContainer from '../antlion/HtmlContainer.js';
import HtmlUtil from '../utils/HtmlUtil.js';

class WaitingRoom extends HtmlContainer {
  constructor(element) {
    super('waiting-room');
    this._element = element;
    this._isVisible = !element.classList.contains('hidden');
    this._gameId = null;
    this._inviteCode = null;
    this._players = [];
    this._requiredPlayers = null;
    this._isHost = false;
    this._timerId = null;
  }

  load(gameId, inviteCode, players, requiredPlayers, isHost) {
    this._gameId = gameId;
    this._inviteCode = inviteCode;
    this._players = players;
    this._requiredPlayers = requiredPlayers;
    this._isHost = Boolean(isHost);
    this.renderContent();
  }

  updatePlayers(players) {
    this._players = players;
    this.renderContent();
  }

  renderContent() {
    HtmlUtil.byId('game-id-display').textContent = `Game #${this._gameId}`;
    if (this._inviteCode) {
      HtmlUtil.byId('invite-code-value').textContent = this._inviteCode;
    }
    HtmlUtil.byId('invite-display').classList.toggle('hidden', !this._inviteCode);
    const ul = HtmlUtil.byId('player-list');
    ul.innerHTML = '';
    for (const p of this._players) {
      const li = document.createElement('li');
      li.textContent = p.nickname || p.id;
      // FR-012/FR-013: bots carry a clear computer-opponent badge so no human
      // mistakes a bot for another player.
      if (p.isBot) {
        const badge = document.createElement('span');
        badge.className = 'bot-badge';
        badge.textContent = 'BOT';
        li.appendChild(badge);
      }
      ul.appendChild(li);
    }
    this._renderHostControls();
    const hint = document.querySelector('.waiting-hint');
    if (hint && this._requiredPlayers !== null) {
      // FR-003: surface join progress (joined / required) alongside the start threshold
      const joined = this._players.length;
      hint.textContent =
        `Waiting for players… ${joined} / ${this._requiredPlayers} joined ` +
        `(${this._requiredPlayers} needed to start)`;
    }
  }

  // The Add Bot button is host-only (FR-005) and only useful while an empty seat
  // remains; hidden for everyone else and once the table is full.
  _renderHostControls() {
    const addBotBtn = document.getElementById('add-bot-btn');
    if (!addBotBtn) {return;}
    const seatsOpen = this._requiredPlayers !== null
      && this._players.length < this._requiredPlayers;
    addBotBtn.classList.toggle('hidden', !(this._isHost && seatsOpen));
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
