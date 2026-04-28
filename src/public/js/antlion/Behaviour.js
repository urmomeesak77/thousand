class Behaviour {
  constructor() {
    this.owner = null;
    this._enabled = true;
  }

  enable() { this._enabled = true; }
  disable() { this._enabled = false; }

  onAttach() {}
  onDetach() {}
  update(_dt) {}
}

export default Behaviour;
