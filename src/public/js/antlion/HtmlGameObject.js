import GameObject from './GameObject.js';

class HtmlGameObject extends GameObject {
  constructor(name, tag = 'div') {
    super(name);
    this._element = document.createElement(tag);
    this._dirty = false;
  }

  static adopt(name, element) {
    const obj = new this(name);
    obj._element = element;
    obj._visible = !element.classList.contains('hidden');
    return obj;
  }

  get element() { return this._element; }

  markDirty() { this._dirty = true; }

  renderContent() {}

  show() {
    super.show();
    this._element.classList.remove('hidden');
  }

  hide() {
    super.hide();
    this._element.classList.add('hidden');
  }

  render() {
    if (this._dirty) {
      this.renderContent();
      this._dirty = false;
    }
  }

  bindInput(domEvent, engineEvent) {
    const engine = this.getEngine();
    if (engine) {
      engine.bindInput(this._element, domEvent, engineEvent);
    }
  }

  onCreate() {
    this.renderContent();
  }

  onDestroy() {
    if (this._element.parentNode) {
      this._element.parentNode.removeChild(this._element);
    }
  }
}

export default HtmlGameObject;
