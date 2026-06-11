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
  constructor(container, antlion, t) {
    this._container = container;
    this._antlion = antlion;
    this._t = t;
    this._open = this._loadOpenState();
    // Retained so a language switch re-renders the same entries in the new
    // language from structured facts, with no new server round-trip (FR-011).
    this._lastEntries = [];
    this._lastSeats = null;
    antlion.onInput('history-toggle', () => this._toggle());
    antlion.onInput('language:changed', () => this.render(this._lastEntries, this._lastSeats));
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
    title.title = this._t('history.title');
    // List/log glyph (feather "list") + label; the label collapses away on
    // small screens so the handle shrinks to just the icon (see game.css).
    title.innerHTML = '<svg class="history-panel__icon" xmlns="http://www.w3.org/2000/svg" '
      + 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>'
      + '<line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>'
      + '<line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>'
      + `<span class="history-panel__title-text">${this._t('history.title')}</span>`;

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
    row.textContent = this._t('history.empty');
    return row;
  }

  _entryRow(entry, seats) {
    const row = document.createElement('div');
    row.className = 'history-panel__row';
    row.textContent = historyEntryText(this._t, entry, seats);
    return row;
  }

  render(actionHistory, seats) {
    const entries = actionHistory ?? [];
    this._lastEntries = entries;
    this._lastSeats = seats;
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
