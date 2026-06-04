# Implementation Plan: Bot Card Memory

**Branch**: `009-ai-opponents` (no new branch) | **Date**: 2026-06-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/010-bot-card-memory/spec.md`

## Summary

Give each server-side bot an **imperfect, decaying memory** of the cards that have
already been played, and let that memory inform its play. Today `BotStrategy.decide`
is stateless and ignores trick history entirely — it reasons only from its own hand
and the current trick. This feature adds:

1. A small **play log** on `TrickPlay` (mirrored onto `Round` like every other
   trick-play field): `{ cardId, trickNumber }` per card as it leaves a hand — the
   authoritative "cards already gone" timeline.
2. Two new per-bot traits set at bot creation: a **memory skill** (`memorySkill ∈ [0,1]`)
   and a stable **memory seed**, alongside the existing `aggressiveness`.
3. A new `BotMemory` class that, given the play log and the bot's traits, returns the
   set of past-trick cards the bot **currently recalls as gone**. Recall strength is the
   impulse response of a **first-order low-pass filter defined in the frequency domain**
   (the user-mandated Fourier-transform formula); a card is recalled iff a deterministic
   per-card draw falls under that strength. Older cards decay; higher skill = slower decay.
4. A modest, memory-driven upgrade to `BotStrategy`: it receives the recalled-gone set
   and uses it to identify **"boss" cards** (cards nothing left in play can beat) so a
   bot cashes guaranteed winners — but only for cards it actually recalls, so a forgetful
   bot misses them (an observable "memory mistake").

Recall is **recomputed each decision** from the current round's play log, so memory is
inherently per-round (FR-002) with no reset bookkeeping, and stateless/reproducible
(FR-008) because the per-card draw is seeded from the bot's seed + round + card.
No game rules change; only bot decision *quality* changes (FR-014).

## Technical Context

**Language/Version**: Node.js v18+ (CommonJS backend). No frontend change.
**Primary Dependencies**: None new. Pure-JS arithmetic only (the discrete transform is
~10 lines); Node built-in `crypto` for the per-bot seed.
**Storage**: In-memory only. `memorySkill`/`memorySeed` are `PlayerRegistry` entry fields;
the play log lives on the in-round `TrickPlay`/`Round` (not persisted across rounds).
**Testing**: Node.js built-in test runner (`*.test.js`); existing `tests/e2e-live-smart.js`
for live verification. New unit tests for the transform/recall math, monotonic decay,
skill ordering, determinism, and the boss-card integration.
**Target Platform**: Node server (bots are server-side).
**Project Type**: Web application (single backend + static vanilla-JS frontend) — backend-only feature.
**Performance Goals**: Recall computation ≤ 50 ms per decision (SC-006); the play log is
≤ 24/32 cards and the transform kernel ≤ ~8 taps, so this is microseconds in practice.
**Constraints**: Constitution §III (Simplicity — see note below), §VII/§VIII (classes,
one per file), §IX (small units), §XI (frontend timers — N/A, no frontend code).
**Scale/Scope**: 3- or 4-seat tables; ≤ (requiredPlayers − 1) bots per table.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| I. Stack / IV. Thin server / V. No build step | ✅ Plain Node, no new dependencies, no transpilation. |
| II. Single-file frontend / VI. Responsive | ✅ No frontend change — memory only affects server-side bot decisions. |
| III. Simplicity First | ⚠️ **Justified exception.** A plain exponential forgetting curve would be the minimum code. The Fourier-transform formula is an **explicit user requirement** (FR-004), so it is in-scope, not speculative gold-plating. We keep it minimal: a first-order low-pass response evaluated by a ~10-line discrete inverse transform, no library. See Complexity Tracking. |
| VII. Classes over functions / VIII. One class per file | ✅ New `BotMemory` class (state = skill+seed; one export per file). The transform math is module-private pure helpers inside that file, mirroring how `BotStrategy.js` keeps its pure helpers private. |
| IX. Small units | ✅ Each decider/helper ≤ ~20 lines; `BotMemory` ≤ 100 lines; boss-card logic is one small pure helper added to `botStrategyHelpers.js`. |
| X. Logical cohesion | ✅ Memory lives under `src/services/bots/`; the play log lives on `TrickPlay` where trick state already lives; per-bot traits live on the `PlayerRegistry` entry next to `aggressiveness`. |
| XI. Frontend logic via Antlion | ✅ N/A — no frontend code; bot timing is server-side (unchanged from 009). |
| Testing ≥90% coverage / §XII built-in tools | ✅ Pure math + integration is highly testable; no new CLI tools. |

**Result: PASS with one documented, user-mandated complexity exception (the Fourier
formula). No unjustified violations.**

## Project Structure

### Documentation (this feature)

```text
specs/010-bot-card-memory/
├── plan.md              # This file
├── research.md          # Phase 0 output — Fourier↔forgetting model, determinism, integration
├── data-model.md        # Phase 1 output — entities, fields, relationships
├── quickstart.md        # Phase 1 output — how to verify the feature
├── contracts/           # Phase 1 output
│   ├── bot-memory-api.md             # BotMemory class + recall/kernel function contracts
│   ├── played-log.md                 # TrickPlay/Round playedLog field contract
│   └── strategy-memory-integration.md# BotStrategy.decide signature + boss-card helper
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/services/
  bots/
    BotMemory.js            # NEW — class(memorySkill, memorySeed); recalledGoneCardIds(playedLog, currentTrickNumber, roundKey) → Set<cardId>. Holds the Fourier low-pass recall model + deterministic per-card draw as module-private pure helpers.
    botStrategyHelpers.js   # EDIT — add pure `isBossCard(card, { goneCardIds, hand, currentTrick }, trump)` (and a small `remainingBeaters` helper) used to spot guaranteed winners from recalled-gone knowledge.
    BotStrategy.js          # EDIT — decide(round, seat, aggressiveness, knowledge = { goneCardIds:new Set() }); lead/follow prefer a point-bearing boss card when one is identifiable from recalled gone cards. Empty knowledge ⇒ identical to today (009 tests stay green).
    BotTurnDriver.js        # EDIT — build the bot's recalled-gone set via BotMemory (using player.memorySkill/memorySeed) and pass it as `knowledge` into BotStrategy.decide.
  PlayerRegistry.js         # EDIT — createBot: add memorySkill = Math.random(), memorySeed = crypto.randomInt(...). (serializePlayers unchanged — traits are server-internal.)
  TrickPlay.js              # EDIT — add this.playedLog = []; push { cardId, trickNumber } in playCard and commitCrawlCard (single point: where the card leaves the hand).
  Round.js                  # EDIT — init this.playedLog = []; mirror to/from this._trickPlay alongside the existing currentTrick/collectedTricks sync (the two sync blocks at ~lines 288-296 and ~347-353).
tests/
  BotMemory.test.js              # NEW — recency monotonicity, skill ordering (FR-011), determinism/seed (FR-008), age-0 always recalled, empty log, imperfection (non-zero forget) (FR-007), SC-002 thresholds.
  botStrategyHelpers.boss.test.js# NEW — isBossCard truth table (gone/in-hand/on-table coverage, trump-aware).
  BotStrategy.memory.test.js     # NEW — with full recall cashes a boss ace; with that card "forgotten" falls back (memory mistake) (FR-012/FR-013, SC-004).
  TrickPlay.playedLog.test.js    # NEW — log records every played card with correct trickNumber incl. crawl path.
```

**Structure Decision**: Single web-app layout. The feature is **backend-only** and lives
under `src/services/bots/`, plus two tiny additive fields (`playedLog`, the per-bot
traits) on existing engine objects following their established mirroring patterns. No
WebSocket contract change, no frontend change, no new dependency.

## Complexity Tracking

> One documented exception to Simplicity First (§III).

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Fourier-transform recall model (discrete low-pass kernel via inverse transform) instead of a one-line exponential decay | The user **explicitly required** "use fourier transform formula" (FR-004); it is the defining mechanism of the feature, not optional polish | A bare `e^(-age/τ)` is simpler but does not satisfy the stated requirement. Mitigation: the transform is implemented as a single ~10-line pure helper with no external library, and `research.md` documents that an exponential decay is the *time-domain equivalent* of the chosen first-order low-pass filter, so the model stays principled rather than arbitrary. |
