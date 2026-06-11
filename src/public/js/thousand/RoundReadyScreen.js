// ============================================================
// RoundReadyScreen — full-screen take-over for round end (FR-019, FR-021)
// ============================================================

class RoundReadyScreen {
  constructor(container, antlion, { mode, context, t }, onBackToLobby) {
    this._antlion = antlion;
    this._teardowns = [];

    this._el = document.createElement('div');
    this._el.className = 'round-ready-screen';
    container.appendChild(this._el);

    const heading = document.createElement('h2');
    heading.className = 'round-ready-screen__heading';
    const body = document.createElement('p');
    body.className = 'round-ready-screen__body';
    const btn = document.createElement('button');
    btn.className = 'round-ready-screen__back btn';
    btn.textContent = t('game.backToLobby');

    if (mode === 'ready') {
      heading.textContent = t('game.roundReadyTitle');
      body.textContent = t('game.roundReadyBody');
    } else if (context.reason === 'player_left') {
      heading.textContent = t('game.gameEndedTitle');
      body.textContent = t('game.playerLeft', { name: context.disconnectedNickname });
    } else {
      heading.textContent = t('game.roundAbortedTitle');
      body.textContent = t('game.playerNoReconnect', { name: context.disconnectedNickname });
    }

    this._el.append(heading, body, btn);

    this._teardowns.push(this._antlion.bindInput(btn, 'click', 'round-ready-back-click'));
    const backHandler = () => onBackToLobby();
    this._antlion.onInput('round-ready-back-click', backHandler);
    this._teardowns.push(() => this._antlion.offInput('round-ready-back-click', backHandler));
  }

  destroy() {
    for (const dispose of this._teardowns) { dispose(); }
    this._teardowns = [];
    if (this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
  }
}

export default RoundReadyScreen;
