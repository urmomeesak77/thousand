class GameObject {
  constructor(name) {
    this.name = name;
    this._parent = null;
    this._scene = null;
    this._isEnabled = true;
    this._isVisible = true;
    this._behaviours = new Map();
  }

  onCreate() {}
  onDestroy() {}

  update(dt) {
    for (const [, b] of this._behaviours) {
      if (b._isEnabled) {
        b.update(dt);
      }
    }
  }

  render() {}

  enable() {
    this._isEnabled = true;
  }

  disable() {
    this._isEnabled = false;
  }

  setEnabled(enabled) {
    this._isEnabled = enabled;
  }

  show() {
    this._isVisible = true;
  }

  hide() {
    this._isVisible = false;
  }

  setVisible(visible) {
    this._isVisible = visible;
  }

  isEnabled() {
    return this._isEnabled;
  }

  isVisible() {
    return this._isVisible;
  }

  addBehaviour(name, b) {
    b.owner = this;
    b.onAttach();
    this._behaviours.set(name, b);
  }

  removeBehaviour(name) {
    const b = this._behaviours.get(name);
    if (!b) {
      return;
    }
    b.onDetach();
    b.owner = null;
    this._behaviours.delete(name);
  }

  getBehaviour(name) {
    return this._behaviours.get(name);
  }

  getScene() {
    if (this._scene) {
      return this._scene;
    }
    return this._parent ? this._parent.getScene() : null;
  }

  getEngine() {
    const scene = this.getScene();
    return scene ? scene.engine : null;
  }
}

export default GameObject;
