# Contract: Bot Action → RoundActionHandler Mapping

`BotTurnDriver` executes a `BotStrategy` decision by calling the **existing**
`RoundActionHandler` method with the bot's `playerId` — the same method
`ConnectionManager.ACTION_DISPATCH` invokes for a human's WebSocket message. No new
handler methods are added.

| Decision `kind` | RoundActionHandler call | Notes |
|-----------------|-------------------------|-------|
| `bid` | `handleBid(botId, amount)` | `amount` = `estimateMakeable` safe floor + aggressiveness-scaled talon gamble (≤ `MAX_TALON_GAMBLE`), rounded to BID_STEP, clamped to floor/MAX_BID (FR-016/FR-017) |
| `pass` | `handlePass(botId)` | bidding pass |
| `startGame` | `handleStartGame(botId)` | declarer post-bid decision (v1: always start, never sell) |
| `sellPass` | `handleSellPass(botId)` | only if a human declarer opened a sale |
| `exchangePass` | `handleExchangePass(botId, cardId, toSeat)` | one card per fire; `toSeat` = next opponent not yet passed to |
| `playCard` | `handlePlayCard(botId, cardId, declareMarriage)` | `cardId` ∈ `legalCardIds`; `declareMarriage` true when a still-declarable K/Q lead is chosen |
| `acknowledgeFourNines` | `handleAcknowledgeFourNines(botId)` | clears the bot's slot in the ack-gate |
| `continueToNextRound` | `handleContinueToNextRound(botId)` | round-summary advance |
| `null` | (no call) | bot has no current obligation; wait for next state change |

## Invariants enforced by reuse (not re-implemented)

- **Legality (FR-007)**: every method runs `_runRoundAction`'s turn/seat/phase checks and the
  round's own legality checks; an illegal decision would be `action_rejected` (a bug surfaced in
  tests, never illegal play reaching other players).
- **Broadcast/scoring (FR-010)**: the handler's per-recipient broadcast and round-end scoring
  run unchanged, so bot results are computed and propagated identically to humans.
- **Rate limit**: handler's 250 ms/player limiter is well under the 1–3 s bot delay.

## Driver guarantees

- **One action per timer fire**, then re-read state on the next state-change hook.
- **Re-read on fire**: the decision is computed from current authoritative state at fire time,
  not from state captured when the timer was scheduled (robust to interleaved human actions).
- **Delay**: each fire is scheduled at `1000 + random*2000` ms (≈1–3 s) per FR-009.
- **Self-rejection safety**: if a bot's action is rejected (state changed underneath it), the
  driver logs and re-evaluates on the next hook rather than retrying in a tight loop.
