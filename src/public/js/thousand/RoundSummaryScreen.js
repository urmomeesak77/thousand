class RoundSummaryScreen {
  constructor(el, { antlion, onBackToLobby }) {
    this._el = el;
    this._antlion = antlion;
    this._onBackToLobby = onBackToLobby;
    // Register handler once — button is created later in render()
    antlion.onInput('round-summary-back-click', () => this._onBackToLobby());
  }

  render(summary) {
    this._el.innerHTML = '';

    const { declarerMadeBid, perPlayer } = summary;

    this._renderBidIndicator(declarerMadeBid);
    this._renderTable(perPlayer);
    this._renderBackButton();
  }

  _renderBidIndicator(declarerMadeBid) {
    const indicator = document.createElement('div');
    if (declarerMadeBid) {
      indicator.className = 'round-summary__made-indicator';
      indicator.textContent = 'Made';
    } else {
      indicator.className = 'round-summary__missed-indicator';
      indicator.textContent = 'Missed';
    }
    this._el.appendChild(indicator);
  }

  _renderTable(perPlayer) {
    const table = document.createElement('table');
    table.className = 'round-summary__table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const col of ['Player', 'Tricks', 'Round Total', 'Delta', 'Cumulative']) {
      const th = document.createElement('th');
      th.textContent = col;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const data of Object.values(perPlayer)) {
      const row = this._makePlayerRow(data);
      tbody.appendChild(row);
    }
    table.appendChild(tbody);

    this._el.appendChild(table);
  }

  _makePlayerRow(data) {
    const { nickname, trickPoints, roundTotal, delta, cumulativeAfter } = data;
    const row = document.createElement('tr');
    row.className = 'round-summary__player-row';

    const sign = delta >= 0 ? '+' : '';
    const cells = [nickname, trickPoints, roundTotal, `${sign}${delta}`, cumulativeAfter];
    for (const val of cells) {
      const td = document.createElement('td');
      td.textContent = val;
      row.appendChild(td);
    }

    return row;
  }

  _renderBackButton() {
    const btn = document.createElement('button');
    btn.className = 'round-summary__back-btn';
    btn.textContent = 'Back to Lobby';
    this._antlion.bindInput(btn, 'click', 'round-summary-back-click');
    this._el.appendChild(btn);
  }

  destroy() {}
}

export default RoundSummaryScreen;
