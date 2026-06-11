import HtmlContainer from '../antlion/HtmlContainer.js';
import HtmlUtil from '../utils/HtmlUtil.js';

class WaitingRoom extends HtmlContainer {
  constructor(element, t) {
    super('waiting-room');
    this._element = element;
    this._t = t;
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
    HtmlUtil.byId('game-id-display').textContent = this._t('lobby.gameNumber', { id: this._gameId });
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
        badge.textContent = this._t('game.botBadge');
        li.appendChild(badge);
        // FR-002/FR-005: only the host gets a per-bot Remove control.
        if (this._isHost && p.id) {
          const remove = document.createElement('button');
          remove.className = 'btn btn-ghost btn-sm remove-bot-btn';
          remove.dataset.botId = p.id;
          remove.textContent = this._t('waiting.removeBot');
          li.appendChild(remove);
        }
      }
      ul.appendChild(li);
    }
    this._renderHostControls();
    const hint = document.querySelector('.waiting-hint');
    if (hint && this._requiredPlayers !== null) {
      // FR-003: surface join progress (joined / required) alongside the start threshold
      hint.textContent = this._t('waiting.hintProgress', {
        joined: this._players.length, required: this._requiredPlayers,
      });
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
        elapsed.textContent = HtmlUtil.formatElapsed(
          Math.floor((Date.now() - start) / 1000), this._t,
        );
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
      elapsed.textContent = HtmlUtil.formatElapsed(0, this._t);
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
