'use strict';

const HttpUtil = require('../utils/HttpUtil');

class SessionController {
  constructor(store) {
    this.store = store;
  }

  // POST /api/logout — purge the authenticated player so their nickname and
  // session token free up immediately, rather than lingering for the disconnect
  // grace window (which would block reusing the same nickname right after logout).
  handleLogout(req, res, player) {
    this.store.logoutPlayer(player.id);
    HttpUtil.sendJSON(res, 200, { ok: true });
  }
}

module.exports = SessionController;
