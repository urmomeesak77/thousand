// ============================================================
// EventBus — subscribe/emit for named engine events
// ============================================================

class EventBus {
  constructor() {
    this._handlers = new Map();
  }

  on(type, handler) {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, []);
    }
    this._handlers.get(type).push(handler);
  }

  off(type, handler) {
    if (!this._handlers.has(type)) {
      return;
    }
    this._handlers.set(type, this._handlers.get(type).filter(h => h !== handler));
  }

  emit(type, data) {
    (this._handlers.get(type) || []).slice().forEach(h => h(data));
  }

  clear() {
    this._handlers.clear();
  }
}

export default EventBus;
