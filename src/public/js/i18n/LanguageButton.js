// ============================================================
// LanguageButton — binds every .lang-btn to the language toggle
// and shows the TARGET language (the one a click switches to):
// flag icon (gfx/<id>.gif) on the face, full self-name in
// title/aria-label. Bound once at app startup, exactly like MuteButton.
// ============================================================

class LanguageButton {
  constructor(antlion, i18n) {
    this._antlion = antlion;
    this._i18n = i18n;
  }

  bind() {
    document.querySelectorAll('.lang-btn').forEach((el) => {
      this._antlion.bindInput(el, 'click', 'language-toggle');
    });
    this._antlion.onInput('language-toggle', () => {
      this._i18n.setLanguage(this._target().id);
    });
    this._antlion.onInput('language:changed', () => this._render());
    this._render();
  }

  // The language a click would switch to (the other one of the two).
  _target() {
    const languages = this._i18n.constructor.SUPPORTED_LANGUAGES;
    return languages.find((l) => l.id !== this._i18n.language);
  }

  _render() {
    const target = this._target();
    const title = this._i18n.t('lang.toggleTitle', { name: target.selfName });
    const ariaLabel = this._i18n.t('lang.toggleAriaLabel', { name: target.selfName });
    document.querySelectorAll('.lang-btn').forEach((el) => {
      el.innerHTML = '<img src="gfx/' + target.id + '.gif" alt="" aria-hidden="true">';
      el.title = title;
      el.setAttribute('aria-label', ariaLabel);
    });
  }
}

export default LanguageButton;
