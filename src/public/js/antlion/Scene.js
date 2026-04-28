import HtmlContainer from './HtmlContainer.js';

class Scene {
  constructor(engine, rootElement) {
    this.engine = engine;
    this.root = HtmlContainer.adopt('root', rootElement);
    this.root._scene = this;
    this._running = false;
    this._lastTime = 0;
  }

  start() {
    this._running = true;
    this._lastTime = performance.now();
    this.engine.onTick(() => this._tick());
  }

  stop() {
    this._running = false;
  }

  _tick() {
    if (!this._running) {
      return;
    }
    const now = performance.now();
    const dt = now - this._lastTime;
    this._lastTime = now;
    this.root.update(dt);
    this.root.render();
  }
}

export default Scene;
