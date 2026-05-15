import { IdentityStore } from '../storage/IdentityStore.js';

const $ = (id) => document.getElementById(id);

// Defensive shape checks for server→client WS messages. Today renderers use
// textContent so an unexpected shape can't trip XSS, but if a future renderer
// switches to innerHTML this gate keeps the surface narrow.
const isObj = (v) => v !== null && typeof v === 'object';

const MESSAGE_VALIDATORS = {
  connected: (m) => (
    typeof m.playerId === 'string'
    && typeof m.sessionToken === 'string'
    && typeof m.restored === 'boolean'
    && (m.nickname === null || typeof m.nickname === 'string')
  ),
  session_replaced: () => true,
  lobby_update: (m) => Array.isArray(m.games),
  game_joined: (m) => typeof m.gameId === 'string' && Array.isArray(m.players) && typeof m.requiredPlayers === 'number',
  player_joined: (m) => Array.isArray(m.players) && m.player && typeof m.player.nickname === 'string',
  player_left: (m) => Array.isArray(m.players) && (m.nickname === null || typeof m.nickname === 'string'),
  game_disbanded: () => true,
  error: (m) => m.message === undefined || typeof m.message === 'string',
  round_started: (m) => (
    isObj(m.seats)
    && typeof m.seats.self === 'number'
    && Array.isArray(m.seats.players)
    && Array.isArray(m.dealSequence)
    && isObj(m.gameStatus)
  ),
  phase_changed: (m) => typeof m.phase === 'string' && isObj(m.gameStatus),
  bid_accepted: (m) => typeof m.playerId === 'string' && typeof m.amount === 'number' && isObj(m.gameStatus),
  pass_accepted: (m) => typeof m.playerId === 'string' && isObj(m.gameStatus),
  talon_absorbed: (m) => typeof m.declarerId === 'string' && Array.isArray(m.talonIds) && isObj(m.gameStatus),
  sell_started: (m) => isObj(m.gameStatus),
  sell_exposed: (m) => typeof m.declarerId === 'string' && Array.isArray(m.exposedIds) && isObj(m.gameStatus),
  sell_resolved: (m) => (
    typeof m.outcome === 'string'
    && typeof m.oldDeclarerId === 'string'
    && Array.isArray(m.exposedIds)
    && isObj(m.gameStatus)
  ),
  play_phase_ready: (m) => typeof m.declarerId === 'string' && typeof m.finalBid === 'number' && isObj(m.gameStatus),
  card_exchange_started: (m) => typeof m.declarerId === 'string' && typeof m.finalBid === 'number' && isObj(m.gameStatus),
  card_passed: (m) => isObj(m.gameStatus),
  trick_play_started: (m) => isObj(m.gameStatus),
  card_played: (m) => isObj(m.gameStatus),
  marriage_declared: (m) => (
    typeof m.playerSeat === 'number'
    && typeof m.suit === 'string'
    && typeof m.bonus === 'number'
    && typeof m.trickNumber === 'number'
    && typeof m.newTrumpSuit === 'string'
    && isObj(m.gameStatus)
  ),
  trump_changed: (m) => typeof m.newTrumpSuit === 'string' && isObj(m.gameStatus),
  round_summary: (m) => isObj(m.summary) && isObj(m.gameStatus),
  round_aborted: (m) => (
    typeof m.reason === 'string'
    && typeof m.disconnectedNickname === 'string'
    && isObj(m.gameStatus)
  ),
  action_rejected: (m) => typeof m.reason === 'string',
  round_state_snapshot: (m) => (
    typeof m.phase === 'string'
    && isObj(m.gameStatus)
    && isObj(m.seats)
    && Array.isArray(m.myHand)
    && isObj(m.opponentHandSizes)
  ),
  player_disconnected: (m) => typeof m.playerId === 'string' && isObj(m.gameStatus),
  player_reconnected: (m) => typeof m.playerId === 'string' && isObj(m.gameStatus),
};

class ThousandMessageRouter {
  constructor(app) {
    this._app = app;
    this._handlers = {
      connected:            (m) => this._onConnected(m),
      lobby_update:         (m) => this._onLobbyUpdate(m),
      game_joined:          (m) => this._onGameJoined(m),
      player_joined:        (m) => this._onPlayerJoined(m),
      player_left:          (m) => this._onPlayerLeft(m),
      game_disbanded:       (m) => this._onGameDisbanded(m),
      session_replaced:     ( ) => this._onSessionReplaced(),
      error:                (m) => app._toast.show(m.message || 'An error occurred'),
      round_started:        (m) => this._onRoundStarted(m),
      phase_changed:        (m) => app._gameScreen.updateStatus(m.gameStatus),
      action_rejected:      (m) => app._toast.show(m.reason),
      bid_accepted:         (m) => this._onBidAccepted(m),
      pass_accepted:        (m) => this._onPassAccepted(m),
      talon_absorbed:           (m) => app._gameScreen.sellPhase.absorbTalon(m),
      play_phase_ready:         (m) => this._onPlayPhaseReady(m),
      card_exchange_started:    (m) => app.onCardExchangeStarted(m),
      card_passed:              (m) => app.onCardPassed(m),
      trick_play_started:       (m) => app.onTrickPlayStarted(m),
      card_played:              (m) => app.onCardPlayed(m),
      marriage_declared:        (m) => app.onMarriageDeclared(m),
      trump_changed:            (m) => app.onTrumpChanged(m),
      round_summary:            (m) => app.onRoundSummary(m),
      round_aborted:            (m) => this._onRoundAborted(m),
      player_disconnected:      (m) => this._onPlayerDisconnected(m),
      player_reconnected:       (m) => this._onPlayerReconnected(m),
      round_state_snapshot: (m) => this._onRoundStateSnapshot(m),
      sell_started:         (m) => app._gameScreen.sellPhase.enterSellSelection(m.gameStatus),
      sell_exposed:         (m) => app._gameScreen.sellPhase.enterSellBidding(m),
      sell_resolved:        (m) => app._gameScreen.sellPhase.exitSelling(m),
    };
  }

  handle(msg) {
    if (!msg || typeof msg.type !== 'string') {return;}
    const validator = MESSAGE_VALIDATORS[msg.type];
    if (!validator || !validator(msg)) {
      console.warn('[router] dropped message', msg);
      return;
    }
    this._handlers[msg.type]?.(msg);
  }

  // Server kicks this connection when another tab/browser connects with the same
  // identity (last-connect-wins). Stop the reconnect loop so the kicked tab
  // doesn't immediately kick the new one back — that races forever.
  _onSessionReplaced() {
    const app = this._app;
    app._toast.show('Connected from another tab or browser — this session ended.');
    app._socket.disconnect();
  }

  _onConnected(msg) {
    const app = this._app;
    // Hide first: any throw below shouldn't strand the user behind the overlay.
    app._reconnectOverlay.hide();
    app._playerId = msg.playerId;
    app._sessionToken = msg.sessionToken;
    app._api.setSessionToken(app._sessionToken);
    IdentityStore.save(msg.playerId, msg.sessionToken);
    if (msg.restored && msg.nickname !== null) {
      app._nickname = msg.nickname;
      $('player-name-display').textContent = msg.nickname;
      app._showScreen('lobby-screen');
      app._gameList.startElapsedTimer();
    } else {
      app._showScreen('nickname-screen');
    }
  }

  _onLobbyUpdate(msg) {
    const app = this._app;
    app._gameList.setGames(msg.games);
    if (app._selectedGameId && !msg.games.find((g) => g.id === app._selectedGameId)) {
      app._clearGameSelection();
    }
  }

  _onGameJoined(msg) {
    const app = this._app;
    app._gameId = msg.gameId;
    app._inviteCode = msg.inviteCode ?? null;
    app._clearGameSelection();
    app._gameList.stopElapsedTimer();
    app._waitingRoom.load(app._gameId, app._inviteCode, msg.players, msg.requiredPlayers);
    app._showScreen('game-screen');
    app._waitingRoom.startTimer(msg.createdAt);
  }

  _onGameDisbanded(msg) {
    const app = this._app;
    app._gameId = null;
    app._inviteCode = null;
    app._waitingRoom.stopTimer();
    app._showScreen('lobby-screen');
    app._gameList.startElapsedTimer();
    app._toast.show(
      msg.reason === 'waiting_room_timeout'
        ? 'Waiting room closed — the game wasn\'t started within 10 minutes.'
        : 'The host left — game was disbanded.'
    );
  }

  _onPlayerJoined(msg) {
    const app = this._app;
    app._waitingRoom.updatePlayers(msg.players);
    app._toast.show(`${msg.player.nickname} joined the game.`);
  }

  _onPlayerLeft(msg) {
    const app = this._app;
    app._waitingRoom.updatePlayers(msg.players);
    app._toast.show(`${msg.nickname || 'A player'} left the game.`);
  }

  _onRoundStarted(msg) {
    const app = this._app;
    app._waitingRoom.stopTimer();
    app._showGameSubscreen('round');
    app._gameScreen.init(msg);
  }

  _onBidAccepted(msg) {
    const app = this._app;
    app._gameScreen.updateStatus(msg.gameStatus);
    app._gameScreen.flashPlayer(msg.playerId);
    app._gameScreen.setBidAction(msg.playerId, msg.amount);
  }

  _onPassAccepted(msg) {
    const app = this._app;
    app._gameScreen.updateStatus(msg.gameStatus);
    app._gameScreen.flashPlayer(msg.playerId);
    app._gameScreen.setPassAction(msg.playerId);
  }

  _onPlayPhaseReady(msg) {
    const app = this._app;
    app._gameScreen.updateStatus(msg.gameStatus);
    app._gameScreen.showRoundReady(
      'ready',
      { declarerNickname: msg.gameStatus.declarer?.nickname, finalBid: msg.finalBid },
      () => app._returnFromRound(),
    );
  }

  _onRoundAborted(msg) {
    const app = this._app;
    app._roundEnded = true;
    app._gameScreen.updateStatus(msg.gameStatus);
    app._gameScreen.showRoundReady(
      'aborted',
      { disconnectedNickname: msg.disconnectedNickname, reason: msg.reason },
      () => app._returnFromRound(),
    );
  }

  _onPlayerDisconnected(msg) {
    const app = this._app;
    app._gameScreen.updateStatus(msg.gameStatus);
    app._gameScreen.setPlayerDisconnected(msg.playerId, true);
  }

  _onPlayerReconnected(msg) {
    const app = this._app;
    app._gameScreen.updateStatus(msg.gameStatus);
    app._gameScreen.setPlayerDisconnected(msg.playerId, false);
  }

  _onRoundStateSnapshot(msg) {
    const app = this._app;
    app._waitingRoom.stopTimer();
    app._showScreen('game-screen');
    app._showGameSubscreen('round');
    app._gameScreen.initFromSnapshot(msg);
  }
}

export default ThousandMessageRouter;
