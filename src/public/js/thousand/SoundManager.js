// ============================================================
// SoundManager — preloads one-shot cues and plays them in
// response to engine sound:* events. No-op when muted.
// ============================================================

// Cue → asset path (relative to the document's <base href>, served by StaticServer).
const CUE_FILES = {
  card: 'sound/playing-card2.mp3',
  flip: 'sound/flipcard.mp3',
  turn: 'sound/turn.mp3',
};

class SoundManager {
  constructor(antlion, { store = null, audioFactory = (src) => new Audio(src) } = {}) {
    this._store = store;
    this._audioFactory = audioFactory;
    // In-memory mute is the session source of truth; seed it from the store
    // (default unmuted when no store / absent preference).
    this._muted = store ? store.get() : false;
    // One preloaded base Audio per cue — cloned on each play so overlapping
    // cues (e.g. a staggered deal) don't cut each other off.
    this._bases = {};
    for (const cue of Object.keys(CUE_FILES)) {
      this._bases[cue] = audioFactory(CUE_FILES[cue]);
    }
    antlion.onInput('sound:card', () => this.play('card'));
    antlion.onInput('sound:flip', () => this.play('flip'));
    antlion.onInput('sound:turn', () => this.play('turn'));
  }

  isMuted() {
    return this._muted;
  }

  toggleMute() {
    this._muted = !this._muted;
    if (this._store) {
      this._store.set(this._muted);
    }
    return this._muted;
  }

  play(cue) {
    if (this._muted) {
      return;
    }
    const base = this._bases[cue];
    if (!base) {
      return;
    }
    try {
      const instance = base.cloneNode();
      instance.play();
    } catch {
      // Blocked autoplay or a missing decoder must never break a tick (FR-010).
    }
  }
}

export default SoundManager;
