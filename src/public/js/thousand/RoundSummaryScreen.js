import { SPECIAL_PENALTY } from './constants.js';

const PENALTY_LABELS = {
  barrel: `Barrel penalty: −${SPECIAL_PENALTY}`,
  'three-zeros': `Zero-round penalty: −${SPECIAL_PENALTY}`,
};

class RoundSummaryScreen {
  constructor(el, { antlion, viewerSeat, onBackToLobby, onContinue }) {
    this._el = el;
    this._antlion = antlion;
    this._viewerSeat = viewerSeat;
    this._onBackToLobby = onBackToLobby;
    this._onContinue = onContinue;
    // Store continue-pressed seats for the update() method
    this._continuePressedSeats = new Set();
    // Register handlers once — buttons are created later in render()
    antlion.onInput('round-summary-back-click', () => this._onBackToLobby());
    if (this._onContinue) {
      antlion.onInput('round-summary-continue-click', () => this._onContinueClick());
    }
  }

  render(summary) {
    this._el.innerHTML = '';
    this._summary = summary;
    this._continuePressedSeats.clear();

    const { declarerMadeBid, perPlayer, victoryReached } = summary;

    this._renderBidIndicator(declarerMadeBid);
    this._renderTable(perPlayer);

    // FR-015 / FR-016: Continue to Next Round when victoryReached === false AND onContinue is provided (US3),
    // else Back to Lobby (US1 or when victory reached)
    if (victoryReached === false && this._onContinue) {
      this._renderContinueButton();
    } else {
      this._renderBackButton();
    }
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
      for (const penaltyRow of this._makePenaltyRows(data)) {
        tbody.appendChild(penaltyRow);
      }
    }
    table.appendChild(tbody);

    this._el.querySelector('.round-summary__table')?.remove();
    this._el.appendChild(table);
  }

  _makePlayerRow(data) {
    const { nickname, seat, trickPoints, roundTotal, delta, cumulativeAfter } = data;
    const row = document.createElement('tr');
    row.className = 'round-summary__player-row';
    row.setAttribute('data-seat', seat);

    const sign = delta >= 0 ? '+' : '';
    const cells = [nickname, trickPoints, roundTotal, `${sign}${delta}`, cumulativeAfter];
    for (const val of cells) {
      const td = document.createElement('td');
      td.textContent = val;
      row.appendChild(td);
    }

    // Add continued indicator if this seat has pressed continue
    if (this._continuePressedSeats.has(seat)) {
      const continueIndicator = document.createElement('div');
      continueIndicator.className = 'round-summary__continued-indicator';
      continueIndicator.textContent = 'Continued ✓';
      row.appendChild(continueIndicator);
    }

    return row;
  }

  _makePenaltyRows(data) {
    return (data.penalties ?? []).map((token) => {
      const tr = document.createElement('tr');
      tr.className = 'round-summary__penalty-row';
      tr.setAttribute('data-seat', data.seat);
      const td = document.createElement('td');
      td.colSpan = 5;
      td.textContent = PENALTY_LABELS[token] ?? token;
      tr.appendChild(td);
      return tr;
    });
  }

  _renderBackButton() {
    const btn = document.createElement('button');
    btn.className = 'round-summary__back-btn';
    btn.textContent = 'Back to Lobby';
    this._antlion.bindInput(btn, 'click', 'round-summary-back-click');
    this._el.appendChild(btn);
  }

  _renderContinueButton() {
    const btn = document.createElement('button');
    btn.className = 'round-summary__continue-btn';
    btn.textContent = 'Continue to Next Round';
    // Check if this viewer has already pressed continue
    if (this._continuePressedSeats.has(this._viewerSeat)) {
      btn.disabled = true;
    }
    this._antlion.bindInput(btn, 'click', 'round-summary-continue-click');
    this._el.appendChild(btn);
  }

  _onContinueClick() {
    // Mark this viewer's seat as having pressed continue
    this._continuePressedSeats.add(this._viewerSeat);
    // Re-render to disable the button and show the indicator
    if (this._summary) {
      this.render(this._summary);
    }
    this._onContinue();
  }

  // FR-016: update(continuePressedSeats) called when continue_press_recorded arrives
  update(continuePressedSeats) {
    if (!continuePressedSeats) { return; }
    this._continuePressedSeats = new Set(continuePressedSeats);
    // Re-render to show the continued indicators without replacing the whole screen
    if (this._summary) {
      this._renderTable(this._summary.perPlayer);
    }
  }

  destroy() {}
}

export default RoundSummaryScreen;
