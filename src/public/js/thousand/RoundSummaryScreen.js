import { SPECIAL_PENALTY } from './constants.js';

const PENALTY_KEYS = {
  barrel: 'summary.penaltyBarrel',
  'three-zeros': 'summary.penaltyZeros',
};

const AUTO_CONTINUE_SECONDS = 30;

class RoundSummaryScreen {
  constructor(el, { antlion, viewerSeat, onBackToLobby, onContinue, t }) {
    this._el = el;
    this._antlion = antlion;
    this._t = t;
    this._viewerSeat = viewerSeat;
    this._onBackToLobby = onBackToLobby;
    this._onContinue = onContinue;
    // Store continue-pressed seats for the update() method
    this._continuePressedSeats = new Set();
    this._autoContinueIntervalId = null;
    this._autoContinueRemaining = AUTO_CONTINUE_SECONDS;
    // Disposers: constructor-scoped onInput handlers vs per-render button binds.
    // The screen is rebuilt every round and its buttons are re-bound on each
    // render(), so both must be released on destroy() (and the button binds at
    // the top of each render) to avoid leaking handlers into the session-scoped
    // Antlion / firing stale instances on a single live click.
    this._teardowns = [];
    this._buttonTeardowns = [];
    // Register handlers once — buttons are created later in render()
    const backHandler = () => this._onBackToLobby();
    antlion.onInput('round-summary-back-click', backHandler);
    this._teardowns.push(() => antlion.offInput('round-summary-back-click', backHandler));
    if (this._onContinue) {
      const continueHandler = () => this._onContinueClick();
      antlion.onInput('round-summary-continue-click', continueHandler);
      this._teardowns.push(() => antlion.offInput('round-summary-continue-click', continueHandler));
    }
  }

  render(summary) {
    // Release the previous render's button binds before innerHTML drops the
    // nodes, otherwise their listeners + _domListeners entries leak.
    for (const dispose of this._buttonTeardowns) { dispose(); }
    this._buttonTeardowns = [];
    // Cancel any in-flight auto-continue timer before this render decides whether
    // to start a fresh one — prevents stacked intervals across re-renders.
    this._cancelAutoContinue();
    this._continueBtn = null;
    this._el.innerHTML = '';
    this._summary = summary;
    // _continuePressedSeats is owned by _onContinueClick (local) and update()
    // (server broadcast). render() is also called by _onContinueClick to disable
    // the button — clearing the set here would wipe the seat we just added and
    // re-render the button enabled, letting test/users double-fire the action.

    const { declarerMadeBid, perPlayer, victoryReached } = summary;

    // Centered overlay: the round summary is a blocking handoff (continue / back
    // to lobby), so it reads as a modal card over a dimmed table rather than a
    // full-width strip at the bottom of the screen.
    const overlay = document.createElement('div');
    overlay.className = 'round-summary';
    const card = document.createElement('div');
    card.className = 'round-summary__card';
    overlay.appendChild(card);
    this._el.appendChild(overlay);
    this._cardEl = card;

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
      indicator.textContent = this._t('summary.made');
    } else {
      indicator.className = 'round-summary__missed-indicator';
      indicator.textContent = this._t('summary.missed');
    }
    this._cardEl.appendChild(indicator);
  }

  _renderTable(perPlayer) {
    const table = document.createElement('table');
    table.className = 'round-summary__table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const columnKeys = [
      'summary.colPlayer', 'summary.colTricks', 'summary.colTotal',
      'summary.colDelta', 'summary.colCumulative',
    ];
    for (const key of columnKeys) {
      const th = document.createElement('th');
      th.textContent = this._t(key);
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const data of Object.values(perPlayer)) {
      const row = this._makePlayerRow(data);
      tbody.appendChild(row);
      const fourNinesRow = this._makeFourNinesRow(data);
      if (fourNinesRow) { tbody.appendChild(fourNinesRow); }
      for (const penaltyRow of this._makePenaltyRows(data)) {
        tbody.appendChild(penaltyRow);
      }
    }
    table.appendChild(tbody);

    // Wrap in a full-width row so the capped/centered table still claims its own
    // line inside the flex .game-controls panel (instead of sharing a row with
    // the made/missed label and the action button).
    const wrap = document.createElement('div');
    wrap.className = 'round-summary__table-wrap';
    wrap.appendChild(table);

    // update() re-renders just the table; keep it above the action button rather
    // than appending after it.
    this._cardEl.querySelector('.round-summary__table-wrap')?.remove();
    const btn = this._cardEl.querySelector('.round-summary__continue-btn, .round-summary__back-btn');
    this._cardEl.insertBefore(wrap, btn ?? null);
  }

  _makePlayerRow(data) {
    const { nickname, seat, trickPoints, roundTotal, delta, cumulativeAfter } = data;
    const row = document.createElement('tr');
    row.className = 'round-summary__player-row';
    row.setAttribute('data-seat', seat);

    const sign = delta >= 0 ? '+' : '';
    const cells = [nickname, trickPoints, roundTotal, `${sign}${delta}`, cumulativeAfter];
    let nameCell = null;
    for (const val of cells) {
      const td = document.createElement('td');
      td.textContent = val;
      row.appendChild(td);
      nameCell ??= td;
    }

    // Continued check-mark: live inside the name cell (a <div> directly under a
    // <tr> is invalid and gets hoisted out of the table by the browser).
    if (this._continuePressedSeats.has(seat)) {
      const continueIndicator = document.createElement('span');
      continueIndicator.className = 'round-summary__continued-indicator';
      continueIndicator.textContent = '✓';
      nameCell.appendChild(continueIndicator);
    }

    return row;
  }

  // FR-008: a distinct, labelled line item for the four-nines bonus, separate
  // from trick points, marriage bonus, and the made/missed delta.
  _makeFourNinesRow(data) {
    if (!data.fourNinesBonus) { return null; }
    const tr = document.createElement('tr');
    tr.className = 'round-summary__four-nines-row';
    tr.setAttribute('data-seat', data.seat);
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = this._t('summary.fourNines', { amount: data.fourNinesBonus });
    tr.appendChild(td);
    return tr;
  }

  _makePenaltyRows(data) {
    return (data.penalties ?? []).map((token) => {
      const tr = document.createElement('tr');
      tr.className = 'round-summary__penalty-row';
      tr.setAttribute('data-seat', data.seat);
      const td = document.createElement('td');
      td.colSpan = 5;
      td.textContent = PENALTY_KEYS[token]
        ? this._t(PENALTY_KEYS[token], { amount: SPECIAL_PENALTY })
        : token;
      tr.appendChild(td);
      return tr;
    });
  }

  _renderBackButton() {
    const btn = document.createElement('button');
    btn.className = 'round-summary__back-btn';
    btn.textContent = this._t('game.backToLobby');
    this._buttonTeardowns.push(this._antlion.bindInput(btn, 'click', 'round-summary-back-click'));
    this._cardEl.appendChild(btn);
  }

  _renderContinueButton() {
    const btn = document.createElement('button');
    btn.className = 'round-summary__continue-btn';
    // Check if this viewer has already pressed continue
    if (this._continuePressedSeats.has(this._viewerSeat)) {
      btn.disabled = true;
      btn.textContent = this._t('summary.continue');
    } else {
      btn.textContent = this._continueLabelWithCount();
      this._continueBtn = btn;
      this._startAutoContinue();
    }
    this._buttonTeardowns.push(this._antlion.bindInput(btn, 'click', 'round-summary-continue-click'));
    this._cardEl.appendChild(btn);
  }

  // Restart the per-second interval without resetting the remaining count:
  // render() re-fires on every broadcast while the summary is up (e.g. each
  // other-player Continue press), so the countdown must persist across renders
  // and only initialise once, in the constructor.
  _startAutoContinue() {
    this._cancelAutoContinue();
    this._autoContinueIntervalId = this._antlion.scheduleInterval(1000, () => this._autoContinueTick());
  }

  _autoContinueTick() {
    this._autoContinueRemaining -= 1;
    if (this._autoContinueRemaining <= 0) {
      this._cancelAutoContinue();
      this._onContinueClick();
      return;
    }
    if (this._continueBtn) {
      this._continueBtn.textContent = this._continueLabelWithCount();
    }
  }

  _continueLabelWithCount() {
    return this._t('summary.continueCountdown', { seconds: this._autoContinueRemaining });
  }

  _cancelAutoContinue() {
    if (this._autoContinueIntervalId !== null) {
      this._antlion.cancelInterval(this._autoContinueIntervalId);
      this._autoContinueIntervalId = null;
    }
  }

  _onContinueClick() {
    // Must record the press BEFORE re-rendering: render() checks
    // _continuePressedSeats to decide whether to start the auto-continue timer.
    // If this ran after render(), the re-render would start a fresh countdown.
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

  destroy() {
    this._cancelAutoContinue();
    for (const dispose of this._buttonTeardowns) { dispose(); }
    this._buttonTeardowns = [];
    for (const dispose of this._teardowns) { dispose(); }
    this._teardowns = [];
  }
}

export default RoundSummaryScreen;
