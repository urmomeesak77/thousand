class Behaviour {
  constructor() {
    this.owner = null;
    this._isEnabled = true;
  }

  enable() { this._isEnabled = true; }
  disable() { this._isEnabled = false; }

  onAttach() {}
  onDetach() {}
  update(_dt) {}
}

export default Behaviour;
