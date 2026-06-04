'use strict';

// Player connection lifecycle: disconnect grace timers, reconnection, and
// grace-expiry purge. Extracted from ThousandStore to keep that class focused on
// game/round/lobby state. Holds a back-reference to the store for shared state
// (players, games, sendToPlayer, round cleanup) and reads `store._gracePeriodMs`
// live so tests can tune it after construction.
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
    // Remove just the closing socket. If it wasn't a member (a stale close that
    // arrives after the socket was already removed), do nothing.
    if (ws) {
      if (!player.sockets.delete(ws)) {return;}
    } else {
      // Defensive: callers without a ws (tests, forced teardown) tear down fully.
      player.sockets.clear();
    }
    // Other tabs are still live → the player has not actually left.
    if (player.sockets.size > 0) {
      return;
    }
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
    // Adding a socket to an already-live player (another tab) is NOT a
    // reconnect — only announce one when the player had fully dropped.
    const wasFullyDisconnected = player.sockets.size === 0;
    clearTimeout(player.graceTimer);
    player.graceTimer = null;
    player.disconnectedAt = null;
    player.sockets.add(ws);
    ws._playerId = playerId;

    if (wasFullyDisconnected && player.gameId) {
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
