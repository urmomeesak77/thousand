// ============================================================
// OpponentView — one opponent's face-down hand
// ============================================================

class OpponentView {
  constructor(container) {
    this._container = container;
    this._container.className = 'opponent-view';
    this._nickname = '';
    this._cardCount = 0;
    this._disconnected = false;
    this._render();
  }

  setNickname(nickname) {
    this._nickname = nickname;
    this._render();
  }

  setCardCount(count) {
    this._cardCount = count;
    this._render();
  }

  setDisconnected(disconnected) {
    this._disconnected = disconnected;
    this._render();
  }

  _render() {
    this._container.textContent = '';

    const nick = document.createElement('div');
    nick.className = 'opponent-view__nickname';
    nick.textContent = this._nickname;
    this._container.appendChild(nick);

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
    this._container.appendChild(stackEl);

    if (this._disconnected) {
      const lost = document.createElement('div');
      lost.className = 'opponent-view__disconnected';
      lost.textContent = 'Connection lost…';
      this._container.appendChild(lost);
    }
  }
}

export default OpponentView;
