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
    this._el.textContent = '';
    this._el.appendChild(this._span('status-bar__phase', gameStatus.phase));
    this._renderTurn(gameStatus);
    this._renderBidAndDeclarer(gameStatus);
    if (sellWinner) {
      this._el.appendChild(this._span('status-bar__sell-winner', `Sold to: ${sellWinner}`));
    }
    if (gameStatus.sellAttempt != null) {
      this._el.appendChild(
        this._span('status-bar__attempt', `Attempt ${gameStatus.sellAttempt} of ${MAX_SELL_ATTEMPTS}`),
      );
    }
    this._renderPassedPlayers(gameStatus.passedPlayers);
    this._renderDisconnected(gameStatus.disconnectedPlayers);
  }

  _renderTurn({ activePlayer, viewerIsActive }) {
    if (!activePlayer) {
      return;
    }
    const text = viewerIsActive ? 'Your turn' : `Waiting for ${activePlayer.nickname}…`;
    this._el.appendChild(this._span('status-bar__turn', text));
  }

  _renderBidAndDeclarer({ phase, declarer, currentHighBid }) {
    const bid = currentHighBid ?? MIN_BID;
    if (phase === 'Declarer deciding' && declarer) {
      this._el.appendChild(
        this._span('status-bar__bid-winner', `Bid won: ${declarer.nickname} (${bid})`),
      );
      return;
    }
    this._el.appendChild(this._span('status-bar__bid', `Bid: ${bid}`));
    if (declarer) {
      this._el.appendChild(this._span('status-bar__declarer', `Declarer: ${declarer.nickname}`));
    }
  }

  _renderPassedPlayers(passedPlayers) {
    if (!passedPlayers || passedPlayers.length === 0) {
      return;
    }
    const row = document.createElement('span');
    row.className = 'status-bar__passed-row';
    row.appendChild(this._span('status-bar__passed-label', 'Passed:'));
    for (const nickname of passedPlayers) {
      row.appendChild(this._span('status-bar__passed-chip', nickname));
    }
    this._el.appendChild(row);
  }

  _renderDisconnected(disconnectedPlayers) {
    if (!disconnectedPlayers || disconnectedPlayers.length === 0) {
      return;
    }
    for (const nickname of disconnectedPlayers) {
      this._el.appendChild(
        this._span('status-bar__disconnected', `${nickname}: Connection lost…`),
      );
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
