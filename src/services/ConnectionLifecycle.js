'use strict';

const WS_OPEN = 1;

// Player connection lifecycle: disconnect grace timers, reconnection
// (last-connect-wins), and grace-expiry purge. Extracted from ThousandStore to
// keep that class focused on game/round/lobby state. Holds a back-reference to
// the store for shared state (players, games, sendToPlayer, round cleanup) and
// reads `store._gracePeriodMs` live so tests can tune it after construction.
class ConnectionLifecycle {
  constructor(store) {
    this._store = store;
  }

  handleDisconnect(playerId, ws) {
    const store = this._store;
    if (!playerId || !store.players.has(playerId)) {
      return;
    }
    const player = store.players.get(playerId);
    // If a newer ws has replaced this one (last-connect-wins), the old close event
    // is stale — leave the live session alone.
    if (ws && player.ws !== ws) {
      return;
    }
    player.ws = null;
    player.disconnectedAt = Date.now();
    player.graceTimer = setTimeout(() => this._purge(playerId), store._gracePeriodMs);
    if (typeof player.graceTimer.unref === 'function') {player.graceTimer.unref();}

    if (player.gameId) {
      const game = store.games.get(player.gameId);
      if (game && game.status === 'in-progress' && game.round) {
        const seat = game.round.seatByPlayer.get(playerId);
        game.round.markDisconnected(seat);
        for (const pid of game.players) {
          if (pid === playerId) {continue;}
          const recipientSeat = game.round.seatByPlayer.get(pid);
          store.sendToPlayer(pid, {
            type: 'player_disconnected',
            playerId,
            gameStatus: game.round.getViewModelFor(recipientSeat),
          });
        }
      }
    }
  }

  reconnect(playerId, ws) {
    const store = this._store;
    const player = store.players.get(playerId);
    if (!player) {return;}
    clearTimeout(player.graceTimer);
    player.graceTimer = null;
    player.disconnectedAt = null;
    if (player.ws && player.ws.readyState === WS_OPEN) {
      // readyState can flip between the check and send — swallow the error so
      // the state-update steps below still run.
      try {
        player.ws.send(JSON.stringify({ type: 'session_replaced' }));
        player.ws.close();
      } catch { /* socket already gone */ }
    }
    player.ws = ws;
    ws._playerId = playerId;

    if (player.gameId) {
      const game = store.games.get(player.gameId);
      if (game && game.status === 'in-progress' && game.round) {
        const seat = game.round.seatByPlayer.get(playerId);
        game.round.markReconnected(seat);
        for (const pid of game.players) {
          if (pid === playerId) {continue;}
          const recipientSeat = game.round.seatByPlayer.get(pid);
          store.sendToPlayer(pid, {
            type: 'player_reconnected',
            playerId,
            gameStatus: game.round.getViewModelFor(recipientSeat),
          });
        }
      }
    }
  }

  // Intentional logout: tear the player down right now (free the nickname,
  // invalidate the session token, clean up any game) instead of waiting out the
  // disconnect grace window the way a refresh/reconnect relies on.
  logout(playerId) {
    const player = this._store.players.get(playerId);
    if (player && player.graceTimer) {
      clearTimeout(player.graceTimer);
      player.graceTimer = null;
    }
    this._purge(playerId);
  }

  _purge(playerId) {
    const store = this._store;
    const player = store._registry.remove(playerId);
    if (!player) {return;}
    // Defensive: timer is normally already firing when we land here, but a future
    // direct caller (e.g. abandon-on-leave) would leak the pending callback.
    if (player.graceTimer) {
      clearTimeout(player.graceTimer);
      player.graceTimer = null;
    }
    const { gameId, nickname } = player;
    if (!gameId) {return;}
    const game = store.games.get(gameId);
    if (!game) {return;}

    if (game.status === 'in-progress' && game.round) {
      // FR-025 / FR-029: grace expiry between rounds (round-summary phase) → game_aborted
      if (game.round.phase === 'round-summary' && game.session) {
        game.session.gameStatus = 'aborted';
        const abortedMsg = {
          type: 'game_aborted',
          reason: 'player_grace_expired',
          disconnectedNickname: nickname,
          gameStatus: { phase: 'Game aborted' },
        };
        for (const pid of game.players) {
          if (pid === playerId) {continue;}
          store.sendToPlayer(pid, abortedMsg);
        }
        store._cleanupRound(gameId);
        return;
      }

      // FR-021 / FR-029: grace expiry mid-round → round_aborted
      game.round.abort();
      const baseMsg = { type: 'round_aborted', reason: 'player_grace_expired', disconnectedNickname: nickname };
      for (const pid of game.players) {
        if (pid === playerId) {continue;}
        const recipientSeat = game.round.seatByPlayer.get(pid);
        store.sendToPlayer(pid, { ...baseMsg, gameStatus: game.round.getViewModelFor(recipientSeat) });
      }
      store._cleanupRound(gameId);
      return;
    }

    game.players.delete(playerId);
    store._resolveGameAfterExit(gameId, game, playerId, nickname);
  }
}

module.exports = ConnectionLifecycle;
