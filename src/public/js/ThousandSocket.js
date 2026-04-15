'use strict';

// ============================================================
// ThousandSocket — owns WebSocket connection and reconnect logic
// ============================================================

class ThousandSocket {
  constructor(antlion, onMessage, onError) {
    this._antlion = antlion;
    this._onMessage = onMessage;
    this._onError = onError;
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    // Expose for tests (jsdom looks for window._lobbyWS)
    window._lobbyWS = ws;
    try { self._lobbyWS = ws; } catch (_) {}
    this._attachHandlers(ws);
  }

  _attachHandlers(ws) {
    ws.onopen = () => {};
    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      this._onMessage(msg);
    };
    ws.onerror = () => this._onError('Connection error. Please refresh.');
    ws.onclose = () => this._antlion.schedule(3000, () => this.connect());
  }
}
