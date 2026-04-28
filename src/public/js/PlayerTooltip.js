import HtmlGameObject from './antlion/HtmlGameObject.js';

class PlayerTooltip extends HtmlGameObject {
  constructor() {
    super('player-tooltip', 'div');
    this._element.className = 'player-tooltip hidden';
  }

  onCreate() {
    document.body.appendChild(this._element);
    const engine = this.getEngine();
    const list = document.getElementById('game-list');
    engine.bindInput(list, 'mouseover', 'tooltip-mouseover');
    engine.onInput('tooltip-mouseover', (e) => this._onMouseover(e));
    engine.bindInput(list, 'mousemove', 'tooltip-mousemove');
    engine.onInput('tooltip-mousemove', (e) => this._onMousemove(e));
    engine.bindInput(list, 'mouseout', 'tooltip-mouseout');
    engine.onInput('tooltip-mouseout', (e) => this._onMouseout(e));
  }

  _onMouseover(e) {
    const span = e.target.closest('.game-player-count[data-players]');
    if (!span) {
      return;
    }
    const names = span.dataset.players;
    if (!names) {
      return;
    }
    this._element.textContent = names;
    this._element.classList.remove('hidden');
    this._positionTooltip(span);
  }

  _onMousemove(e) {
    const span = e.target.closest('.game-player-count[data-players]');
    if (!span || this._element.classList.contains('hidden')) {
      return;
    }
    this._positionTooltip(span);
  }

  _onMouseout(e) {
    const span = e.target.closest('.game-player-count[data-players]');
    if (span) {
      this._element.classList.add('hidden');
    }
  }

  _positionTooltip(anchor) {
    const rect = anchor.getBoundingClientRect();
    const tipRect = this._element.getBoundingClientRect();
    let top = rect.top - tipRect.height - 8;
    if (top < 4) {
      top = rect.bottom + 8;
    }
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    this._element.style.top = `${top}px`;
    this._element.style.left = `${left}px`;
  }
}

export default PlayerTooltip;
