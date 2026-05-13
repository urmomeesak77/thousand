import EventBus from './EventBus.js';

// ============================================================
// Antlion — game engine: lifecycle, input capture, tick loop
// ============================================================

class Antlion {
  constructor() {
    this._bus = new EventBus();
    this._tickHandlers = [];
    this._domListeners = [];
    this._timers = [];
    this._intervals = [];
    this._isRunning = false;
    this._rafId = null;
  }

  // Register a handler for a named input event
  onInput(type, handler) {
    this._bus.on(type, handler);
  }

  // Register a per-frame callback; returns a cancel function to remove the handler.
  onTick(handler) {
    this._tickHandlers.push(handler);
    return () => { this._tickHandlers = this._tickHandlers.filter(h => h !== handler); };
  }

  // Dispatch an engine-level event
  emit(type, data) {
    this._bus.emit(type, data);
  }

  // Wire a DOM element's native event to a named engine input event
  bindInput(element, domEvent, type) {
    const handler = (e) => this._bus.emit(type, e);
    element.addEventListener(domEvent, handler);
    this._domListeners.push({ element, domEvent, handler });
  }

  // Schedule a delayed callback (replaces direct setTimeout in feature modules)
  schedule(delay, cb) {
    // Self-removing wrapper: a timer that fires naturally would otherwise
    // accumulate in `_timers` for the lifetime of the engine.
    let id;
    const wrapped = () => {
      this._timers = this._timers.filter((t) => t !== id);
      cb();
    };
    id = setTimeout(wrapped, delay);
    this._timers.push(id);
    return id;
  }

  // Cancel a scheduled timeout (replaces direct clearTimeout in feature modules)
  cancelScheduled(id) {
    clearTimeout(id);
    this._timers = this._timers.filter((t) => t !== id);
  }

  // Schedule a repeating callback (replaces direct setInterval in feature modules)
  scheduleInterval(delay, cb) {
    const id = setInterval(cb, delay);
    this._intervals.push(id);
    return id;
  }

  // Cancel a repeating interval (replaces direct clearInterval in feature modules)
  cancelInterval(id) {
    clearInterval(id);
    this._intervals = this._intervals.filter((t) => t !== id);
  }

  start() {
    if (this._isRunning) {
      return;
    }
    this._isRunning = true;
    if (this._tickHandlers.length > 0) {
      this._tick();
    }
  }

  stop() {
    this._isRunning = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
    }
    this._rafId = null;
    this._timers.forEach((id) => clearTimeout(id));
    this._timers = [];
    this._intervals.forEach((id) => clearInterval(id));
    this._intervals = [];
    this._domListeners.forEach(({ element, domEvent, handler }) => {
      element.removeEventListener(domEvent, handler);
    });
    this._domListeners = [];
    this._bus.clear();
  }

  _tick() {
    if (!this._isRunning) {
      return;
    }
    this._tickHandlers.forEach(h => h());
    this._rafId = requestAnimationFrame(() => this._tick());
  }
}

export default Antlion;
