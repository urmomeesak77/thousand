import HtmlGameObject from './HtmlGameObject.js';

class HtmlContainer extends HtmlGameObject {
  constructor(name, tag = 'div') {
    super(name, tag);
    this._children = [];
  }

  get children() { return [...this._children]; }

  addChild(child) {
    if (child._parent) {
      child._parent.removeChild(child);
    }
    if (child.element && child.element.parentNode !== this._element) {
      this._element.appendChild(child.element);
    }
    child._parent = this;
    this._children.push(child);
    if (this.getScene()) {
      child.onCreate();
    }
  }

  removeChild(child) {
    const idx = this._children.indexOf(child);
    if (idx === -1) {
      return;
    }
    this._children.splice(idx, 1);
    child._parent = null;
    child.onDestroy();
  }

  removeAllChildren() {
    for (const child of [...this._children]) {
      child._parent = null;
      child.onDestroy();
    }
    this._children = [];
  }

  getChild(name) { return this._children.find(c => c.name === name); }
  hasChild(name) { return this._children.some(c => c.name === name); }

  onCreate() {
    super.onCreate();
    for (const child of this._children) {
      child.onCreate();
    }
  }

  onDestroy() {
    for (const child of [...this._children]) {
      child._parent = null;
      child.onDestroy();
    }
    this._children = [];
    super.onDestroy();
  }

  update(dt) {
    super.update(dt);
    for (const child of this._children) {
      if (child.isEnabled()) {
        child.update(dt);
      }
    }
  }

  render() {
    if (!this.isVisible()) {
      return;
    }
    super.render();
    for (const child of this._children) {
      if (child.isEnabled() && child.isVisible()) {
        child.render();
      }
    }
  }
}

export default HtmlContainer;
