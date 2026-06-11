class FinalResultsScreen {
  constructor(container, { viewerSeat, onBackToLobby, antlion, t }) {
    this._container = container;
    this._viewerSeat = viewerSeat;
    this._onBackToLobby = onBackToLobby;
    this._antlion = antlion;
    this._t = t;
    // Register handler once — button is created later in mount()
    antlion.onInput('final-results-back-click', () => this._onBackToLobby());
  }

  mount(finalResults) {
    this._container.innerHTML = '';

    const { finalRanking, history } = finalResults;

    this._renderRanking(finalRanking);
    this._renderHistory(history);
    this._renderBackButton();
  }

  _renderRanking(finalRanking) {
    const section = document.createElement('div');
    section.className = 'final-results__ranking';

    for (const entry of finalRanking) {
      const row = document.createElement('div');
      row.className = 'final-results__ranking-row';
      if (entry.isWinner) {
        row.classList.add('final-results__ranking-row--winner');
      }

      const nameEl = document.createElement('span');
      nameEl.className = 'final-results__ranking-nickname';
      nameEl.textContent = entry.nickname;

      const scoreEl = document.createElement('span');
      scoreEl.className = 'final-results__ranking-score';
      scoreEl.textContent = entry.cumulativeScore;

      row.appendChild(nameEl);
      row.appendChild(scoreEl);
      section.appendChild(row);
    }

    this._container.appendChild(section);
  }

  _renderHistory(history) {
    const table = document.createElement('table');
    table.className = 'final-results__history-table';

    const header = this._renderHistoryHeader(history);
    if (header) {
      table.appendChild(header);
    }

    const tbody = document.createElement('tbody');
    for (const round of history) {
      tbody.appendChild(this._renderHistoryRow(round));
      // FR-009: a distinct annotation row attributing the +100 to the awarded player.
      const awardSeat = round.fourNinesAward?.seat;
      if (awardSeat != null) {
        tbody.appendChild(this._fourNinesAnnotationRow(round, awardSeat));
      }
    }

    table.appendChild(tbody);
    this._container.appendChild(table);
  }

  _renderHistoryHeader(history) {
    const firstRound = history[0];
    if (!firstRound) {
      return null;
    }

    const thead = document.createElement('thead');
    const players = Object.values(firstRound.perPlayer);

    // Top row: fixed-column labels + each player's name above their two columns.
    const labelRow = document.createElement('tr');
    labelRow.className = 'final-results__history-head-row';
    labelRow.appendChild(this._headerCell('#', 'final-results__history-round'));
    labelRow.appendChild(this._headerCell(this._t('results.colDeclarer'), 'final-results__history-declarer'));
    labelRow.appendChild(this._headerCell(this._t('results.colBid'), 'final-results__history-bid'));
    for (const playerData of players) {
      labelRow.appendChild(this._headerCell(playerData.nickname, 'final-results__history-player'));
    }

    // Sub row: clarifies the two columns under each player name.
    const subRow = document.createElement('tr');
    subRow.className = 'final-results__history-head-row final-results__history-head-row--sub';
    subRow.appendChild(this._headerCell('', 'final-results__history-round'));
    subRow.appendChild(this._headerCell('', 'final-results__history-declarer'));
    subRow.appendChild(this._headerCell('', 'final-results__history-bid'));
    for (let i = 0; i < players.length; i += 1) {
      subRow.appendChild(this._headerCell(this._t('results.colRound'), 'final-results__history-delta'));
      subRow.appendChild(this._headerCell(this._t('results.colTotal'), 'final-results__history-cumulative'));
    }

    thead.appendChild(labelRow);
    thead.appendChild(subRow);
    return thead;
  }

  _headerCell(text, className) {
    const th = document.createElement('th');
    th.className = className;
    th.textContent = text;
    return th;
  }

  _renderHistoryRow(round) {
    const row = document.createElement('tr');
    row.className = 'final-results__history-row';

    const roundNumTd = document.createElement('td');
    roundNumTd.className = 'final-results__history-round';
    roundNumTd.textContent = round.roundNumber;

    const declarerTd = document.createElement('td');
    declarerTd.className = 'final-results__history-declarer';
    declarerTd.textContent = round.declarerNickname;

    const bidTd = document.createElement('td');
    bidTd.className = 'final-results__history-bid';
    bidTd.textContent = round.bid;

    row.appendChild(roundNumTd);
    row.appendChild(declarerTd);
    row.appendChild(bidTd);

    const awardSeat = round.fourNinesAward?.seat;
    for (const [seatKey, playerData] of Object.entries(round.perPlayer)) {
      const deltaTd = document.createElement('td');
      deltaTd.className = 'final-results__history-delta';
      deltaTd.textContent = playerData.delta;

      const cumTd = document.createElement('td');
      cumTd.className = 'final-results__history-cumulative';
      cumTd.textContent = playerData.cumulativeAfter;
      // FR-009: mark the running cumulative that includes the four-nines bonus.
      if (awardSeat != null && Number(seatKey) === awardSeat) {
        cumTd.classList.add('final-results__history-cumulative--four-nines');
        cumTd.title = this._t('results.fourNinesTitle', { amount: round.fourNinesAward.amount });
      }

      row.appendChild(deltaTd);
      row.appendChild(cumTd);
    }
    return row;
  }

  _fourNinesAnnotationRow(round, awardSeat) {
    const tr = document.createElement('tr');
    tr.className = 'final-results__history-row--four-nines';
    tr.setAttribute('data-seat', awardSeat);
    const td = document.createElement('td');
    // History table = 3 fixed columns (round#, declarer, bid) + 2 per player (delta + cumulative).
    const playerCount = Object.keys(round.perPlayer).length;
    td.colSpan = 3 + 2 * playerCount;
    const nickname = round.perPlayer[awardSeat]?.nickname ?? this._t('game.aPlayer');
    td.textContent = this._t('results.fourNinesRow', {
      amount: round.fourNinesAward.amount, name: nickname,
    });
    tr.appendChild(td);
    return tr;
  }

  _renderBackButton() {
    const btn = document.createElement('button');
    btn.className = 'final-results__back-btn';
    btn.textContent = this._t('game.backToLobby');
    this._antlion.bindInput(btn, 'click', 'final-results-back-click');
    this._container.appendChild(btn);
  }

  unmount() {
    this._container.innerHTML = '';
  }
}

export default FinalResultsScreen;
