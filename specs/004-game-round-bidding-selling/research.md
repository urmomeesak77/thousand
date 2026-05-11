# Research: Round Setup, Bidding & Selling the Bid

## Decision 1: Round state — separate `Round` class vs. inlined in `ThousandStore`

**Decision**: Extract a new `Round` class in `src/services/Round.js`. `ThousandStore` keeps only a `round` reference on each `Game` record; `Round` owns the deck, hands, phase, current turn, bids, passed-players, declarer, selling-attempt history, and disconnect-pause flag.

**Rationale**:
- Constitution §VIII (one class per file) + §X (logical cohesion). A round is a single concept with its own lifecycle; putting it inside `ThousandStore` would conflate identity/lobby concerns with in-round state.
- `Round` is testable in isolation — no WS, no store. Backend tests can construct a `Round`, drive it through action methods, and assert outcomes purely against return values.
- Round state is per-game; centralising it on the `Game` record (`game.round`) avoids parallel maps inside `ThousandStore`.

**Alternatives considered**:
- Inline everything in `ThousandStore`: violates §IX (current store already at ~240 lines after feature 003), and couples lobby logic to round logic.
- A `RoundManager` service that holds `Map<gameId, RoundState>` parallel to the store: extra indirection; no benefit over attaching `round` to `game`.

---

## Decision 2: Server-authoritative single canonical deal sequence vs. per-client shuffle

**Decision**: The server shuffles once and computes the full 24-step deal sequence. The sequence is broadcast in a single `round_started` message; each client animates the same sequence locally. Per-viewer filtering removes opponent-card identities before sending.

**Rationale**:
- FR-002 requires all clients to see the same deal order. A server-authoritative shuffle is the only way to guarantee this without a clock-sync protocol.
- The spec is uncompromising on minimum-knowledge (FR-022): opponent identities never leave the server. A per-client shuffle would either require sharing the seed (which leaks everyone's cards) or per-client identities (which diverges the visible order).
- One message is simpler than 24, has less latency, and trivially keeps clients aligned. Confirmed with user.

**Alternatives considered**:
- Server streams `deal_step` messages, one per card, paced server-side. More chatty; more drift risk if a message is dropped; the visual cadence becomes coupled to network jitter instead of local rAF smoothness.
- Client-side shuffle with shared seed: leaks identities (a client can replay the shuffle and learn opponent cards) — incompatible with FR-022.

---

## Decision 3: Card identity — numeric IDs = deal-step indices

**Decision**: Each of the 24 cards is given a numeric `id` equal to its index in the canonical deal sequence (0–23). The server's `deck[i] = { id: i, rank, suit, location, ownerSeat? }`. All `id` references in messages and client state use this integer.

**Rationale**:
- Stable across the entire round — server and all clients refer to the same card by the same integer regardless of where it currently sits.
- Small payload (4 bytes vs. a UUID's 36 chars).
- Natural sort key for the deal animation (step `i` plays at time `i * dealStepInterval`).
- Per-viewer filtering is trivial: include `{ rank, suit }` alongside `id` only when the viewer is authorised to know the identity.

**Alternatives considered**:
- UUIDs per card: opaque, wastes bandwidth, no benefit over integers for an in-round-only scope.
- `rank` + `suit` as composite key: ambiguous (no duplicates in the round, but card identity *is* the secret), and prevents the elegant id-only payload for opponent moves.

---

## Decision 4: Per-player throttle — reuse existing `RateLimiter` keyed by `playerId`

**Decision**: `RoundActionHandler` instantiates `new RateLimiter(250, 1)` (250 ms window, max 1) and calls `isAllowed(playerId)` before processing any state-changing action. Blocked messages are silently dropped — no broadcast, no `action_rejected` toast.

**Rationale**:
- FR-030 specifies "silently dropped, no acknowledgement". The existing `RateLimiter.isAllowed(key)` already returns boolean; on `false`, the handler returns early. Zero new code needed for the throttle itself.
- One throttle instance suffices because keys are namespaced by `playerId` (UUID) — collision impossible.
- Reusing the existing limiter keeps Constitution §III ("least code") satisfied.

**Alternatives considered**:
- A new dedicated `PerPlayerThrottle` class: duplicates `RateLimiter` functionality.
- Throttle at the WS message-rate layer (per-socket, already 30 msgs/10 s in `ConnectionManager`): wrong granularity — that limit allows 30 in 10 s, which is far above 1 per 250 ms; we want a tight per-action gate.

---

## Decision 5: Status-bar view-model — pushed by the server vs. derived on the client

**Decision**: The server is the sole producer of the `gameStatus` view-model (FR-025 fields). Every `Round` action method returns `{ broadcast: { gameStatus, ... } }`; `RoundActionHandler` emits one `phase_changed { gameStatus }` per action to all 3 clients. The client renders the bar straight off the view-model — no derivation.

**Rationale**:
- FR-025 requires all 3 clients to display identical status modulo the "Your turn" framing. Centralised production removes the possibility of clients diverging due to bugs.
- Per-viewer framing (`viewerIsActive`) is computed by the server based on the recipient's seat. The single shared view-model just gets a different `viewerIsActive` flag per recipient.
- Performance is fine: the view-model is ~8 small fields, broadcast on each action — well under any concern.

**Alternatives considered**:
- Client derives the view-model from raw event log: duplicates state machine logic on the client, increases bug surface.
- Server pushes deltas: premature optimisation; the full view-model is already tiny.

---

## Decision 6: Reconnect rehydration — snapshot vs. event replay

**Decision**: On reconnect, the server sends a single `round_state_snapshot` message containing the viewer's currently-visible card identities + the full view-model + per-seat hand sizes + flags for any in-flight Selling exposed cards. The client renders the layout immediately with no animation. Movements *after* reconnect animate normally.

**Rationale**:
- FR-027 mandates "snapshot, not replay". A replay would either leak past identities of cards the viewer has since lost visibility on (violating FR-023), or require a complex per-viewer filtered event log.
- A snapshot is O(1) in network size (~1 round payload), versus O(actions-missed) for replay.
- The existing feature-003 reconnect flow already does a one-shot rehydration; this extends it for `in-progress` games.

**Alternatives considered**:
- Replay missed events: see above — FR-023 violation.
- Force-disconnect on missed actions: harsh UX; spec specifically says to seamlessly rehydrate.

---

## Decision 7: Deal animation — per-frame `Antlion.onTick` vs. CSS transitions

**Decision**: Use `Antlion.onTick` to animate card flights frame-by-frame. Each `CardSprite` exposes `setPosition(x, y, durationMs)`; while a flight is in progress, the sprite updates its CSS `transform: translate(...)` on each tick using a normalized progress (`elapsed / duration`) and a small easing curve. The `DealAnimation` orchestrator schedules the next flight when the previous one completes.

**Rationale**:
- Constitution §XI requires all frontend timing through Antlion. `Antlion.onTick` is the canonical hook for per-frame work and replaces `requestAnimationFrame`.
- A pure-CSS-transitions approach would require either `setTimeout` between transitions (forbidden by §XI) or chained `transitionend` listeners attached via `addEventListener` (also forbidden by §XI without `Antlion.bindInput`).
- Frame-driven animation is also easier to interrupt cleanly on disconnect/abort: cancel the tick loop and you're done.
- Performance is sufficient: 1 active sprite at a time during the deal (others are stationary); modern browsers handle this trivially.

**Alternatives considered**:
- CSS keyframes/transitions: cleaner declaratively but conflicts with §XI for the scheduling layer.
- Web Animations API: same scheduling-layer problem.
- A single all-in-one tween library: violates §III (no new deps).

---

## Decision 8: Game-record cleanup timing — on `play_phase_ready` / `round_aborted`

**Decision**: The server deletes the game record from `ThousandStore` synchronously, in the same operation that emits `play_phase_ready` or `round_aborted`. The post-round "Round ready to play — next phase coming soon" screen is then purely client-side; the **Back to Lobby** button is local navigation (no server round-trip). A `hello` arriving from any of the 3 players after this point returns `{ restored: true, gameId: null }` and the client transitions straight to the lobby.

**Rationale**:
- FR-032 specifies "immediately upon emitting". Keeping the record around longer would (a) needlessly hold memory, (b) re-introduce the question of who can still rejoin, and (c) make the per-player Back-to-Lobby semantics ambiguous (does pressing it before the others trigger a "you left an active game" warning? — no, the game is over).
- The post-round screen needs no server interaction — it's a static message + a local navigation button. Pure client-side state.
- Edge case (R-005): a reconnect arriving after cleanup must not crash. The existing `createOrRestorePlayer` already returns `gameId: null` when the player's prior `gameId` no longer exists in the store — the round-end cleanup *also* clears the player's `gameId`, so reconnect routes to the lobby cleanly.

**Alternatives considered**:
- Keep the record until all 3 players press Back-to-Lobby: introduces a per-player ack protocol and complicates abort/disconnect.
- Delete after a TTL: arbitrary and racy with reconnect.
