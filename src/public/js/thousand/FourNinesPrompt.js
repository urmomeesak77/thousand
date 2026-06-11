// ============================================================
// FourNinesPrompt — blocking modal announcing the four-nines bonus (FR-003)
// ============================================================

// Mirrors the MarriageDeclarationPrompt pattern: a single named Antlion input,
// stored so destroy() can offInput it (no handler leak across rounds).
class FourNinesPrompt {
  constructor(el, { antlion, dispatcher, t }) {
    this._el = el;
    this._antlion = antlion;
    this._dispatcher = dispatcher;
    this._t = t;
    this._acknowledged = false;
    this._progressEl = null;
    this._ackBtn = null;
    this._countdownId = null;
    this._secondsLeft = 0;

    this._clickHandler = (e) => {
      if (e.target.dataset.action !== 'acknowledge') { return; }
      this._acknowledge();
    };
    antlion.bindInput(el, 'click', 'four-nines-prompt-click');
    antlion.onInput('four-nines-prompt-click', this._clickHandler);
  }

  destroy() {
    this._cancelCountdown();
    this._antlion.offInput('four-nines-prompt-click', this._clickHandler);
  }

  show(nickname, amount) {
    this._acknowledged = false;
    this._el.className = 'modal-overlay four-nines-modal';
    this._el.replaceChildren();
    this._el.style.display = 'flex';

    const card = document.createElement('div');
    card.className = 'modal-card four-nines-modal__card';

    const heading = document.createElement('h2');
    heading.textContent = this._t('game.fourNinesTitle');
    card.appendChild(heading);

    const info = document.createElement('div');
    info.className = 'four-nines-modal__text';
    info.textContent = this._t('game.fourNinesText', { name: nickname, amount });
    card.appendChild(info);

    this._progressEl = document.createElement('div');
    this._progressEl.className = 'four-nines-modal__progress';
    card.appendChild(this._progressEl);

    this._ackBtn = document.createElement('button');
    this._ackBtn.className = 'btn';
    this._ackBtn.dataset.action = 'acknowledge';
    card.appendChild(this._ackBtn);

    this._el.appendChild(card);

    // Auto-acknowledge after a 5-second countdown so a distracted player can't
    // stall the round; the button label doubles as the visible timer.
    this._startCountdown(5);
  }

  _startCountdown(seconds) {
    this._cancelCountdown();
    this._secondsLeft = seconds;
    this._updateCountdownLabel();
    this._countdownId = this._antlion.scheduleInterval(1000, () => {
      this._secondsLeft -= 1;
      if (this._secondsLeft <= 0) {
        this._acknowledge();
        return;
      }
      this._updateCountdownLabel();
    });
  }

  _updateCountdownLabel() {
    if (this._ackBtn && !this._acknowledged) {
      this._ackBtn.textContent = this._t('controls.acknowledgeCountdown', {
        seconds: this._secondsLeft,
      });
    }
  }

  _cancelCountdown() {
    if (this._countdownId !== null) {
      this._antlion.cancelInterval(this._countdownId);
      this._countdownId = null;
    }
  }

  _acknowledge() {
    if (this._acknowledged) { return; } // sticky local press — dispatch once
    this._acknowledged = true;
    this._cancelCountdown();
    this._dispatcher.sendAcknowledgeFourNines();
    this._enterWaitingState();
  }

  // four_nines_ack_progress: surface how many of the three have acknowledged.
  setProgress(acknowledgedCount, total = 3) {
    if (!this._progressEl) { return; }
    this._progressEl.textContent = this._t('game.ackProgress', {
      count: acknowledgedCount, total,
    });
  }

  // FR-010: restore the sticky waiting-state for a reconnecting player whose ack
  // was already recorded server-side.
  markAcknowledged() {
    this._acknowledged = true;
    this._cancelCountdown();
    this._enterWaitingState();
  }

  _enterWaitingState() {
    if (this._ackBtn) {
      this._ackBtn.disabled = true;
      this._ackBtn.textContent = this._t('game.waitingOthers');
    }
  }

  hide() {
    this._cancelCountdown();
    this._el.replaceChildren();
    this._el.style.display = 'none';
    this._progressEl = null;
    this._ackBtn = null;
  }
}

export default FourNinesPrompt;
