'use strict';
/* global $ */

// ============================================================
// Toast — owns toast timer state  (T043)
// ============================================================

class Toast {
  constructor() {
    this._timer = null;
  }

  show(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.remove('hidden');
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      el.classList.add('hidden');
      this._timer = null;
    }, 4000);
  }
}
