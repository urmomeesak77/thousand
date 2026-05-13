// ============================================================
// StatusBar — fixed top bar per FR-025
// ============================================================

import { MIN_BID, MAX_SELL_ATTEMPTS } from './constants.js';

class StatusBar {
  constructor(element) {
    this._el = element;
    this._el.className = 'status-bar';
  }

  // Re-renders the bar from the GameStatus view-model
  render(gameStatus, sellWinner = null) {
    const {
      phase,
      activePlayer,
      viewerIsActive,
      currentHighBid,
      declarer,
      passedPlayers,
      sellAttempt,
      disconnectedPlayers,
    } = gameStatus;

    this._el.textContent = '';

    this._el.appendChild(this._span('status-bar__phase', phase));

    if (activePlayer) {
      const text = viewerIsActive
        ? 'Your turn'
        : `Waiting for ${activePlayer.nickname}…`;
      this._el.appendChild(this._span('status-bar__turn', text));
    }

    if (phase === 'Declarer deciding' && declarer) {
      this._el.appendChild(
        this._span('status-bar__bid-winner', `Bid won: ${declarer.nickname} (${currentHighBid ?? MIN_BID})`)
      );
    } else {
      this._el.appendChild(
        this._span('status-bar__bid', `Bid: ${currentHighBid ?? MIN_BID}`)
      );
      if (declarer) {
        this._el.appendChild(
          this._span('status-bar__declarer', `Declarer: ${declarer.nickname}`)
        );
      }
    }

    if (sellWinner) {
      this._el.appendChild(
        this._span('status-bar__sell-winner', `Sold to: ${sellWinner}`)
      );
    }

    if (sellAttempt != null) {
      this._el.appendChild(
        this._span('status-bar__attempt', `Attempt ${sellAttempt} of ${MAX_SELL_ATTEMPTS}`)
      );
    }

    if (passedPlayers && passedPlayers.length > 0) {
      const row = document.createElement('span');
      row.className = 'status-bar__passed-row';
      row.appendChild(this._span('status-bar__passed-label', 'Passed:'));
      passedPlayers.forEach((nickname) => {
        row.appendChild(this._span('status-bar__passed-chip', nickname));
      });
      this._el.appendChild(row);
    }

    if (disconnectedPlayers && disconnectedPlayers.length > 0) {
      disconnectedPlayers.forEach((nickname) => {
        this._el.appendChild(
          this._span('status-bar__disconnected', `${nickname}: Connection lost…`)
        );
      });
    }
  }

  _span(className, text) {
    const el = document.createElement('span');
    el.className = className;
    el.textContent = text;
    return el;
  }
}

export default StatusBar;
