# Phase 0 Research: Bot Card Memory

All Technical Context unknowns resolved below. No outstanding NEEDS CLARIFICATION.

## 1. How a "Fourier transform formula" models memory decay

**Decision**: Model each bot's recall as the **impulse response of a first-order
low-pass filter specified in the frequency domain**, evaluated by a small discrete
inverse transform. Recall strength of a card of age `a` (in tricks since it was played)
is `h[a]`, the filter's impulse response; older cards (higher `a`) get smaller `h[a]`.
The filter's **cutoff frequency is set by the bot's `memorySkill`**: higher skill ⇒
higher cutoff ⇒ slower decay ⇒ longer memory.

**Rationale**: Forgetting is fundamentally a *low-pass* phenomenon — the mind keeps the
slow-moving, recent gist and drops high-frequency detail. The frequency response of a
first-order low-pass filter is the Lorentzian

```
H(ω) = 1 / (1 + (ω / ω_c)^2)        ω_c = cutoff, increases with memorySkill
```

and its inverse transform back to the "age" domain is a decaying envelope — i.e. the
recall curve. This is the honest bridge flagged to the user during `/speckit-specify`:
**a Fourier-defined low-pass filter and an exponential forgetting curve are the same
model viewed in two domains** (the time-domain impulse response of this filter is a
decay `≈ e^(-a/τ)` with `τ ∝ memorySkill`). Implementing it via the transform satisfies
the explicit user requirement (FR-004) while remaining a principled memory model, not an
arbitrary one.

**Implementation shape** (deferred specifics to tasks):
- Precompute a kernel `h[0..A_max]` once per decision (A_max = 7, the max age in an
  8-trick round) by summing the frequency-domain response over a small set of discrete
  frequencies and inverse-transforming — a ~10-line pure function, no library.
- Normalize so `h[0] = 1` (a card just played is always recalled; see §3).

**Alternatives considered**:
- *Literal numeric FFT of the play-event pulse train each turn.* Rejected: an FFT of a
  unit-impulse train yields a single shared envelope, not a per-card age response, and is
  heavier for no behavioural gain. The chosen approach is the meaningful, lighter form.
- *Plain `e^(-age/τ)` exponential, no transform.* Rejected as the primary model: it does
  not satisfy the user's explicit "use fourier transform formula" requirement. Retained
  only as the documented mathematical equivalent for reasoning/validation.

## 2. Where the "cards already gone" timeline comes from

**Decision**: Add `playedLog: Array<{ cardId, trickNumber }>` to `TrickPlay`, appended
at the single point a card leaves a hand (`playCard` and `commitCrawlCard`). Mirror it
onto `Round` alongside the existing `currentTrick`/`collectedTricks` synchronisation.

**Rationale**: `collectedTricks[seat]` already holds every gone card, but bucketed by
*winning seat*, so it loses each card's **trick of play** — and age (tricks since play)
is exactly what the decay needs. A dedicated append-only log preserves age exactly with
one line at each existing hand-removal site. It follows `TrickPlay`'s established pattern
and `Round`'s established mirror-after-action pattern, so it is minimal and idiomatic.

**Alternatives considered**:
- *Reconstruct age from `collectedTricks` counts.* Rejected: per-card trick index is not
  recoverable once cards are bucketed by winner.
- *Track the log inside `BotMemory`.* Rejected: the log is shared ground truth for every
  bot at the table; duplicating per bot is wasteful and risks drift. The bot-specific
  part (which gone cards are *recalled*) is what `BotMemory` computes.

## 3. Determinism, per-round scoping, and monotonic forgetting

**Decision**: Recall is **recomputed from the current round's `playedLog` at each
decision**, never stored incrementally. A past-trick card is recalled iff a deterministic
per-card draw `d ∈ [0,1)` satisfies `d < h[age]`, where
`d = hash(memorySeed, roundKey, cardId)`.

This single choice resolves three requirements at once:
- **Per-round scope (FR-002)**: recall reads only the current round's log, so memory is
  empty at round start and never leaks across rounds — no explicit reset code.
- **Determinism (FR-008)**: same bot + same log + same age ⇒ same draw ⇒ same result,
  reproducible for tests; `memorySeed` is the seed.
- **Monotonic, non-flickering forgetting (FR-006/FR-007)**: `h[age]` strictly decreases
  with age while `d` is fixed per card, so once a card drops below its threshold it stays
  forgotten — it never "comes back". Age 0 (`h[0]=1`) means a card on the current table
  is always recalled, since it is literally visible.

`roundKey` (e.g. round number or dealer seat) is folded into the hash so different rounds
forget different cards while each round stays reproducible.

**Rationale**: A pure recompute matches the existing stateless `BotStrategy.decide` and
avoids mutable RNG/memory state that would complicate per-round reset and testing.

**Alternatives considered**:
- *Mutable per-bot memory accumulated as cards are played, with a live RNG.* Rejected:
  needs explicit per-round reset, is harder to test deterministically, and risks order
  effects from interleaved human/bot actions.

## 4. How memory changes a bot's decisions (integration)

**Decision**: `BotStrategy.decide` gains a fourth argument
`knowledge = { goneCardIds: Set<cardId> }` (default empty). A new pure helper
`isBossCard(card, { goneCardIds, hand, currentTrick }, trump)` returns true when **every
card that could still beat `card` is accounted for** — already gone (recalled), in the
bot's own hand, or on the table. Lead/follow prefer the highest-point identifiable boss
card before falling back to today's logic.

**Rationale**: This is the smallest change that makes memory *observable*: with full
recall the bot cashes guaranteed winners; with a key card forgotten it cannot prove the
card is a boss and falls back — a visible "memory mistake" (SC-004). Defaulting
`knowledge` to empty keeps every existing feature-009 test green (identical behaviour
when no memory is supplied).

**Alternatives considered**:
- *Rewrite opponent strategy around full card-counting (ducking, signalling, suit
  exhaustion inference).* Rejected for v1: large surface, hard to bound, and not required
  to satisfy the spec. Boss-card cashing is a focused, high-signal first use of memory.

## 5. Per-bot memory skill assignment

**Decision**: `PlayerRegistry.createBot` draws `memorySkill = Math.random()` and a stable
`memorySeed` (via `crypto.randomInt`) once per bot, independent of `aggressiveness`
(FR-009/FR-010). Higher `memorySkill` raises the filter cutoff ⇒ stronger, longer recall
(FR-011).

**Rationale**: Mirrors the existing `aggressiveness` trait exactly (drawn once, persists),
so bots at one table differ in memory as the spec requires, with no new config surface.

## 6. Performance

**Decision**: Recompute per decision; no caching needed. `playedLog ≤ 32` entries and the
kernel ≤ 8 taps, so a decision's recall cost is on the order of microseconds — far under
the 50 ms budget (SC-006) and invisible beside the existing 1–3 s bot turn delay.
