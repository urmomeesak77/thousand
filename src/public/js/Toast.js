const $ = (id) => document.getElementById(id);

// ============================================================
// Toast — owns toast timer state  (T043)
// ============================================================

class Toast {
  constructor(antlion) {
    this._antlion = antlion;
    this._timer = null;
  }

  show(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.remove('hidden');
    if (this._timer) this._antlion.cancelScheduled(this._timer);
    this._timer = this._antlion.schedule(4000, () => {
      el.classList.add('hidden');
      this._timer = null;
    });
  }
}

export default Toast;
