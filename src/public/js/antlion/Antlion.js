'use strict';
/* global EventBus */

// ============================================================
// Antlion — game engine: lifecycle, input capture, tick loop
// ============================================================

class Antlion {
  constructor() {
    this._bus = new EventBus();
    this._tickHandlers = [];
    this._domListeners = [];
    this._running = false;
    this._rafId = null;
  }

  // Register a handler for a named input event
  onInput(type, handler) {
    this._bus.on(type, handler);
  }

  // Register a per-frame callback
  onTick(handler) {
    this._tickHandlers.push(handler);
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

  start() {
    if (this._running) return;
    this._running = true;
    this._tick();
  }

  stop() {
    this._running = false;
    if (this._rafId !== null) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    this._domListeners.forEach(({ element, domEvent, handler }) => {
      element.removeEventListener(domEvent, handler);
    });
    this._domListeners = [];
    this._bus.clear();
  }

  _tick() {
    if (!this._running) return;
    this._tickHandlers.forEach(h => h());
    this._rafId = requestAnimationFrame(() => this._tick());
  }
}
