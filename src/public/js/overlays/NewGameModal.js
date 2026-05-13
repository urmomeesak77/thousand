import HtmlUtil from '../utils/HtmlUtil.js';

// ============================================================
// NewGameModal — new-game modal open/close/submit
// ============================================================

class NewGameModal {
  constructor(antlion, getNickname, onCreateGame, onError) {
    this._antlion = antlion;
    this._getNickname = getNickname;
    this._onCreateGame = onCreateGame;
    this._onError = onError;
  }

  bind() {
    this._antlion.bindInput(HtmlUtil.byId('new-game-btn'), 'click', 'new-game-click');
    this._antlion.onInput('new-game-click', () => this._open());

    this._antlion.bindInput(HtmlUtil.byId('modal-cancel-btn'), 'click', 'modal-cancel-click');
    this._antlion.onInput('modal-cancel-click', () => this._close());

    this._antlion.bindInput(HtmlUtil.byId('new-game-modal'), 'click', 'modal-overlay-click');
    this._antlion.onInput('modal-overlay-click', (e) => {
      if (e.target === HtmlUtil.byId('new-game-modal')) {
        this._close();
      }
    });

    this._antlion.bindInput(document, 'keydown', 'keydown');
    this._antlion.onInput('keydown', (e) => {
      if (e.key === 'Escape') {
        this._close();
      }
    });

    this._antlion.bindInput(HtmlUtil.byId('new-game-form'), 'submit', 'new-game-submit');
    this._antlion.onInput('new-game-submit', (e) => {
      e.preventDefault();
      if (!this._getNickname()) {
        this._onError('Enter a nickname first.');
        return;
      }
      const checked = document.querySelector('input[name="game-type"]:checked');
      if (!checked) {
        this._onError('Pick public or private.');
        return;
      }
      const requiredPlayers = parseInt(HtmlUtil.byId('player-count').value, 10);
      this._close();
      this._onCreateGame(checked.value, requiredPlayers);
    });
  }

  _open() {
    HtmlUtil.byId('new-game-modal').classList.remove('hidden');
  }

  _close() {
    HtmlUtil.byId('new-game-modal').classList.add('hidden');
  }
}

export default NewGameModal;
