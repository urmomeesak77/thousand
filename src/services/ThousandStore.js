'use strict';

const crypto = require('crypto');

const Round = require('./Round');
const Game = require('./Game');
const PlayerRegistry = require('./PlayerRegistry');

const WAITING_ROOM_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_GRACE_PERIOD_MS = 30_000;
const WS_OPEN = 1;

class ThousandStore {
  constructor() {
    this.games = new Map();        // gameId -> Game
    this.inviteCodes = new Map();  // inviteCode -> gameId
    this._registry = new PlayerRegistry();
    // A bad env value (e.g. "foo") becomes NaN, and setTimeout(NaN) fires immediately —
    // every disconnect would purge instantly. Reject anything that isn't a positive finite number.
    const parsed = process.env.GRACE_PERIOD_MS ? Number(process.env.GRACE_PERIOD_MS) : null;
    this._gracePeriodMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GRACE_PERIOD_MS;
  }

  get players() {
    return this._registry.players;
  }

  createPlayer(ws, clientIp) {
    return this._registry.create(ws, clientIp);
  }

  createOrRestorePlayer(ws, clientIp, playerId, sessionToken) {
    return this._registry.createOrRestore(ws, clientIp, playerId, sessionToken);
  }

  findBySessionToken(token) {
    return this._registry.findBySessionToken(token);
  }

  // T026 – invite code generator
  generateInviteCode() {
    let code;
    let attempts = 0;
    do {
      if (++attempts > 1000) {
        throw new Error('Invite code space exhausted');
      }
      code = crypto.randomBytes(3).toString('hex').toUpperCase();
    } while (this.inviteCodes.has(code));
    return code;
  }

  getLobbyGames() {
    const result = [];
    for (const [id, game] of this.games) {
      if (game.type === 'public' && game.status === 'waiting') {
        const host = this.players.get(game.hostId);
        const playerNames = [...game.players]
          .map((pid) => this.players.get(pid)?.nickname)
          .filter(Boolean);
        result.push({
          id,
          playerCount: game.players.size,
          requiredPlayers: game.requiredPlayers,
          owner: host ? host.nickname : null,
          createdAt: game.createdAt,
          players: playerNames,
        });
      }
    }
    return result;
  }

  leaveGame(playerId, gameId) {
    const player = this.players.get(playerId);
    if (!player || player.gameId !== gameId) {
      return false;
    }

    const game = this.games.get(gameId);
    if (!game) {
      return false;
    }

    const { nickname } = player;
    game.players.delete(playerId);
    player.gameId = null;
    this._resolveGameAfterExit(gameId, game, playerId, nickname);
    return true;
  }

  handlePlayerDisconnect(playerId, ws) {
    if (!playerId || !this.players.has(playerId)) {
      return;
    }
    const player = this.players.get(playerId);
    // If a newer ws has replaced this one (last-connect-wins), the old close event
    // is stale — leave the live session alone.
    if (ws && player.ws !== ws) {
      return;
    }
    player.ws = null;
    player.disconnectedAt = Date.now();
    player.graceTimer = setTimeout(() => this._purgePlayer(playerId), this._gracePeriodMs);
    if (typeof player.graceTimer.unref === 'function') {player.graceTimer.unref();}

    if (player.gameId) {
      const game = this.games.get(player.gameId);
      if (game && game.status === 'in-progress' && game.round) {
        const seat = game.round.seatByPlayer.get(playerId);
        game.round.markDisconnected(seat);
        for (const pid of game.players) {
          if (pid === playerId) {continue;}
          const recipientSeat = game.round.seatByPlayer.get(pid);
          this.sendToPlayer(pid, {
            type: 'player_disconnected',
            playerId,
            gameStatus: game.round.getViewModelFor(recipientSeat),
          });
        }
      }
    }
  }

  reconnectPlayer(playerId, ws) {
    const player = this.players.get(playerId);
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
      const game = this.games.get(player.gameId);
      if (game && game.status === 'in-progress' && game.round) {
        const seat = game.round.seatByPlayer.get(playerId);
        game.round.markReconnected(seat);
        for (const pid of game.players) {
          if (pid === playerId) {continue;}
          const recipientSeat = game.round.seatByPlayer.get(pid);
          this.sendToPlayer(pid, {
            type: 'player_reconnected',
            playerId,
            gameStatus: game.round.getViewModelFor(recipientSeat),
          });
        }
      }
    }
  }

  _purgePlayer(playerId) {
    const player = this._registry.remove(playerId);
    if (!player) {return;}
    // Defensive: timer is normally already firing when we land here, but a future
    // direct caller (e.g. abandon-on-leave) would leak the pending callback.
    if (player.graceTimer) {
      clearTimeout(player.graceTimer);
      player.graceTimer = null;
    }
    const { gameId, nickname } = player;
    if (!gameId) {return;}
    const game = this.games.get(gameId);
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
          this.sendToPlayer(pid, abortedMsg);
        }
        this._cleanupRound(gameId);
        return;
      }

      // FR-021 / FR-029: grace expiry mid-round → round_aborted
      game.round.abort();
      const baseMsg = { type: 'round_aborted', reason: 'player_grace_expired', disconnectedNickname: nickname };
      for (const pid of game.players) {
        if (pid === playerId) {continue;}
        const recipientSeat = game.round.seatByPlayer.get(pid);
        this.sendToPlayer(pid, { ...baseMsg, gameStatus: game.round.getViewModelFor(recipientSeat) });
      }
      this._cleanupRound(gameId);
      return;
    }

    game.players.delete(playerId);
    this._resolveGameAfterExit(gameId, game, playerId, nickname);
  }

  // T034 – broadcast lobby state to every client whose gameId is null
  broadcastLobbyUpdate() {
    const msg = JSON.stringify({ type: 'lobby_update', games: this.getLobbyGames() });
    for (const [, player] of this.players) {
      if (player.gameId === null && player.ws && player.ws.readyState === WS_OPEN) {
        // readyState can flip between the check and send (socket terminated mid-iteration).
        // Swallow per-recipient errors so one bad ws doesn't abort the broadcast.
        try { player.ws.send(msg); } catch { /* ignore */ }
      }
    }
  }

  sendToPlayer(playerId, payload) {
    this._registry.sendToPlayer(playerId, payload);
  }

  serializePlayers(game) {
    return this._registry.serializePlayers(game);
  }

  _resolveGameAfterExit(gameId, game, playerId, nickname) {
    if (game.players.size === 0) {
      this._deleteGame(gameId, game);
      return;
    }
    if (game.status === 'in-progress' && game.round) {
      game.round.abort();
      const baseMsg = { type: 'round_aborted', reason: 'player_left', disconnectedNickname: nickname };
      for (const pid of game.players) {
        const recipientSeat = game.round.seatByPlayer.get(pid);
        this.sendToPlayer(pid, { ...baseMsg, gameStatus: game.round.getViewModelFor(recipientSeat) });
      }
      this._cleanupRound(gameId);
      return;
    }
    if (game.hostId === playerId && game.status === 'waiting') {
      this._disbandGame(gameId, game);
      return;
    }
    const remaining = this.serializePlayers(game);
    const leftMsg = { type: 'player_left', playerId, nickname, players: remaining };
    for (const pid of game.players) {
      this.sendToPlayer(pid, leftMsg);
    }
    this.broadcastLobbyUpdate();
  }

  _deleteGame(gameId, game) {
    if (game.waitingRoomTimer) {
      clearTimeout(game.waitingRoomTimer);
      game.waitingRoomTimer = null;
    }
    if (game.inviteCode) {
      this.inviteCodes.delete(game.inviteCode);
    }
    this.games.delete(gameId);
    this.broadcastLobbyUpdate();
  }

  _disbandGame(gameId, game, reason = 'host_left') {
    const disbandMsg = { type: 'game_disbanded', reason };
    for (const pid of game.players) {
      const p = this.players.get(pid);
      if (p) {
        p.gameId = null;
      }
      this.sendToPlayer(pid, disbandMsg);
    }
    this._deleteGame(gameId, game);
  }

  startRound(gameId) {
    const game = this.games.get(gameId);
    if (!game) {return;}
    if (game.waitingRoomTimer) {
      clearTimeout(game.waitingRoomTimer);
      game.waitingRoomTimer = null;
    }
    game.status = 'in-progress';

    if (!game.session) {
      // Round 1: create the Game session instance
      const seatOrder = [...game.players];
      const dealerSeat = 0;
      game.session = new Game({ gameId, seatOrder, dealerSeat });
      // Populate nicknames: seatOrder[i] is the playerId for seat i
      for (let seat = 0; seat < seatOrder.length; seat++) {
        const pid = seatOrder[seat];
        const player = this.players.get(pid);
        if (player) {
          game.session.nicknames[seat] = player.nickname || '';
        }
      }
    } else {
      // Round 2+: rotate dealer and increment round number
      game.session.startNextRound();
    }

    game.round = new Round({ game, store: this });
    game.round.start();
    game.round.advanceFromDealingToBidding();
    for (const pid of game.players) {
      const payload = game.round.getRoundStartedPayloadFor(pid);
      if (payload) {this.sendToPlayer(pid, payload);}
    }
    this.broadcastLobbyUpdate();
  }

  _cleanupRound(gameId) {
    const game = this.games.get(gameId);
    if (!game) {return;}
    for (const pid of game.players) {
      const player = this.players.get(pid);
      if (player) {player.gameId = null;}
    }
    if (game.waitingRoomTimer) {
      clearTimeout(game.waitingRoomTimer);
      game.waitingRoomTimer = null;
    }
    if (game.inviteCode) {
      this.inviteCodes.delete(game.inviteCode);
    }
    this.games.delete(gameId);
    this.broadcastLobbyUpdate();
  }

  scheduleWaitingRoomTimeout(gameId) {
    const game = this.games.get(gameId);
    if (!game) {return;}
    game.waitingRoomTimer = setTimeout(() => {
      const g = this.games.get(gameId);
      if (!g || g.status !== 'waiting') {return;}
      this._disbandGame(gameId, g, 'waiting_room_timeout');
    }, WAITING_ROOM_TIMEOUT_MS);
  }
}

module.exports = ThousandStore;
