// ============================================================
// MuteButton — binds every .mute-btn to the sound toggle and
// reflects the current mute state (icon + aria-pressed + title).
// Bound once at app startup, exactly like RulesModal.
// ============================================================

// Feather-style glyphs (stroke: currentColor), matching the .rules-btn icon.
const SPEAKER_ON = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>'
  + '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'
  + '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
const SPEAKER_OFF = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>'
  + '<line x1="23" y1="9" x2="17" y2="15"/>'
  + '<line x1="17" y1="9" x2="23" y2="15"/>';

class MuteButton {
  constructor(antlion, soundManager, t) {
    this._antlion = antlion;
    this._sound = soundManager;
    this._t = t;
  }

  bind() {
    document.querySelectorAll('.mute-btn').forEach((el) => {
      this._antlion.bindInput(el, 'click', 'sound-toggle-mute');
    });
    this._antlion.onInput('sound-toggle-mute', () => {
      this._sound.toggleMute();
      this._render();
    });
    // Refresh the Mute/Unmute tooltip when the language switches live.
    this._antlion.onInput('language:changed', () => this._render());
    this._render();
  }

  _render() {
    const muted = this._sound.isMuted();
    const title = muted ? this._t('controls.unmute') : this._t('controls.mute');
    document.querySelectorAll('.mute-btn').forEach((el) => {
      el.setAttribute('aria-pressed', String(muted));
      el.setAttribute('aria-label', title);
      el.title = title;
      el.innerHTML = this._icon(muted);
    });
  }

  _icon(muted) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" '
      + 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + (muted ? SPEAKER_OFF : SPEAKER_ON) + '</svg>';
  }
}

export default MuteButton;
