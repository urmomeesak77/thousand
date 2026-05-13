import HtmlContainer from '../antlion/HtmlContainer.js';

class NicknameScreen extends HtmlContainer {
  constructor(element, api, toast) {
    super('nickname-screen');
    this._element = element;
    this._isVisible = !element.classList.contains('hidden');
    this._api = api;
    this._toast = toast;
  }

  onCreate() {
    super.onCreate();
    const engine = this.getEngine();
    const form = this._element.querySelector('#nickname-form');
    engine.bindInput(form, 'submit', 'nickname-submit');
    engine.onInput('nickname-submit', (e) => this._onSubmit(e));
  }

  async _onSubmit(e) {
    e.preventDefault();
    const nick = this._element.querySelector('#nickname-input').value.trim();
    if (!nick) {
      return;
    }
    if (nick.length < 3 || nick.length > 20) {
      this._toast.show('Nickname must be 3–20 characters.');
      return;
    }
    const ok = await this._api.claimNickname(nick);
    if (!ok) {
      return;
    }
    this.getEngine().emit('nickname-entered', { nick });
  }
}

export default NicknameScreen;
