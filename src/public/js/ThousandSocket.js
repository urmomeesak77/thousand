// ============================================================
// ThousandSocket — owns WebSocket connection and reconnect logic
// ============================================================

import { IdentityStore } from './IdentityStore.js';

class ThousandSocket {
  constructor(antlion, onMessage, onError) {
    this._antlion = antlion;
    this._onMessage = onMessage;
    this._onError = onError;
    this._reconnectId = null;
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this._attachHandlers(ws);
  }

  _attachHandlers(ws) {
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'hello', ...IdentityStore.load() }));
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
    ws.onerror = () => this._onError('Connection error. Please refresh.');
    ws.onclose = () => {
      if (this._reconnectId !== null) {
        this._antlion.cancelScheduled(this._reconnectId);
      }
      this._reconnectId = this._antlion.schedule(3000, () => {
        this._reconnectId = null;
        this.connect();
      });
    };
  }
}

export default ThousandSocket;
