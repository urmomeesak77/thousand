'use strict';

const HttpUtil = require('../utils/HttpUtil');
const { validateNickname } = require('./validators');
const { isNicknameTaken } = require('./nicknameLookup');

const INVALID_NICKNAME_MSG = 'nickname must be 3–20 characters and contain no control characters';
const DUPLICATE_NICKNAME_MSG = 'That nickname is already taken';

class NicknameController {
  constructor(store) {
    this.store = store;
  }

  // POST /api/nickname
  async handleClaimNickname(req, res, player) {
    let body;
    try {
      body = await HttpUtil.parseBody(req);
    } catch {
      HttpUtil.sendError(res, 400, 'invalid_request', 'Invalid JSON body');
      return;
    }

    const { nickname } = body;
    if (!validateNickname(nickname)) {
      HttpUtil.sendError(res, 400, 'invalid_request', INVALID_NICKNAME_MSG);
      return;
    }

    const nick = nickname.trim();
    if (isNicknameTaken(this.store.players, nick, player.id)) {
      HttpUtil.sendError(res, 409, 'duplicate_nickname', DUPLICATE_NICKNAME_MSG);
      return;
    }

    player.nickname = nick;
    HttpUtil.sendJSON(res, 200, { nickname: nick });
  }
}

module.exports = NicknameController;
