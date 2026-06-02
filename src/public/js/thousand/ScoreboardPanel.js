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

  // seats.players may be in any order; the scoreboard always renders columns by
  // ascending seat (0,1,2) so the layout is stable across renders and viewers.
  _orderedPlayers(seats) {
    return [...seats.players].sort((a, b) => a.seat - b.seat);
  }

  _formatDelta(value) {
    return value > 0 ? `+${value}` : String(value);
  }

  _valCell(text) {
    const td = document.createElement('td');
    td.className = 'scoreboard__val';
    td.textContent = text;
    return td;
  }

  _labelCell(text, className) {
    const td = document.createElement('td');
    td.className = `scoreboard__label ${className}`;
    td.textContent = text;
    return td;
  }

  render(scoreHistory, cumulativeScores, seats) {
    if (!seats || !seats.players) {
      return;
    }
    const players = this._orderedPlayers(seats);
    this._bodyEl.textContent = '';

    const scroll = document.createElement('div');
    scroll.className = 'scoreboard__scroll';

    const table = document.createElement('table');
    table.className = 'scoreboard__table';

    table.appendChild(this._buildHead(players));
    table.appendChild(this._buildRoundsBody(scoreHistory ?? [], players));
    table.appendChild(this._buildTotalFoot(cumulativeScores ?? {}, players));

    scroll.appendChild(table);
    this._bodyEl.appendChild(scroll);

    // Keep the latest round in view; earlier rounds scroll off the top.
    scroll.scrollTop = scroll.scrollHeight;
  }

  _buildHead(players) {
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    tr.appendChild(document.createElement('th')); // empty corner over the round-label column
    for (const p of players) {
      const th = document.createElement('th');
      th.className = 'scoreboard__col-head';
      th.textContent = p.nickname ?? '';
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    return thead;
  }

  _buildRoundsBody(scoreHistory, players) {
    const tbody = document.createElement('tbody');
    for (const entry of scoreHistory) {
      const rndRow = document.createElement('tr');
      rndRow.className = 'scoreboard__rnd';
      rndRow.appendChild(this._labelCell(`R${entry.roundNumber}`, 'scoreboard__round-num'));
      for (const p of players) {
        rndRow.appendChild(this._valCell(this._formatDelta(entry.perPlayer[p.seat]?.delta ?? 0)));
      }
      tbody.appendChild(rndRow);
    }
    return tbody;
  }

  _buildTotalFoot(cumulativeScores, players) {
    const tfoot = document.createElement('tfoot');
    const tr = document.createElement('tr');
    tr.className = 'scoreboard__total';
    tr.appendChild(this._labelCell('TOTAL', 'scoreboard__total-label'));
    for (const p of players) {
      tr.appendChild(this._valCell(String(cumulativeScores[p.seat] ?? 0)));
    }
    tfoot.appendChild(tr);
    return tfoot;
  }
}

export default ScoreboardPanel;
