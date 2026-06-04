'use strict';

const crypto = require('crypto');

const Round = require('./Round');
const Game = require('./Game');
const PlayerRegistry = require('./PlayerRegistry');
const ConnectionLifecycle = require('./ConnectionLifecycle');
const { pickBotName } = require('./bots/botNames');
const { applySeededScores } = require('./testScoreSeeding');

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
    // Connection lifecycle (disconnect/reconnect/purge) reads `_gracePeriodMs`
    // live, so it must be constructed after the field is set.
    this._lifecycle = new ConnectionLifecycle(this);
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
    this._lifecycle.handleDisconnect(playerId, ws);
  }

  reconnectPlayer(playerId, ws) {
    this._lifecycle.reconnect(playerId, ws);
  }

  // Intentional logout — purge the player immediately so their nickname and
  // session token free up at once (a refresh keeps them via the grace window;
  // logout deliberately discards them).
  logoutPlayer(playerId) {
    this._lifecycle.logout(playerId);
  }

  // T034 – broadcast lobby state to every client whose gameId is null
  broadcastLobbyUpdate() {
    const msg = JSON.stringify({ type: 'lobby_update', games: this.getLobbyGames() });
    for (const [, player] of this.players) {
      if (player.gameId !== null) {continue;}
      for (const ws of player.sockets) {
        if (ws.readyState !== WS_OPEN) {continue;}
        // readyState can flip between the check and send; swallow per-socket
        // errors so one bad tab doesn't abort the broadcast.
        try { ws.send(msg); } catch { /* ignore */ }
      }
    }
  }

  sendToPlayer(playerId, payload) {
    this._registry.sendToPlayer(playerId, payload);
  }

  serializePlayers(game) {
    return this._registry.serializePlayers(game);
  }

  // Seats a socketless bot in the given game. Host/waiting/not-full preconditions are
  // enforced by the caller (GameController). Mirrors the human-join broadcast and reuses
  // the existing auto-start-when-full path so bots start a game identically (FR-001, FR-004).
  addBot(gameId) {
    const game = this.games.get(gameId);
    if (!game) {return null;}
    const usedNames = [...game.players]
      .map((pid) => this.players.get(pid)?.nickname)
      .filter(Boolean);
    const nickname = pickBotName(usedNames);
    const { playerId: botId } = this._registry.createBot(nickname);
    this.players.get(botId).gameId = gameId;
    game.players.add(botId);

    const allPlayers = this.serializePlayers(game);
    for (const pid of game.players) {
      if (pid === botId) {continue;}
      this.sendToPlayer(pid, {
        type: 'player_joined',
        player: { nickname, isBot: true },
        players: allPlayers,
      });
    }
    this.broadcastLobbyUpdate();

    if (game.players.size === game.requiredPlayers) {
      this.startRound(gameId);
    }
    return { botId, nickname };
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

  // Bots have no session token to expire, so the disconnect/grace lifecycle never
  // reclaims them. Every game-teardown path must explicitly remove a game's bot
  // records or they leak in the registry forever (FR-014).
  _purgeBots(game) {
    for (const pid of game.players) {
      const player = this.players.get(pid);
      if (player?.isBot) {this._registry.remove(pid);}
    }
  }

  _deleteGame(gameId, game) {
    this._purgeBots(game);
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
      // requiredPlayers (3 or 4) is the source of truth for player count (FR-001);
      // seatOrder preserves join order so seat 0 = host/dealer … seat N-1 (R-306).
      game.session = new Game({ gameId, seatOrder, dealerSeat, playerCount: game.requiredPlayers });
      // Populate nicknames: seatOrder[i] is the playerId for seat i
      for (let seat = 0; seat < seatOrder.length; seat++) {
        const pid = seatOrder[seat];
        const player = this.players.get(pid);
        if (player) {
          game.session.nicknames[seat] = player.nickname || '';
        }
      }
      // Test-only: seed cumulative scores from THOUSAND_SEED_SCORES (inert in
      // production) so end-game/barrel paths are reachable without ~10 rounds.
      applySeededScores(game.session);
    } else {
      // Round 2+: rotate dealer and increment round number
      game.session.startNextRound();
    }

    this.buildRound(game);
    for (const pid of game.players) {
      const payload = game.round.getRoundStartedPayloadFor(pid);
      if (payload) {this.sendToPlayer(pid, payload);}
    }
    this.broadcastLobbyUpdate();
  }

  // Constructs and primes the per-round state machine for a game. Shared by the
  // initial round start (above) and the between-rounds advance in
  // RoundActionHandler so the "new Round → start → advance to bidding" sequence
  // lives in one place. Callers own the session lifecycle and the broadcast.
  buildRound(game) {
    game.round = new Round({ game, store: this });
    game.round.start();
    game.round.advanceFromDealingToBidding();
    return game.round;
  }

  _cleanupRound(gameId) {
    const game = this.games.get(gameId);
    if (!game) {return;}
    for (const pid of game.players) {
      const player = this.players.get(pid);
      if (player) {player.gameId = null;}
    }
    this._purgeBots(game);
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
    // Match every other timer in the codebase (grace, heartbeat, rate-limiter cron):
    // don't let a pending 10-minute timeout keep the event loop alive on shutdown.
    if (typeof game.waitingRoomTimer.unref === 'function') {game.waitingRoomTimer.unref();}
  }
}

module.exports = ThousandStore;
