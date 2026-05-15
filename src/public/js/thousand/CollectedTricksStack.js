// ============================================================
// CollectedTricksStack — per-player collected trick count display
// ============================================================

class CollectedTricksStack {
  constructor(el, seats) {
    this._el = el;
    this._seats = seats; // array of { seat, nickname }
  }

  render(collectedTrickCounts) {
    this._el.innerHTML = '';

    for (const { seat, nickname } of this._seats) {
      const item = document.createElement('div');
      item.className = 'collected-stack__item';
      item.dataset.seat = seat;

      const label = document.createElement('span');
      label.className = 'collected-stack__nickname';
      label.textContent = nickname;

      const badge = document.createElement('span');
      badge.className = 'collected-stack__badge';
      badge.textContent = `× ${collectedTrickCounts[seat] ?? 0}`;

      item.appendChild(label);
      item.appendChild(badge);
      this._el.appendChild(item);
    }
  }

  destroy() {}
}

export default CollectedTricksStack;
