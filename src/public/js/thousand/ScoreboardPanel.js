// ============================================================
// ScoreboardPanel — fixed top-right per-round scoreboard
// ============================================================

const STORAGE_KEY = 'thousand_scoreboard_open';
const SMALL_SCREEN_PX = 480;

class ScoreboardPanel {
  constructor(container, antlion) {
    this._container = container;
    this._antlion = antlion;
    this._open = this._loadOpenState();
    antlion.onInput('scoreboard-toggle', () => this._toggle());
    this._buildChrome();
  }

  _loadOpenState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') { return true; }
      if (stored === 'false') { return false; }
    } catch {
      // Storage disabled (private mode) — fall through to the screen-size default.
    }
    return window.innerWidth > SMALL_SCREEN_PX;
  }

  _saveOpenState() {
    try {
      localStorage.setItem(STORAGE_KEY, String(this._open));
    } catch {
      // Best-effort: a lost preference is better than a thrown handler.
    }
  }

  _buildChrome() {
    this._container.classList.add('scoreboard');
    this._container.classList.toggle('scoreboard--collapsed', !this._open);

    const header = document.createElement('div');
    header.className = 'scoreboard__header';

    const title = document.createElement('span');
    title.className = 'scoreboard__title';
    title.textContent = 'Scoreboard';

    this._toggleBtn = document.createElement('button');
    this._toggleBtn.type = 'button';
    this._toggleBtn.className = 'scoreboard__toggle';
    this._toggleBtn.textContent = this._open ? '–' : '+';
    this._toggleBtn.setAttribute('aria-expanded', String(this._open));
    this._antlion.bindInput(this._toggleBtn, 'click', 'scoreboard-toggle');

    header.append(title, this._toggleBtn);

    this._bodyEl = document.createElement('div');
    this._bodyEl.className = 'scoreboard__body';

    this._container.append(header, this._bodyEl);
  }

  _toggle() {
    this._open = !this._open;
    this._saveOpenState();
    this._container.classList.toggle('scoreboard--collapsed', !this._open);
    this._toggleBtn.textContent = this._open ? '–' : '+';
    this._toggleBtn.setAttribute('aria-expanded', String(this._open));
  }
}

export default ScoreboardPanel;
