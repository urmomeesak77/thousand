// ============================================================
// ThousandSocket — owns WebSocket connection and reconnect logic
// ============================================================

import { IdentityStore } from '../storage/IdentityStore.js';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const CONNECT_TIMEOUT_MS = 10000;
const WS_CONNECTING = 0;
const WS_OPEN = 1;

class ThousandSocket {
  constructor(antlion, onMessage, onError, onDisconnect, onConnect) {
    this._antlion = antlion;
    this._onMessage = onMessage;
    this._onError = onError;
    this._onDisconnect = onDisconnect ?? null;
    this._onConnect = onConnect ?? null;
    this._reconnectId = null;
    this._connectTimeoutId = null;
    this._ws = null;
    this._isStopped = false;
    this._attempts = 0;
  }

  connect() {
    if (this._isStopped) {return;}
    const prev = this._ws;
    if (prev && (prev.readyState === WS_CONNECTING || prev.readyState === WS_OPEN)) {
      prev.close();
    }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this._ws = ws;
    this._connectTimeoutId = this._antlion.schedule(CONNECT_TIMEOUT_MS, () => {
      this._connectTimeoutId = null;
      // Browser TCP timeout can be ~75s — force a close so the backoff loop progresses.
      if (this._ws === ws && ws.readyState !== WS_OPEN) {
        ws.close();
      }
    });
    this._attachHandlers(ws);
  }

  send(msg) {
    if (this._ws && this._ws.readyState === 1 /* OPEN */) {
      this._ws.send(JSON.stringify(msg));
    }
  }

  disconnect() {
    this._isStopped = true;
    if (this._reconnectId !== null) {
      this._antlion.cancelScheduled(this._reconnectId);
      this._reconnectId = null;
    }
    if (this._connectTimeoutId !== null) {
      this._antlion.cancelScheduled(this._connectTimeoutId);
      this._connectTimeoutId = null;
    }
    if (this._ws && this._ws.readyState !== 2 /* CLOSING */ && this._ws.readyState !== 3 /* CLOSED */) {
      this._ws.close();
    }
  }

  _attachHandlers(ws) {
    ws.onopen = () => {
      this._clearConnectTimeout();
      ws.send(JSON.stringify({ type: 'hello', ...IdentityStore.load() }));
      this._attempts = 0;
      this._onConnect?.();
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
      // A prior socket's stale close can arrive after connect() has replaced this._ws —
      // ignore it so we don't re-show the overlay or double-schedule reconnects.
      if (ws !== this._ws) {return;}
      this._clearConnectTimeout();
      if (this._isStopped) {return;}
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

  _clearConnectTimeout() {
    if (this._connectTimeoutId !== null) {
      this._antlion.cancelScheduled(this._connectTimeoutId);
      this._connectTimeoutId = null;
    }
  }
}

export default ThousandSocket;
