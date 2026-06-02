import HtmlUtil from '../utils/HtmlUtil.js';

// ============================================================
// RulesModal — shared game-rules modal open/close
// ============================================================

class RulesModal {
  constructor(antlion) {
    this._antlion = antlion;
  }

  bind() {
    document.querySelectorAll('.rules-btn').forEach((el) => {
      this._antlion.bindInput(el, 'click', 'rules-open');
    });
    this._antlion.onInput('rules-open', () => this._open());

    this._antlion.bindInput(HtmlUtil.byId('rules-close-btn'), 'click', 'rules-close');
    this._antlion.onInput('rules-close', () => this._close());

    this._antlion.bindInput(HtmlUtil.byId('rules-modal'), 'click', 'rules-overlay-click');
    this._antlion.onInput('rules-overlay-click', (e) => {
      if (e.target === HtmlUtil.byId('rules-modal')) {
        this._close();
      }
    });

    this._antlion.bindInput(document, 'keydown', 'rules-keydown');
    this._antlion.onInput('rules-keydown', (e) => {
      if (e.key === 'Escape') {
        this._close();
      }
    });
  }

  _open() {
    HtmlUtil.byId('rules-modal').classList.remove('hidden');
  }

  _close() {
    HtmlUtil.byId('rules-modal').classList.add('hidden');
  }
}

export default RulesModal;
