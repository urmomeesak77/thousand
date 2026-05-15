# Research: Play Phase, Scoring, Multi-Round & Victory

Phase 0 output for feature 005. Resolves design decisions raised by the spec (no `NEEDS CLARIFICATION` markers remain in the technical context). Each decision lists the chosen approach, the rationale tied to the spec / constitution, and the alternatives rejected.

---

## Decision 1: A new persistent **Game** entity, separate from `Round`

**Decision**: Introduce a new `Game` (a.k.a. game-session) entity that survives the round boundary. `Round` continues to be reconstructed at the start of each round and is replaced wholesale on round-end. The `Game` owns everything that persists across rounds: cumulative scores, dealer rotation seat, current round number, per-player barrel state, per-player consecutive-zeros counter, round-history log, `gameStatus` enum (`in-progress | game-over | aborted`). The existing in-memory `game` record on `ThousandStore` (the lobby-side container) is extended with a `gameSession` field (or its existing fields are extended — see Decision 2).

**Rationale**:
- Constitution §VIII / §X: cross-round state is a single concept and belongs on a dedicated object. Round state and game state have different lifecycles (Round is reset each round; Game persists), so conflating them would force every Round field to be either reset-on-round-start or carefully-preserved.
- Feature 004's `Round` already exceeds the §IX size guideline despite three extractions. Layering trick play + scoring + barrel logic into the same class would push it far past any reasonable limit.
- A new entity is the natural place for the round-history log (FR-017) and the multi-round-aware cleanup rule (FR-029, which supersedes feature 004's FR-032).

**Alternatives considered**:
- Extend `Round` to carry "previous-round" fields. Rejected — the `Round` resets at deal time; preserving fields across resets is exactly the bug pattern that motivates a separate class.
- Put cross-round state directly on the existing `game` record (`game.cumulativeScores`, etc.) without a new class. Considered but rejected because the lobby-side `game` record is already heterogeneous (lobby fields + round) and a single concept ("a game session in progress") deserves its own object. The lobby `game` retains its identity/lobby fields and references a `Game` session instance once play begins (see Decision 2 for the exact attachment shape).

---

## Decision 2: Where the `Game` instance attaches

**Decision**: The lobby-side `game` record in `ThousandStore.games` gets a new `session` field that holds the `Game` instance (created at the moment the round-1 deal starts, i.e., the existing `store.startRound(gameId)` callsite). The lobby record keeps its existing fields (`id`, `type`, `hostId`, `players`, `requiredPlayers`, `inviteCode`, `createdAt`, `status`, `round`) unchanged. `session` is `null` until round-1 starts and is set to a new `Game` instance for the life of the game; it is nulled when the game record is purged per FR-029.

**Rationale**:
- Keeps the lobby-side record minimal — lobby code never reads game-session internals.
- A clean separation: `game.round` is per-round; `game.session` is per-game. Both are owned by the lobby record; the lobby record is the single thing keyed by `gameId`.
- `store.startRound()` already exists as the auto-start callsite; it becomes the natural place to instantiate `Game` once, and to instantiate `Round` once per round.

**Alternatives considered**:
- Make `Round` a member of `Game` and have `ThousandStore.games[gameId].session` be the only entry point. Cleaner in theory but breaks the existing `game.round` field and forces a 1-cycle migration through feature-004 code paths. Rejected for incremental-delivery reasons (P1 of 005 still needs a single round to work).

---

## Decision 3: Decompose `Round.js` — extract `TrickPlay.js` and `Scoring.js`

**Decision**: Two new files split off from `Round` to keep each file within the §IX size guideline:

- **`src/services/TrickPlay.js`** — the trick-play state machine (8 tricks, leader, current trick cards, trump suit, declared marriages, collected-trick lists per seat). Owns the `playCard`, `declareMarriage`, and `resolveTrick` action methods.
- **`src/services/Scoring.js`** — pure functions for `cardPoints(cards)`, `roundScores(round, marriages)`, `roundDeltas(roundScores, declarerSeat, bid, penalties)`, `applyDeltas(game, deltas)`. No state — all input/output.

`Round` keeps deal + bidding + selling + the **card-exchange** action method (FR-002 / FR-003 — small enough to live alongside the existing absorbtalon logic in `RoundPhases.js`). At round-end, `Round` calls `Scoring.roundScores(...)` then `Scoring.roundDeltas(...)`, hands the deltas to `Game.applyRoundEnd(...)`, and is then replaced.

**Rationale**:
- The trick-play state machine is the single largest new piece of behaviour in this feature; it has its own ~5 invariants (follow-suit, trump, winner determination, lead rotation, collected-stack growth) and merits its own file under §VIII.
- Scoring is pure logic with no state — it fits §VII's "use functions only for pure utilities" carve-out and §X's logical cohesion (scoring is feature-specific, lives in the feature module, not a generic `utils/`).
- Card-exchange is small (≤ 30 lines): one `submitExchangePass(seat, cardId, destSeat)` method on `Round` plus a phase-transition helper on `RoundPhases`.

**Alternatives considered**:
- Inline trick play into `Round.js`. Rejected — projected file size ~500+ lines; violates §IX badly.
- Extract a single `PlayPhase.js` covering trick play + scoring + marriages. Considered, but scoring is naturally functional and benefits from being a stand-alone module that tests can call without instantiating any state.

---

## Decision 4: Trick-winner rank ordering — explicit table, no `Math.max`

**Decision**: A constant table `RANK_ORDER = { '9': 0, 'J': 1, 'Q': 2, 'K': 3, '10': 4, 'A': 5 }` lives in `src/services/Scoring.js` (or `src/services/cardRanks.js` if reused). Trick winner determination is: find the highest `RANK_ORDER` value among cards of the leading suit OR (if trump declared and any trump in trick) the highest `RANK_ORDER` value among trump cards.

**Rationale**:
- FR-008 spells out that the Ten outranks the King and Queen — a non-obvious rule that pure numeric rank ordering would get wrong.
- A literal table is the smallest correct implementation; one line of source per rank; trivially testable.
- Reused for hand-sort ordering on the client (`HandView` already has its own constant; the new card-points table can share if convenient).

**Alternatives considered**:
- Treat ranks as numeric pip values and special-case the 10. Rejected — error-prone; multiple code paths to keep in sync.

---

## Decision 5: Marriage declaration — single combined message, not two-step

**Decision**: The marriage-declaration prompt is purely client-side (a tap on K/Q opens it; Cancel dismisses it; the server is not notified). The two paths that produce a server action are:

- **Play without declaring** → client sends `play_card { cardId }` (same shape as a non-marriage play).
- **Declare and play** → client sends `play_card { cardId, declareMarriage: true }` (one combined message).

The server, on receiving `play_card`, treats `declareMarriage` as a flag: if `true`, it (a) re-validates the marriage conditions (FR-010 a / b: player holds both K and Q of the played-card's suit at submission time; trick number in [2, 6]; player is leading), (b) on success adds the bonus to the player's round score, sets trump to that suit, and broadcasts `marriage_declared`; (c) plays the card to the trick normally. On failure of either (a) or (b), the entire action is rejected with `action_rejected` and the card is not played.

**Rationale**:
- Cancel is a purely-UI back-out (FR-009: "no card played and no state change on the server") — the server never knows the prompt was opened. This avoids any need for a "marriage declined" message.
- One combined `play_card` keeps the protocol minimal (FR-001 / §III "least code"). Adding a separate `declare_marriage` action would force the server to track "pending marriage declarations" between the declaration and the card play — pointless complexity given the card always plays alongside the declaration on the same turn.
- Server-side re-validation is required regardless (FR-010 (a) / (b)) — the combined message gives a single rejection path.

**Alternatives considered**:
- Two-message protocol: `declare_marriage` followed by `play_card`. Rejected — needs intermediate state, doubles the rejection paths, doubles the throttle window.

---

## Decision 6: Trump replacement is effective on the **current** trick, not the next

**Decision**: When a player confirms a marriage on tricks 2–6, the new trump suit takes effect **on the current trick** (the one they are leading), not on the following trick. Subsequent players in the same trick are bound by the new trump suit for their follow-suit / trump-priority obligations (FR-007).

**Rationale**:
- FR-010 (d): "set the trump suit to the declared suit, replacing any previous trump, from this trick onward (inclusive)." The acceptance scenario (US2 AS-2) and FR-012 ("most recently declared trump is the one in effect for the current and subsequent tricks") both pin this.
- This is the rulebook reading — a marriage declaration with a K or Q card is itself a trump card for trick-resolution purposes, so the led suit *is* the new trump and any subsequent trump play follows trump-priority resolution per FR-008.

**Alternatives considered**:
- Apply trump only from the next trick. Rejected — contradicts FR-010 (d) / US2 AS-2 explicitly.

---

## Decision 7: Continue-to-next-round = sticky press tracked on `Game`

**Decision**: The `Game` instance carries a `continuePresses: Set<seatIdx>` field. When a player presses Continue, the server adds their seat to the set. The set is **never cleared by a disconnect** (per FR-025: "sticky press across disconnects"). When the set's size reaches 3, the server (a) clears the set, (b) instantiates a new `Round` with the rotated dealer seat, (c) broadcasts `next_round_started`. If a player who has already pressed Continue is mid-grace at the moment the third press lands, the new round begins immediately and the disconnected player will rehydrate on reconnect via `round_state_snapshot` (Decision 8). If their grace expires before the third press, `game_aborted` fires regardless of the recorded Continue (FR-025 final clause).

**Rationale**:
- Mirrors the FR-025 explicit semantics. Sticky press needs persistent state, hence on `Game` (not `Round`, which gets replaced).
- One bit per player in a 3-bit set is the smallest representation. Reuse the existing per-player rate limiter to gate Continue presses too (one press per 250 ms per FR-027).

**Alternatives considered**:
- Reset the set on disconnect. Rejected — directly contradicts the clarified semantics.
- Track per-player Boolean fields rather than a Set. Identical semantically; Set is just terser.

---

## Decision 8: Cleanup rule supersedes feature 004's FR-032

**Decision**: The feature-004 rule "purge game record on `play_phase_ready` / `round_aborted`" no longer applies — it was only correct when a round was the entire game. The new cleanup rule (FR-029) is:

- Purge the lobby-side `game` record and clear each player's `gameId` **only** at one of three terminal broadcasts: `final_results` (FR-017), `round_aborted` (mid-round grace expiry), `game_aborted` (between-rounds grace expiry).
- The previous `play_phase_ready` broadcast is **no longer emitted** — the play phase happens inline (FR-001). The feature-004 RoundReady "next phase coming soon" screen is no longer reached during normal play; it only continues to exist on the `round_aborted` / `game_aborted` paths (as the Game-aborted variant).
- Between rounds the lobby-side `game` record stays alive; only `game.round` is replaced.

**Rationale**:
- The lifetime of an in-memory game spans every round until victory or abort. Cleaning up between rounds would discard cumulative scores and barrel state mid-game.
- The reconnect routing R-005 risk from feature 004 carries over: a player who disconnects mid-round whose grace expires must still hit the lobby cleanly when they reconnect after cleanup — the existing `createOrRestorePlayer` path already returns `gameId: null` for cleaned-up records (because we null `player.gameId` at cleanup).

**Alternatives considered**:
- Keep purging on `play_phase_ready` and skip it (synthesize a different event). Rejected — needlessly creates two code paths for the same logical transition.

---

## Decision 9: Round-history log retention is in-memory on `Game`

**Decision**: `Game.history` is an array of round-history entries. After each round's FR-013/FR-014 compute, the server appends one entry to `Game.history` with:

```js
{
  roundNumber: 1..N,
  declarerSeat: 0..2,
  declarerNickname: string,
  bid: 100..300,
  perPlayer: {
    [seatIdx]: { trickPoints: int, marriageBonus: int, delta: int, cumulativeAfter: int, penalties: ['barrel-3rd' | 'three-zeros' | ...] }
  }
}
```

`Game.history` is broadcast as part of the `final_results` message (FR-017). It is **not** broadcast on round-end (the round summary is built from the most-recent entry plus pre-round cumulative scores).

**Rationale**:
- FR-017 final-results includes a per-round history table; the data has to come from somewhere; an in-memory append-only log on `Game` is the simplest representation.
- The log is purged with the game record (FR-029 ⇒ no cross-game retention).
- One entry per round, ~6 fields per player, 3 players → roughly 30 small integers per round. A 10-round game is ~300 small integers; trivial memory.

**Alternatives considered**:
- Persist round history to disk. Rejected — out of scope ("In-memory persistence" in spec Assumptions).
- Reconstruct history at game-end by replaying. Rejected — there is no event log to replay; this is precisely the situation `Game.history` exists to avoid.

---

## Decision 10: Animation cadence for trick play, card exchange, and collected-stack

**Decision**: Reuse the feature-004 pattern — `Antlion.onTick` for per-frame interpolation, `CardSprite.setPosition(x, y, durationMs)` for managed flights, `Antlion.schedule` for any inter-step delay (e.g., the 250–400 ms pause after a trick resolves before clearing the centre). Specific cadences:

- **Card exchange (FR-004)**: each pass animates 250 ms hand → recipient slot (face-up to declarer, card-back to the third opponent, flip-to-face-up at the recipient).
- **Trick play card flight (FR-030)**: 250 ms from hand slot to centre slot. Card flips face-up on departure (already face-up to its owner; face-down → face-up for the other two).
- **Trick resolve (FR-008 / FR-019)**: 600 ms total — a 350 ms pause to allow all three players to see the resolved trick, then a 250 ms flight of the three cards into the winner's collected-stack slot. Cards animate face-up during the flight; flip to face-down at the destination.
- **Collected-stack badge (FR-008)**: rendered on every client; updates instantly when the flight lands. No animation on the badge itself.

State-changing client→server messages are blocked until the corresponding animation completes (per FR-030 final sentence; same as feature 004 FR-024).

**Rationale**:
- §XI mandates Antlion for all timing — `Antlion.onTick` + `Antlion.schedule` cover everything here.
- Reuse of `CardSprite` and the existing `DealAnimation` orchestration pattern keeps new code small.

**Alternatives considered**:
- Use CSS transitions for the simpler flights. Rejected — same §XI scheduling-layer concern that drove feature 004 Decision 7.

---

## Decision 11: Tiebreak resolution code path

**Decision**: At game-end (any player ≥ 1000), the winner-determination function lives in `Scoring.js` as `determineWinner(game)`:

1. Collect every seat whose cumulative score is `max(allScores)`.
2. If `length === 1`: that seat wins.
3. Else if `game.round.declarerSeat` is among the tied seats: declarer wins.
4. Else: return the seat with the lowest seat-order index among the tied seats (P1 = dealer+1 wins over P2 = dealer+2 wins over Dealer).

**Rationale**:
- Matches the FR-017 clarification verbatim: declarer wins any top-tier tie; fallback to seat order.
- Encapsulated in a pure function so it's trivially testable against the rulebook's GAME OVER SCENARIOS examples.

**Alternatives considered**:
- Inline the tiebreak in the broadcast handler. Rejected — multiple code paths for the same rule.

---

## Decision 12: Barrel and consecutive-zero counters live on `Game`

**Decision**: Per-player barrel state and consecutive-zero counters live as properties of `Game`:

```js
game.barrelState = {
  [seatIdx]: { onBarrel: boolean, barrelRoundsUsed: 0 | 1 | 2 }
};
game.consecutiveZeros = { [seatIdx]: 0 | 1 | 2 };
```

Both are mutated by `Game.applyRoundEnd(...)` after deltas land. Bid validation (`Round.submitBid` / `Round.submitSellBid`) reads `game.barrelState[seat].onBarrel` and applies the 120-bid-floor (FR-022) when `true`.

**Rationale**:
- They persist across rounds (must survive round reset). `Game` is the right home.
- Reading them is O(1); no need for a separate service.
- The bid-floor application is a one-line addition to the existing bid validator on `Round`; no new module.

**Alternatives considered**:
- A dedicated `BarrelTracker` service. Rejected for §III ("least code") — the state is two small dicts; no behaviour worth encapsulating beyond `applyRoundEnd`.

---

## Decision 13: Trick-by-trick state on the `Round` snapshot — minimum-knowledge filter

**Decision**: `Round.getSnapshotFor(viewerSeat)` (already in `RoundSnapshot.js`) gains new conditional fields filtered per FR-019:

- During card-exchange: `passedCardCount: 0 | 1 | 2`. To the receiver of an already-passed card, identity is included in their own hand. To the third opponent, the card is absent from any visible scope.
- During trick play: `currentTrick: { cards: [{ seat, cardId, rank, suit }, ...] }` — identities for cards currently face-up in the centre, NEVER for already-collected cards. `currentTrumpSuit: '♥' | '♦' | '♣' | '♠' | null`. `trickNumber: 1..8`. `collectedTrickCounts: { [seatIdx]: 0..8 }` (counts only; never identities).
- During round-summary: each viewer's own `collectedCards: [{ rank, suit }, ...]` (their own cards from won tricks; opponents' collected cards are NOT included). `summary: RoundSummary` (the view-model — see data-model).
- During final-results: `finalResults: FinalResults` (view-model — see data-model).

**Rationale**:
- FR-019 explicitly enumerates which identities a viewer can see in each phase. The visibility table in `data-model.md` is the canonical reference; `getSnapshotFor` is the single function that consults it (per feature 004 R-004 mitigation pattern).

**Alternatives considered**:
- Broadcast a full server-side state and rely on the client to filter. Rejected — leaks identities; violates FR-019.

---

## Open questions (none blocking)

No `NEEDS CLARIFICATION` items remain. All seven spec Clarifications (2026-05-15) have been resolved into the spec body; this research consolidates them into implementation choices.
