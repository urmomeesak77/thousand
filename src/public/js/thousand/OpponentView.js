// ============================================================
// OpponentView — one opponent's face-down hand
// ============================================================

import { formatRoundStats } from './roundStatsText.js';

class OpponentView {
  constructor(container, t) {
    this._container = container;
    this._t = t;
    this._container.className = 'opponent-view';
    this._nickname = '';
    this._isBot = false;
    this._cardCount = 0;
    this._isDisconnected = false;
    this._lastAction = '';
    this._roundTricks = null;
    this._roundPoints = null;
    this._render();
  }

  setNickname(nickname) {
    this._nickname = nickname;
    this._render();
  }

  // FR-012: a computer opponent is badged in-game so it is never mistaken for a human.
  setIsBot(isBot) {
    this._isBot = Boolean(isBot);
    this._render();
  }

  setCardCount(count) {
    this._cardCount = count;
    this._render();
  }

  setDisconnected(isDisconnected) {
    this._isDisconnected = isDisconnected;
    this._render();
  }

  setLastAction(text) {
    this._lastAction = text;
    this._render();
  }

  setRoundStats(tricks, points) {
    this._roundTricks = tricks;
    this._roundPoints = points;
    this._render();
  }

  _render() {
    this._container.textContent = '';

    const nick = document.createElement('div');
    nick.className = 'opponent-view__nickname';
    nick.textContent = this._nickname;
    if (this._isBot) {
      const badge = document.createElement('span');
      badge.className = 'bot-badge';
      badge.textContent = this._t('game.botBadge');
      nick.appendChild(badge);
    }
    this._container.appendChild(nick);

    this._container.appendChild(this._buildCardStack());

    // points presence is the authoritative signal that round stats exist (server
    // sends roundPoints only during trick-play/round-summary); tricks tag along.
    if (this._roundPoints != null) {
      const stats = document.createElement('div');
      stats.className = 'opponent-view__round-stats';
      stats.textContent = formatRoundStats(this._t, {
        tricks: this._roundTricks, points: this._roundPoints,
      });
      this._container.appendChild(stats);
    }

    if (this._lastAction) {
      const actionEl = document.createElement('div');
      actionEl.className = 'opponent-view__last-action';
      actionEl.textContent = this._lastAction;
      this._container.appendChild(actionEl);
    }

    if (this._isDisconnected) {
      const lost = document.createElement('div');
      lost.className = 'opponent-view__disconnected';
      lost.textContent = this._t('game.connectionLost');
      this._container.appendChild(lost);
    }
  }

  _buildCardStack() {
    const stackEl = document.createElement('div');
    stackEl.className = 'opponent-view__stack';
    const OFFSET = 14;
    const count = this._cardCount;
    stackEl.style.width = count > 0
      ? `calc(var(--card-width) + ${(count - 1) * OFFSET}px)`
      : `var(--card-width)`;
    for (let i = 0; i < count; i++) {
      const card = document.createElement('div');
      card.className = 'opponent-view__stack-card';
      card.style.left = `${i * OFFSET}px`;
      card.style.zIndex = i + 1;
      if (i === count - 1) {
        const badge = document.createElement('span');
        badge.className = 'opponent-view__count';
        badge.textContent = String(count);
        card.appendChild(badge);
      }
      stackEl.appendChild(card);
    }
    return stackEl;
  }
}

export default OpponentView;
