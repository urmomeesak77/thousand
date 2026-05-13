import HtmlUtil from '../utils/HtmlUtil.js';

const TOAST_DURATION_MS = 4000;

class Toast {
  constructor(antlion) {
    this._antlion = antlion;
    this._timer = null;
  }

  show(message) {
    const el = HtmlUtil.byId('toast');
    el.textContent = message;
    el.classList.remove('hidden');
    if (this._timer) {
      this._antlion.cancelScheduled(this._timer);
    }
    this._timer = this._antlion.schedule(TOAST_DURATION_MS, () => {
      el.classList.add('hidden');
      this._timer = null;
    });
  }
}

export default Toast;
