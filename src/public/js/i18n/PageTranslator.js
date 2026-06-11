// ============================================================
// PageTranslator — applies the active catalog to the static HTML
// annotated with data-i18n / data-i18n-attr (contracts/i18n-api.md).
// Walked once at boot (before first paint) and re-walked on every
// language:changed, so static regions switch with one event.
// ============================================================

class PageTranslator {
  constructor(antlion, i18n) {
    this._antlion = antlion;
    this._i18n = i18n;
  }

  bind() {
    this._antlion.onInput('language:changed', () => this.apply());
    this.apply();
  }

  apply() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = this._i18n.t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      for (const pair of el.getAttribute('data-i18n-attr').split(',')) {
        const [attr, key] = pair.split(':').map((s) => s.trim());
        if (attr && key) {
          el.setAttribute(attr, this._i18n.t(key));
        }
      }
    });
  }
}

export default PageTranslator;
