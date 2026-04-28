class GameObject {
  constructor(name) {
    this.name = name;
    this._parent = null;
    this._scene = null;
    this._enabled = true;
    this._visible = true;
    this._behaviours = new Map();
  }

  onCreate() {}
  onDestroy() {}

  update(dt) {
    for (const [, b] of this._behaviours) {
      if (b._enabled) {
        b.update(dt);
      }
    }
  }

  render() {}

  enable() { this._enabled = true; }
  disable() { this._enabled = false; }
  setEnabled(bool) { this._enabled = bool; }
  show() { this._visible = true; }
  hide() { this._visible = false; }
  setVisible(bool) { this._visible = bool; }
  isEnabled() { return this._enabled; }
  isVisible() { return this._visible; }

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

  getBehaviour(name) { return this._behaviours.get(name); }

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
