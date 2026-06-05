// ============================================================
// HistoryPanel — bottom-left collapsible, scrollable, chat-style
// log of game events (feature 012). Renders the server-authoritative
// actionHistory; mirrors ScoreboardPanel (Antlion-wired toggle,
// localStorage persistence with a responsive default, inner scroll
// container kept pinned to the bottom).
// ============================================================

import historyEntryText from './historyEntryText.js';

const STORAGE_KEY = 'thousand_history_open';
const SMALL_SCREEN_PX = 480;

class HistoryPanel {
  constructor(container, antlion) {
    this._container = container;
    this._antlion = antlion;
    this._open = this._loadOpenState();
    antlion.onInput('history-toggle', () => this._toggle());
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
    this._container.classList.add('history-panel');
    this._container.classList.toggle('history-panel--collapsed', !this._open);

    const header = document.createElement('div');
    header.className = 'history-panel__header';

    const title = document.createElement('span');
    title.className = 'history-panel__title';
    title.textContent = 'History';

    this._toggleBtn = document.createElement('button');
    this._toggleBtn.type = 'button';
    this._toggleBtn.className = 'history-panel__toggle';
    this._toggleBtn.textContent = this._open ? '–' : '+';
    this._toggleBtn.setAttribute('aria-expanded', String(this._open));
    this._antlion.bindInput(this._toggleBtn, 'click', 'history-toggle');

    header.append(title, this._toggleBtn);

    this._bodyEl = document.createElement('div');
    this._bodyEl.className = 'history-panel__body';
    this._scrollEl = document.createElement('div');
    this._scrollEl.className = 'history-panel__scroll';
    this._bodyEl.appendChild(this._scrollEl);

    this._container.append(header, this._bodyEl);
  }

  _toggle() {
    this._open = !this._open;
    this._saveOpenState();
    this._container.classList.toggle('history-panel--collapsed', !this._open);
    this._toggleBtn.textContent = this._open ? '–' : '+';
    this._toggleBtn.setAttribute('aria-expanded', String(this._open));
  }

  _emptyRow() {
    const row = document.createElement('div');
    row.className = 'history-panel__empty';
    row.textContent = 'No activity yet';
    return row;
  }

  _entryRow(entry, seats) {
    const row = document.createElement('div');
    row.className = 'history-panel__row';
    row.textContent = historyEntryText(entry, seats);
    return row;
  }

  render(actionHistory, seats) {
    const entries = actionHistory ?? [];
    this._scrollEl.textContent = '';
    if (entries.length === 0) {
      this._scrollEl.appendChild(this._emptyRow());
      return;
    }
    for (const entry of entries) {
      this._scrollEl.appendChild(this._entryRow(entry, seats));
    }
    // Chat-style: keep the newest entry (at the bottom) in view (FR-014).
    this._scrollEl.scrollTop = this._scrollEl.scrollHeight;
  }
}

export default HistoryPanel;
