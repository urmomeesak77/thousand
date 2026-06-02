// ============================================================
// DeclarerDecisionControls — Sell / Start buttons per FR-026, FR-017, FR-018
// ============================================================

import HtmlUtil from '../utils/HtmlUtil.js';

class DeclarerDecisionControls {
  constructor(container, antlion, dispatcher, onDecision = () => {}) {
    this._antlion = antlion;
    this._dispatcher = dispatcher;
    this._onDecision = onDecision;
    this._mode = 'hidden'; // 'full' | 'sell-disabled' | 'sell-hidden' | 'hidden'
    this._teardowns = [];

    this._el = document.createElement('div');
    this._el.className = 'declarer-controls hidden';
    container.appendChild(this._el);

    this._sellBtn = HtmlUtil.button('Sell', 'declarer-controls__sell btn btn--secondary');
    this._startBtn = HtmlUtil.button('Start the Game', 'declarer-controls__start btn');

    this._el.append(this._sellBtn, this._startBtn);
    this._bindEvents();
  }

  // 'full'          — both Sell and Start operable (original declarer, < 3 attempts)
  // 'sell-disabled' — Sell visible but disabled, Start operable (3 failed attempts, FR-018)
  // 'sell-hidden'   — Sell not rendered, Start operable (new declarer after sale, FR-017)
  // 'hidden'        — entire control hidden (non-declarer or wrong phase)
  setMode(mode) {
    this._mode = mode;
    this._applyMode();
  }

  _applyMode() {
    if (this._mode === 'hidden') {
      this._el.classList.add('hidden');
      return;
    }
    this._el.classList.remove('hidden');

    if (this._mode === 'sell-hidden') {
      this._sellBtn.classList.add('hidden');
      this._sellBtn.disabled = true;
    } else {
      this._sellBtn.classList.remove('hidden');
      this._sellBtn.disabled = this._mode === 'sell-disabled';
    }

    this._startBtn.disabled = false;
  }

  _bindEvents() {
    const sellHandler = () => {
      if (this._mode !== 'full') {return;}
      this._onDecision();
      this._dispatcher.sendSellStart();
    };
    this._teardowns.push(this._antlion.bindInput(this._sellBtn, 'click', 'declarer-sell-click'));
    this._antlion.onInput('declarer-sell-click', sellHandler);
    this._teardowns.push(() => this._antlion.offInput('declarer-sell-click', sellHandler));

    const startHandler = () => {
      if (this._mode === 'hidden') {return;}
      this._onDecision();
      this._dispatcher.sendStartGame();
    };
    this._teardowns.push(this._antlion.bindInput(this._startBtn, 'click', 'declarer-start-click'));
    this._antlion.onInput('declarer-start-click', startHandler);
    this._teardowns.push(() => this._antlion.offInput('declarer-start-click', startHandler));
  }

  destroy() {
    for (const dispose of this._teardowns) { dispose(); }
    this._teardowns = [];
    if (this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
  }
}

export default DeclarerDecisionControls;
