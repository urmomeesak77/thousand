// ============================================================
// ThousandSocket — owns WebSocket connection and reconnect logic
// ============================================================

import { IdentityStore } from '../storage/IdentityStore.js';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

class ThousandSocket {
  constructor(antlion, onMessage, onError, onDisconnect) {
    this._antlion = antlion;
    this._onMessage = onMessage;
    this._onError = onError;
    this._onDisconnect = onDisconnect ?? null;
    this._reconnectId = null;
    this._ws = null;
    this._stopped = false;
    this._attempts = 0;
  }

  connect() {
    if (this._stopped) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this._ws = ws;
    this._attachHandlers(ws);
  }

  disconnect() {
    this._stopped = true;
    if (this._reconnectId !== null) {
      this._antlion.cancelScheduled(this._reconnectId);
      this._reconnectId = null;
    }
    if (this._ws && this._ws.readyState !== 2 /* CLOSING */ && this._ws.readyState !== 3 /* CLOSED */) {
      this._ws.close();
    }
  }

  _attachHandlers(ws) {
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'hello', ...IdentityStore.load() }));
      this._attempts = 0;
    };
    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      }
      catch {
        return;
      }
      this._onMessage(msg);
    };
    ws.onerror = () => this._onError('Connection error.');
    ws.onclose = () => {
      if (this._stopped) return;
      this._onDisconnect?.();
      if (this._reconnectId !== null) {
        this._antlion.cancelScheduled(this._reconnectId);
      }
      const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this._attempts);
      // ±20% jitter prevents reconnect storms when many clients drop simultaneously.
      const delay = base * (0.8 + Math.random() * 0.4);
      this._attempts += 1;
      this._reconnectId = this._antlion.schedule(delay, () => {
        this._reconnectId = null;
        this.connect();
      });
    };
  }
}

export default ThousandSocket;
