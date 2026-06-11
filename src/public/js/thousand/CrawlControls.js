// ============================================================
// CrawlControls — first-trick crawl affordance (FR-002, FR-003, FR-004)
// ============================================================

// Two faces, one component:
//  - the declarer (eligible, ace-less) sees a "Crawl / Lead normally" choice;
//  - an opponent whose turn it is to respond sees a "commit a card face-down"
//    prompt.
// The buttons only choose a *mode*; the actual card is then picked from the
// hand (TrickPlayView routes that click to sendCrawlCommit / sendPlayCard).
// A single named Antlion input is stored so destroy() can offInput it — no
// handler leak across rounds (mirrors FourNinesPrompt).
class CrawlControls {
  constructor(el, { antlion, onCrawl, onLeadNormally, t }) {
    this._el = el;
    this._antlion = antlion;
    this._onCrawl = onCrawl;
    this._onLeadNormally = onLeadNormally;
    this._t = t;
    this._chosen = false;

    this._clickHandler = (e) => {
      const action = e.target?.dataset?.action;
      if (action !== 'crawl' && action !== 'lead-normally') { return; }
      if (this._chosen) { return; } // sticky local press — fire once
      this._chosen = true;
      if (action === 'crawl') { this._onCrawl?.(); } else { this._onLeadNormally?.(); }
      this._renderChosen(action);
    };
    antlion.bindInput(el, 'click', 'crawl-controls-click');
    antlion.onInput('crawl-controls-click', this._clickHandler);
  }

  destroy() {
    this._antlion.offInput('crawl-controls-click', this._clickHandler);
  }

  showDeclarerChoice() {
    this._chosen = false;
    this._el.className = 'trick-play__crawl-controls crawl-controls crawl-controls--declarer';
    this._el.replaceChildren();
    this._el.style.display = 'flex';

    const info = document.createElement('div');
    info.className = 'crawl-controls__text';
    info.textContent = this._t('game.crawlChoice');
    this._el.appendChild(info);

    this._el.appendChild(this._button(this._t('controls.crawl'), 'crawl'));
    this._el.appendChild(this._button(this._t('controls.leadNormally'), 'lead-normally'));
  }

  showOpponentPrompt() {
    this._chosen = true; // opponents have no choice buttons to guard
    this._el.className = 'trick-play__crawl-controls crawl-controls crawl-controls--opponent';
    this._el.replaceChildren();
    this._el.style.display = 'flex';

    const info = document.createElement('div');
    info.className = 'crawl-controls__text';
    info.textContent = this._t('game.crawlCommitPrompt');
    this._el.appendChild(info);
  }

  hide() {
    this._el.replaceChildren();
    this._el.style.display = 'none';
  }

  _button(label, action) {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = label;
    btn.dataset.action = action;
    return btn;
  }

  _renderChosen(action) {
    const label = action === 'crawl'
      ? this._t('game.crawlPickCommit')
      : this._t('game.crawlPickLead');
    this._el.replaceChildren();
    const info = document.createElement('div');
    info.className = 'crawl-controls__text';
    info.textContent = label;
    this._el.appendChild(info);
  }
}

export default CrawlControls;
