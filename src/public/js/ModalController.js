'use strict';
/* global $ */

// ============================================================
// ModalController — new-game modal open/close/submit
// ============================================================

class ModalController {
  constructor(antlion, getNickname, onCreateGame, onError) {
    this._antlion = antlion;
    this._getNickname = getNickname;
    this._onCreateGame = onCreateGame;
    this._onError = onError;
  }

  bind() {
    this._antlion.bindInput($('new-game-btn'), 'click', 'new-game-click');
    this._antlion.onInput('new-game-click', () => this._open());

    this._antlion.bindInput($('modal-cancel-btn'), 'click', 'modal-cancel-click');
    this._antlion.onInput('modal-cancel-click', () => this._close());

    this._antlion.bindInput($('new-game-modal'), 'click', 'modal-overlay-click');
    this._antlion.onInput('modal-overlay-click', (e) => {
      if (e.target === $('new-game-modal')) this._close();
    });

    this._antlion.bindInput(document, 'keydown', 'keydown');
    this._antlion.onInput('keydown', (e) => {
      if (e.key === 'Escape') this._close();
    });

    this._antlion.bindInput($('new-game-form'), 'submit', 'new-game-submit');
    this._antlion.onInput('new-game-submit', (e) => {
      e.preventDefault();
      if (!this._getNickname()) { this._onError('Enter a nickname first.'); return; }
      const type = document.querySelector('input[name="game-type"]:checked').value;
      this._close();
      this._onCreateGame(type);
    });
  }

  _open() {
    const modal = $('new-game-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }

  _close() {
    const modal = $('new-game-modal');
    modal.classList.add('hidden');
    modal.style.display = '';
  }
}
