// ============================================================
// TabSync — converges same-browser tabs on ONE identity
// ============================================================
//
// Same-browser tabs share one localStorage identity, but two tabs opened before
// either has saved an identity would each create a distinct server-side player
// (→ two games). TabSync runs a short BroadcastChannel election so the fresh
// tabs agree on a single identity before connecting: the first tab to obtain an
// identity broadcasts it, and the lowest-nonce fresh tab creates while the
// others adopt. After resolution it keeps answering late siblings.

import { IdentityStore } from './IdentityStore.js';

const CHANNEL_NAME = 'thousand_tabs';
const ELECTION_WINDOW_MS = 200;
// How long a non-creator fresh tab waits for the elected creator to broadcast
// its server-issued identity before giving up and creating its own. Generous
// on purpose: it must cover a real WS connect + hello round-trip, and the only
// cost of over-waiting is a slightly delayed first connect in the rare case of
// two genuinely-simultaneous fresh tabs.
const ADOPT_TIMEOUT_MS = 3000;

export class TabSync {
  constructor({ channelFactory, identityStore, electionWindowMs, adoptTimeoutMs, nonce } = {}) {
    this._identityStore = identityStore ?? IdentityStore;
    this._electionWindowMs = electionWindowMs ?? ELECTION_WINDOW_MS;
    this._adoptTimeoutMs = adoptTimeoutMs ?? ADOPT_TIMEOUT_MS;
    this._nonce = typeof nonce === 'number' ? nonce : Math.random();
    this._identity = null;        // identity this tab currently holds/knows
    this._peerNonces = [];        // nonces announced by sibling fresh tabs
    this._onIdentity = null;      // set during an active election
    this._resolvePromise = null;  // memoized result of resolveIdentity()

    const factory = channelFactory ?? (
      typeof BroadcastChannel !== 'undefined'
        ? () => new BroadcastChannel(CHANNEL_NAME)
        : null
    );
    this._channel = factory ? factory() : null;
    if (this._channel) {
      this._channel.onmessage = (e) => this._onMessage(e.data);
    }
  }

  // Resolve the identity to connect with. Memoized: reconnects reuse the result
  // (by then the identity is also in IdentityStore, so this returns it directly).
  resolveIdentity() {
    if (!this._resolvePromise) {
      this._resolvePromise = this._resolve();
    }
    return this._resolvePromise;
  }

  _resolve() {
    // Return the store's own identity object rather than re-wrapping it in a new
    // literal, so the identity's shape has a single source of truth.
    const stored = this._identityStore.load();
    if (stored.playerId && stored.sessionToken) {
      this._identity = stored;
      this._broadcast({ kind: 'identity', playerId: stored.playerId, sessionToken: stored.sessionToken });
      return Promise.resolve(this._identity);
    }
    if (!this._channel) {
      // No siblings to coordinate with: resolve with whatever the store holds
      // (empty for a fresh tab → the server will issue a new identity).
      return Promise.resolve(this._identityStore.load());
    }
    return this._runElection();
  }

  _runElection() {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (val) => {
        if (settled) {return;}
        settled = true;
        this._onIdentity = null;
        resolve(val);
      };

      // Adopt the first identity a sibling reports during the election.
      this._onIdentity = (playerId, sessionToken) => {
        this._identityStore.save(playerId, sessionToken);
        // Read the saved identity back so the resolved value comes from the store,
        // keeping a single source of truth for its shape.
        this._identity = this._identityStore.load();
        finish(this._identity);
      };

      this._broadcast({ kind: 'hello', nonce: this._nonce });

      setTimeout(() => {
        if (settled) {return;}
        const isLowest = this._peerNonces.every((n) => this._nonce < n);
        if (isLowest) {
          // We create the identity; publishIdentity() broadcasts it once the
          // server issues it, so waiting siblings can adopt.
          finish(this._identityStore.load());
        } else {
          // A lower-nonce sibling will create. Wait (generously — see
          // ADOPT_TIMEOUT_MS) for it to broadcast its server-issued identity,
          // then fall back to creating our own if it never arrives.
          setTimeout(() => finish(this._identityStore.load()), this._adoptTimeoutMs);
        }
      }, this._electionWindowMs);
    });
  }

  _onMessage(data) {
    if (!data || typeof data !== 'object') {return;}
    if (data.kind === 'hello') {
      this._peerNonces.push(data.nonce);
      // Already hold an identity → answer the newcomer so it adopts ours.
      if (this._identity) {
        this._broadcast({ kind: 'identity', playerId: this._identity.playerId, sessionToken: this._identity.sessionToken });
      }
      return;
    }
    if (data.kind === 'identity' && typeof data.playerId === 'string'
        && typeof data.sessionToken === 'string') {
      if (this._onIdentity) {
        this._onIdentity(data.playerId, data.sessionToken);
      } else if (!this._identity) {
        this._identity = { playerId: data.playerId, sessionToken: data.sessionToken };
      }
    }
  }

  // Called once this tab's identity is confirmed (on the `connected` message),
  // so sibling tabs still electing can converge on it.
  publishIdentity(playerId, sessionToken) {
    this._identityStore.save(playerId, sessionToken);
    this._identity = { playerId, sessionToken };
    this._broadcast({ kind: 'identity', playerId, sessionToken });
  }

  _broadcast(msg) {
    if (this._channel) {this._channel.postMessage(msg);}
  }

  dispose() {
    if (this._channel) {this._channel.close();}
  }
}
