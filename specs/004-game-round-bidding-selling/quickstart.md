# Quickstart: Round Setup, Bidding & Selling the Bid

## What changed

A 3-player waiting room now starts an actual card game when its 3rd player joins. The game screen replaces the waiting room, the server deals 24 cards in a clockwise interleaved pattern (animated on every client to the same canonical sequence), and the round proceeds through three phases:

1. **Bidding** — clockwise from the dealer's left; bids are integers in `[100, 300]` in steps of 5; passing locks a player out for the round; the last bidder (or the dealer at 100, if all pass) becomes the declarer.
2. **Declarer decision** — the declarer absorbs the 3 talon cards (their hand grows from 7 to 10) and chooses **Start the Game** or **Sell the Bid**.
3. **Selling** (optional, up to 3 attempts) — the declarer exposes 3 cards in the centre; the two opponents bid/pass clockwise; if one bids and the other passes, the buyer becomes the new declarer at the new bid and takes the 3 cards; if both pass, the cards return and the declarer may try again.

Pressing **Start the Game** emits a `play_phase_ready` event and the server immediately deletes the game record. Each client renders a "Round ready to play — next phase coming soon" screen with a Back-to-Lobby button. The actual play phase (tricks, marriages, scoring) is out of scope for this feature.

A persistent top status bar on every client shows phase + active player + current high bid + declarer + passed players + attempt counter + per-seat connection state, driven by a shared `gameStatus` view-model pushed by the server.

## New files

### Backend

| File | Purpose |
|---|---|
| `src/services/Round.js` | Round state machine + actions (bid, pass, sell select / cancel / bid / pass, start) |
| `src/services/Deck.js` | 24-card factory + Fisher-Yates shuffle (pure functions; `crypto.randomInt` for entropy) |
| `src/controllers/RoundActionHandler.js` | Validates and dispatches in-round WS messages; per-player 250 ms throttle; phase/turn gating; broadcasts |

### Frontend (`src/public/js/thousand/`)

| File | Class / purpose |
|---|---|
| `GameScreen.js` | In-round screen container |
| `StatusBar.js` | Fixed top bar (FR-025) |
| `CardTable.js` | Layout + slot positions for self/left/right/talon/deck-origin |
| `CardSprite.js` | Single card visual (id, position, face state) |
| `HandView.js` | Viewer's own hand: sorted, taps for sell-selection |
| `OpponentView.js` | One opponent's face-down hand |
| `TalonView.js` | Central talon |
| `DealAnimation.js` | 24-step deal animation via `Antlion.onTick` |
| `BidControls.js` | Bid input + ±5 steppers + Pass (FR-028) |
| `DeclarerDecisionControls.js` | Sell / Start buttons |
| `SellSelectionControls.js` | Sell-confirm / Cancel (FR-029) |
| `SellBidControls.js` | Opponent's buy controls |
| `RoundReadyScreen.js` | "Round ready to play" + Back-to-Lobby |
| `RoundActionDispatcher.js` | Outbound WS message wrapper |

### Tests

| File | What it covers |
|---|---|
| `tests/Round.deal.test.js` | Shuffle + canonical 24-step sequence + hand sizes |
| `tests/Round.bidding.test.js` | Bid validation, pass lockout, all-pass → dealer |
| `tests/Round.selling.test.js` | Distinct-attempt rule, opponent rotation, role swap, 3-fail lockout |
| `tests/Round.gating.test.js` | FR-026 phase/turn gating, server-source-of-truth |
| `tests/Round.disconnect.test.js` | Active vs non-active disconnect, grace expiry → abort, FR-032 cleanup |
| `tests/Round.ratelimit.test.js` | FR-030 silent drop within 250 ms |
| `tests/round-messages.test.js` | End-to-end via `ConnectionManager` + fake WS |
| `tests/HandView.test.js` | FR-005 sort rule + re-sort on mutation |
| `tests/GameScreen.gating.test.js` | FR-026 disabled vs hidden matrix on the client |
| `tests/BidControls.test.js` | FR-028 stepper clamp, invalid input handling |
| `tests/SellSelectionControls.test.js` | FR-029 exactly-3 toggle, Cancel |
| `tests/StatusBar.test.js` | FR-025 view-model rendering |

## Modified files

| File | Change |
|---|---|
| `src/services/ThousandStore.js` | Attach `round` to each `Game`; `startRound(gameId)` flips status to `'in-progress'`, instantiates `Round`, broadcasts `round_started`; disconnect-during-round flow (pause vs continue, abort on grace expiry); cleanup on `play_phase_ready` / `round_aborted` (FR-032) |
| `src/services/ConnectionManager.js` | New message branches: `bid`, `pass`, `sell_select`, `sell_cancel`, `sell_bid`, `sell_pass`, `start_game` — all delegated to `RoundActionHandler`. `hello` flow now sends `round_state_snapshot` (instead of `game_joined`) when restoring into an `in-progress` game |
| `src/controllers/GameController.js` | `_admitPlayerToGame`: when the join brings `players.size === requiredPlayers`, call `store.startRound(gameId)` |
| `src/public/js/core/ThousandApp.js` | New validators + handlers: `round_started`, `phase_changed`, `bid_accepted`, `pass_accepted`, `talon_absorbed`, `sell_started`, `sell_exposed`, `sell_resolved`, `play_phase_ready`, `round_aborted`, `action_rejected`, `round_state_snapshot`, `player_disconnected`, `player_reconnected`. Instantiate `GameScreen` alongside `WaitingRoom` in `_gameContainer`; switch based on `game.status`. Route `action_rejected.reason` to `Toast.show()` (FR-031) |
| `src/public/css/index.css` | Game-screen layout: full-width container, fixed status bar, table grid, card sprites (face-up vs back), button rows, RoundReady screen. Responsive media queries; reuse existing green palette + `--touch-min` |

## Backend integration

```js
// src/controllers/GameController.js — auto-start trigger
_admitPlayerToGame(game, player, nickname) {
  // ... existing logic ...
  if (game.players.size === game.requiredPlayers) {
    this._store.startRound(game.id);
  }
}

// src/services/ThousandStore.js — new method
startRound(gameId) {
  const game = this.games.get(gameId);
  if (!game || game.status !== 'waiting' || game.players.size !== game.requiredPlayers) return;
  game.status = 'in-progress';
  if (game.waitingRoomTimer) { clearTimeout(game.waitingRoomTimer); game.waitingRoomTimer = null; }
  game.round = new Round({ game, store: this });
  game.round.start();
  for (const pid of game.players) {
    this.sendToPlayer(pid, game.round.getRoundStartedPayloadFor(pid));
  }
  this.broadcastLobbyUpdate();   // game leaves the public lobby
}

// src/services/ConnectionManager.js — new message branches
if (msg.type === 'bid')         return this._roundActions.handleBid(playerId, msg.amount);
if (msg.type === 'pass')        return this._roundActions.handlePass(playerId);
if (msg.type === 'sell_select') return this._roundActions.handleSellSelect(playerId, msg.cardIds);
if (msg.type === 'sell_cancel') return this._roundActions.handleSellCancel(playerId);
if (msg.type === 'sell_bid')    return this._roundActions.handleSellBid(playerId, msg.amount);
if (msg.type === 'sell_pass')   return this._roundActions.handleSellPass(playerId);
if (msg.type === 'start_game')  return this._roundActions.handleStartGame(playerId);

// src/controllers/RoundActionHandler.js — per-action skeleton
handleBid(playerId, amount) {
  if (!this._rateLimiter.isAllowed(playerId)) return;   // silent drop (FR-030)
  const game = this._gameOf(playerId);
  if (!game?.round) return this._reject(playerId, 'Not in a round');
  const result = game.round.submitBid(this._seatOf(playerId), amount);
  if (result.rejected) return this._reject(playerId, result.reason);
  for (const pid of game.players) {
    this._store.sendToPlayer(pid, { type: 'bid_accepted', playerId, amount, gameStatus: game.round.getViewModelFor(this._seatOf(pid)) });
    this._store.sendToPlayer(pid, { type: 'phase_changed', phase: game.round.phase, gameStatus: game.round.getViewModelFor(this._seatOf(pid)) });
  }
}
```

## Frontend integration

```js
// src/public/js/core/ThousandApp.js — new validator + handler
const MESSAGE_VALIDATORS = {
  // ... existing ...
  round_started: (m) => Array.isArray(m.dealSequence) && m.seats && m.gameStatus,
  phase_changed: (m) => typeof m.phase === 'string' && m.gameStatus,
  bid_accepted: (m) => typeof m.playerId === 'string' && Number.isInteger(m.amount),
  // ... see contracts/ws-messages.md for the complete validator set ...
};

_handleMessage(msg) {
  // ... existing branches ...
  switch (msg.type) {
    case 'round_started':
      this._gameScreen.init(msg);
      this._showScreen('game');
      break;
    case 'phase_changed':
      this._gameScreen.updateStatus(msg.gameStatus);
      break;
    case 'action_rejected':
      this._toast.show(msg.reason);
      break;
    // ... other branches ...
  }
}

// src/public/js/thousand/DealAnimation.js — animation skeleton
class DealAnimation {
  constructor({ antlion, table, sequence, identities, viewerSeat }) {
    this._antlion = antlion;
    // ...
  }
  start(onComplete) {
    this._tickHandler = (dt) => this._tick(dt);
    this._antlion.onTick(this._tickHandler);
    this._onComplete = onComplete;
  }
  _tick(dt) {
    this._elapsed += dt;
    // advance current card-flight; when done, advance to next; emit onComplete when last lands
  }
}
```

## Config

No new environment variables. The existing `GRACE_PERIOD_MS` (feature 003, default 30 s) governs disconnect tolerance during a round. The 250 ms per-player throttle is hardcoded per FR-030.

## Running tests

```bash
npm test
# or filter to round tests only:
node --test tests/Round.deal.test.js tests/Round.bidding.test.js tests/Round.selling.test.js \
            tests/Round.gating.test.js tests/Round.disconnect.test.js tests/Round.ratelimit.test.js \
            tests/round-messages.test.js
# or frontend only:
node --test tests/HandView.test.js tests/GameScreen.gating.test.js tests/BidControls.test.js \
            tests/SellSelectionControls.test.js tests/StatusBar.test.js
```

## Manual verification (3 browser tabs)

1. `npm start`
2. Open three browser tabs at `http://localhost:3000/`.
3. Set three nicknames; from tab 1 host a public 3-player game; tabs 2 and 3 join.
4. **Auto-start (FR-001, SC-001)**: within 2 s of tab 3 joining, all three tabs swap from the WaitingRoom to the GameScreen.
5. **Deal animation (FR-002, FR-024)**: each tab plays the same 24-card deal, interleaved P1→P2→P3→Talon×3 then P1→P2→P3×4. Cards visibly fly from the central deck; opponents' cards are card-backs; talon cards land face-up; own cards land face-up.
6. **Hand sort (FR-005)**: at the end of dealing, the own-hand is sorted ♣→♠→♥→♦ left-to-right, ascending 9→A within each suit.
7. **Seating (FR-005)**: the opponent who acts immediately after the viewer in clockwise order is on the viewer's left.
8. **Status bar (FR-025)**: top bar shows `Dealing` → `Bidding`, the active bidder, "your turn"/"waiting for…" framing, and current high bid 100 before any accepted bid.
9. **Bidding (FR-008, FR-009, FR-010, FR-011, FR-028)**: cycle through bids and passes. Try an invalid bid (107) — get a Toast and the turn doesn't advance. Try a too-low bid — same. Resolve to one declarer.
10. **Talon absorbed (FR-012)**: declarer's hand grows to 10; talon area clears; opponents see no identities for the 3 absorbed cards (open dev tools and check `cardsById` — those ids are no longer present).
11. **Declarer decision (FR-013, FR-026)**: declarer sees Sell + Start. Opponents see "Waiting for declarer…" — no Sell/Start buttons at all.
12. **Start the Game (FR-019, FR-032)**: declarer presses Start. All 3 tabs render the RoundReady screen with a Back-to-Lobby button. Server logs show the game record deleted. Each tab returns to the lobby individually when its Back-to-Lobby button is pressed.
13. **Selling (P3 — FR-014…FR-018, FR-029)**: replay through Selling: declarer selects 3 cards (Sell-confirm enables only at 3); cards expose; opponents bid/pass; either a sale (role swap + hand-size update) or an all-pass (retry, attempt counter shown). 3 failed attempts → only Start remains.
14. **Disconnect (FR-021)**: close tab 2 mid-bid. The other tabs show "Connection lost…" next to tab 2's seat. If tab 2 is the active bidder, the turn pauses; if not, the others continue on their turn. Reopen tab 2 within `GRACE_PERIOD_MS` — the badge clears and the round resumes via `round_state_snapshot` (no animation replay).
15. **Grace expiry (FR-021)**: close tab 2 and wait `GRACE_PERIOD_MS`. Tabs 1 and 3 receive `round_aborted` and land on a RoundReady (abort variant) screen → Back to Lobby.
16. **Lobby invisibility (FR-020)**: while a 3-player game is `in-progress`, it does not appear in any 4th browser's lobby list.

## Notes for downstream specs

- The `play_phase_ready` event with `{ declarerId, finalBid }` is the handoff for the actual play phase (tricks, marriages, trump, exchange of 2 cards, scoring). That work is intentionally out of scope here.
- 4-player mode, multi-round dealer rotation, scoring, barrel rule, 1000-point victory: all deferred to future features.
- Accessibility (colorblind suit signalling, non-color selection highlight): deferred per spec Clarification 12. The card-sprite class is designed so adding a non-color signal later is a CSS change only.
