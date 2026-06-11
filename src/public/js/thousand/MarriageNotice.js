// ============================================================
// MarriageNotice — non-blocking popup telling opponents that a
// marriage was declared. Auto-closes after a short countdown; an
// OK button (labelled with the remaining seconds) dismisses early.
// ============================================================

// Mirrors the FourNinesPrompt pattern: a single named Antlion input stored so
// destroy() can offInput it (no handler leak across rounds). Unlike the four-
// nines modal this one needs no server ack — it is purely informational.
class MarriageNotice {
  constructor(el, { antlion, t }) {
    this._el = el;
    this._antlion = antlion;
    this._t = t;
    this._intervalId = null;
    this._remaining = 0;
    this._okBtn = null;

    this._clickHandler = (e) => {
      if (e.target.dataset.action !== 'dismiss') { return; }
      this.hide();
    };
    antlion.bindInput(el, 'click', 'marriage-notice-click');
    antlion.onInput('marriage-notice-click', this._clickHandler);
  }

  destroy() {
    this._stopCountdown();
    this._antlion.offInput('marriage-notice-click', this._clickHandler);
  }

  show(nickname, suit, bonus, seconds = 5) {
    this._stopCountdown();
    this._remaining = seconds;
    this._el.className = 'modal-overlay marriage-notice';
    this._el.replaceChildren();
    this._el.style.display = 'flex';

    const card = document.createElement('div');
    card.className = 'modal-card marriage-notice__card';

    const heading = document.createElement('h2');
    heading.textContent = this._t('game.marriageDeclaredTitle');
    card.appendChild(heading);

    const info = document.createElement('div');
    info.className = 'marriage-notice__text';
    info.textContent = this._t('game.marriageDeclaredText', {
      name: nickname || this._t('game.aPlayer'), suit, bonus,
    });
    card.appendChild(info);

    this._okBtn = document.createElement('button');
    this._okBtn.className = 'btn';
    this._okBtn.dataset.action = 'dismiss';
    card.appendChild(this._okBtn);

    this._el.appendChild(card);
    this._renderButtonLabel();

    this._intervalId = this._antlion.scheduleInterval(1000, () => {
      this._remaining -= 1;
      if (this._remaining <= 0) {
        this.hide();
        return;
      }
      this._renderButtonLabel();
    });
  }

  _renderButtonLabel() {
    if (this._okBtn) {
      this._okBtn.textContent = this._t('controls.okCountdown', { seconds: this._remaining });
    }
  }

  _stopCountdown() {
    if (this._intervalId != null) {
      this._antlion.cancelInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  hide() {
    this._stopCountdown();
    this._el.replaceChildren();
    this._el.style.display = 'none';
    this._okBtn = null;
  }
}

export default MarriageNotice;
