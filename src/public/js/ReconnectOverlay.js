export class ReconnectOverlay {
  constructor(element) {
    this._el = element;
  }

  show() {
    this._el.classList.remove('hidden');
  }

  hide() {
    this._el.classList.add('hidden');
  }
}
