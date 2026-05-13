const $ = (id) => document.getElementById(id);

class LobbyBinder {
  constructor(antlion, app) {
    this._antlion = antlion;
    this._app = app;
  }

  bind() {
    this._bindInviteJoin();
    this._bindCopyInvite();
    this._bindGameListSelect();
    this._bindJoinSelectedBtn();
  }

  _bindInviteJoin() {
    const app = this._app;
    this._antlion.bindInput($('invite-code-input'), 'input', 'invite-code-input');
    this._antlion.onInput('invite-code-input', () => {
      $('join-invite-btn').disabled = !$('invite-code-input').value.trim();
    });
    this._antlion.bindInput($('join-invite-btn'), 'click', 'invite-join-click');
    this._antlion.onInput('invite-join-click', () => {
      const code = $('invite-code-input').value.trim().toUpperCase();
      if (!code) {
        app._toast.show('Enter an invite code.');
        return;
      }
      if (!app._nickname) {
        app._toast.show('Enter a nickname first.');
        return;
      }
      app._joinWithCode(code);
    });
  }

  _bindCopyInvite() {
    const app = this._app;
    this._antlion.bindInput($('copy-invite-btn'), 'click', 'copy-invite-click');
    this._antlion.onInput('copy-invite-click', () => {
      const code = $('invite-code-value').textContent;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => app._toast.show('Code copied!'));
        return;
      }
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      app._toast.show('Code copied!');
    });
  }

  _bindGameListSelect() {
    const app = this._app;
    this._antlion.bindInput($('game-list'), 'click', 'game-list-click');
    this._antlion.onInput('game-list-click', (e) => {
      const li = e.target.closest('li[data-id]');
      if (!li) {
        return;
      }
      const gameId = li.dataset.id;
      if (app._selectedGameId === gameId) {
        app._clearGameSelection();
      } else {
        const prev = $('game-list').querySelector('li.selected');
        if (prev) {
          prev.classList.remove('selected');
        }
        li.classList.add('selected');
        app._selectedGameId = gameId;
        $('join-selected-btn').disabled = false;
      }
    });

    this._antlion.bindInput($('game-list'), 'dblclick', 'game-list-dblclick');
    this._antlion.onInput('game-list-dblclick', (e) => {
      const li = e.target.closest('li[data-id]');
      if (!li) {
        return;
      }
      app._joinGame(li.dataset.id);
    });
  }

  _bindJoinSelectedBtn() {
    const app = this._app;
    this._antlion.bindInput($('join-selected-btn'), 'click', 'join-selected-click');
    this._antlion.onInput('join-selected-click', () => {
      if (app._selectedGameId) {
        app._joinGame(app._selectedGameId);
      }
    });
  }
}

export default LobbyBinder;
