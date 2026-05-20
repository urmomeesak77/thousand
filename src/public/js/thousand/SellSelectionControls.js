// ============================================================
// SellSelectionControls — card-selection UI for the declarer per FR-029
// ============================================================

import HtmlUtil from '../utils/HtmlUtil.js';
import { SELL_SELECTION_SIZE } from './constants.js';

class SellSelectionControls {
  constructor(container, antlion, dispatcher) {
    this._antlion = antlion;
    this._dispatcher = dispatcher;
    this._selectedIds = [];
    this._isVisible = false;
    this._teardowns = [];

    this._el = document.createElement('div');
    this._el.className = 'sell-selection-controls hidden';
    container.appendChild(this._el);

    this._counter = document.createElement('span');
    this._counter.className = 'sell-selection-controls__counter';

    this._sellBtn = HtmlUtil.button('Sell', 'sell-selection-controls__sell btn');
    this._cancelBtn = HtmlUtil.button('Cancel', 'sell-selection-controls__cancel btn btn--secondary');

    this._el.append(this._counter, this._sellBtn, this._cancelBtn);
    this._updateCounter();
    this._bindEvents();
  }

  show() {
    this._selectedIds = [];
    this._updateCounter();
    this._el.classList.remove('hidden');
    this._isVisible = true;
  }

  hide() {
    this._el.classList.add('hidden');
    this._isVisible = false;
  }

  _updateCounter() {
    const n = this._selectedIds.length;
    this._counter.textContent = `Selected: ${n} / ${SELL_SELECTION_SIZE}`;
    this._sellBtn.disabled = n !== SELL_SELECTION_SIZE;
  }

  _on(type, handler) {
    this._antlion.onInput(type, handler);
    this._teardowns.push(() => this._antlion.offInput(type, handler));
  }

  _bindEvents() {
    // Receives selection state emitted by HandView.setSelectionMode (T068)
    this._on('selectionchanged', (selectedIds) => {
      if (!this._isVisible) {return;}
      this._selectedIds = selectedIds ?? [];
      this._updateCounter();
    });

    this._teardowns.push(this._antlion.bindInput(this._sellBtn, 'click', 'sell-confirm-click'));
    this._on('sell-confirm-click', () => {
      if (!this._isVisible || this._selectedIds.length !== SELL_SELECTION_SIZE) {
        return;
      }
      this._dispatcher.sendSellSelect([...this._selectedIds]);
    });

    this._teardowns.push(this._antlion.bindInput(this._cancelBtn, 'click', 'sell-cancel-click'));
    this._on('sell-cancel-click', () => {
      if (!this._isVisible) {return;}
      this._dispatcher.sendSellCancel();
    });
  }

  destroy() {
    for (const dispose of this._teardowns) { dispose(); }
    this._teardowns = [];
    if (this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
  }
}

export default SellSelectionControls;
