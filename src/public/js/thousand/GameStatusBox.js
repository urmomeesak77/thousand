// ============================================================
// GameStatusBox — prominent status label above the talon
// ============================================================

class GameStatusBox {
  constructor(container) {
    this._el = document.createElement('div');
    this._el.className = 'game-status-box hidden';
    container.appendChild(this._el);
  }

  setText(text, isActive = false) {
    this._el.textContent = text;
    this._el.classList.toggle('game-status-box--active', isActive);
    this._el.classList.toggle('hidden', !text);
  }
}

export default GameStatusBox;
