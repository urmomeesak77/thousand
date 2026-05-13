// ============================================================
// RoundReadyScreen — full-screen take-over for round end (FR-019, FR-021)
// ============================================================

class RoundReadyScreen {
  constructor(container, antlion, { mode, context }, onBackToLobby) {
    this._antlion = antlion;

    this._el = document.createElement('div');
    this._el.className = 'round-ready-screen';
    container.appendChild(this._el);

    const heading = document.createElement('h2');
    heading.className = 'round-ready-screen__heading';
    const body = document.createElement('p');
    body.className = 'round-ready-screen__body';
    const btn = document.createElement('button');
    btn.className = 'round-ready-screen__back btn';
    btn.textContent = 'Back to Lobby';

    if (mode === 'ready') {
      heading.textContent = 'Round ready to play';
      body.textContent = 'Round ready to play — next phase coming soon';
    } else if (context.reason === 'player_left') {
      heading.textContent = 'Game ended';
      body.textContent = `${context.disconnectedNickname} left the game.`;
    } else {
      heading.textContent = 'Round aborted';
      body.textContent = `Round aborted — ${context.disconnectedNickname} did not reconnect`;
    }

    this._el.append(heading, body, btn);

    this._antlion.bindInput(btn, 'click', 'round-ready-back-click');
    this._antlion.onInput('round-ready-back-click', () => {
      onBackToLobby();
    });
  }

  destroy() {
    if (this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
  }
}

export default RoundReadyScreen;
