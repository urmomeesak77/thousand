'use strict';
/* global $ */

// ============================================================
// ModalController — new-game modal open/close/submit
// ============================================================

class ModalController {
  constructor(getNickname, onCreateGame, onError) {
    this._getNickname = getNickname;
    this._onCreateGame = onCreateGame;
    this._onError = onError;
  }

  bind() {
    $('new-game-btn').addEventListener('click', () => this._open());
    $('modal-cancel-btn').addEventListener('click', () => this._close());
    $('new-game-modal').addEventListener('click', (e) => {
      if (e.target === $('new-game-modal')) this._close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._close();
    });
    $('new-game-form').addEventListener('submit', (e) => {
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
