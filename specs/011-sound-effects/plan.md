# Implementation Plan: Sound Effects

**Branch**: `master` (no feature branch — per project no-new-branches preference) | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/011-sound-effects/spec.md`

## Summary

Add three one-shot sound effects to the in-game experience — a card-handling sound for every card movement (`playing-card.mp3`), a flip sound for every face-up reveal (`flipcard.mp3`), and a turn sound on every active-player change (`turn.mp3`) — plus a mute/unmute toggle next to the existing rules (info) icon whose state persists across sessions. Triggers are routed through the Antlion event bus (`sound:card|flip|turn`); a single `SoundManager` consumes them and plays cloned, preloaded `Audio` elements (no-op when muted). Mute state lives in a `MutePreferenceStore` (localStorage) and is reflected by a `MuteButton` controller bound the same way as the rules modal.

## Technical Context

**Language/Version**: Vanilla JS ES6+ (frontend ES modules); Node.js v18+ (unchanged backend)
**Primary Dependencies**: None new — built-in `HTMLAudioElement`; existing Antlion engine
**Storage**: `localStorage['thousand_muted']` (boolean mirror); in-memory `muted` is session source of truth
**Testing**: Node.js built-in test runner + jsdom; audio injected via factory for unit testing
**Target Platform**: Browser (mobile/tablet/desktop — responsive)
**Project Type**: Web application (single-file frontend per page, thin Node server)
**Performance Goals**: No perceptible added latency to animations (SC-005); overlapping deal cues must not block ticks
**Constraints**: No build step, no libraries (§I/§III/§V); all event flow through Antlion (§XI); files already in `src/public/sound/`
**Scale/Scope**: 3 new classes, ~6 modified files, in-game only (lobby/waiting room out of scope)

## Constitution Check

*GATE: re-checked after Phase 1 design — PASS.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Stack (vanilla, no deps) | PASS | Built-in `Audio`; no library, no Web Audio graph. |
| II. Single-file frontend / ES modules | PASS | New ES modules under `src/public/js/`. |
| III. Simplicity First | PASS | Least code: clone-and-play, one manager, tiny store. |
| V. No build step | PASS | Ships as written; `.mp3` served statically. |
| VI. Responsive | PASS | Mute button reuses touch-friendly `.icon-btn`. |
| VII. Classes over functions | PASS | `SoundManager`, `MutePreferenceStore`, `MuteButton`. |
| VIII. One class per file | PASS | One class per new file. |
| IX. Small units | PASS | Methods kept < 20 lines; manager < 100 lines. |
| X. Logical cohesion | PASS | Storage in `storage/`, game UI in `thousand/`. |
| XI. All frontend logic through Antlion | PASS | Triggers via `antlion.emit`; consumer via `onInput`; button via `bindInput`. No direct listeners/timers. `Audio.play()` is a side effect, not a timer/listener — allowed; no `ended` listeners used. |
| XII. Built-in tools over shell | N/A | Dev-time guidance only. |

No violations → Complexity Tracking omitted.

## Project Structure

### Documentation (this feature)

```text
specs/011-sound-effects/
├── plan.md              # This file
├── spec.md
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── sound-events.md  # Phase 1 — Antlion event + asset + persistence contract
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/public/
├── sound/                              # assets (already present)
│   ├── playing-card.mp3
│   ├── flipcard.mp3
│   └── turn.mp3
├── css/
│   └── game.css                        # MODIFY — add .mute-btn (reuses .icon-btn)
└── js/
    ├── storage/
    │   └── MutePreferenceStore.js      # NEW — localStorage boolean (IdentityStore pattern)
    ├── core/
    │   └── ThousandApp.js              # MODIFY — construct SoundManager + MuteButton.bind()
    └── thousand/
        ├── SoundManager.js             # NEW — preload + play(cue), subscribes to sound:* events
        ├── MuteButton.js               # NEW — binds .mute-btn, toggles + reflects state
        ├── ScoreboardPanel.js          # MODIFY — _buildMuteBtn() next to .rules-btn
        ├── DealAnimation.js            # MODIFY — emit sound:card per launched card
        ├── CardFlightAnimator.js       # MODIFY — emit sound:card per spawned flight
        ├── CardExchangeView.js         # MODIFY — emit sound:card on pass
        ├── SellPhaseView.js            # MODIFY — emit sound:flip on expose
        └── GameScreen.js               # MODIFY — emit sound:turn on seat change; sound:flip on talon/crawl reveal

tests/
├── sound-manager.test.js              # NEW — muted no-op, unmuted plays once per cue, unknown cue
├── mute-preference-store.test.js      # NEW — default unmuted, persist/round-trip, storage failure swallowed
└── mute-button.test.js                # NEW — toggle flips state + icon/aria
```

**Structure Decision**: Single existing web-app layout. New runtime UI classes live under `src/public/js/thousand/` (game-specific, §X); the persistence helper lives under `src/public/js/storage/` next to `IdentityStore`. No backend changes — the static server already serves `src/public/sound/`.

## Implementation Approach (phased, for /speckit-tasks)

1. **Foundation (TDD)**: `MutePreferenceStore` → `SoundManager` (with injected `audioFactory`) → `MuteButton`. Unit tests first.
2. **Wiring**: `ScoreboardPanel._buildMuteBtn()`; `ThousandApp` constructs `SoundManager`, binds `MuteButton` after chrome exists (mirror `RulesModal` bind ordering).
3. **Trigger emission**: add `antlion.emit('sound:card')` in `DealAnimation`/`CardFlightAnimator`/`CardExchangeView`; `sound:flip` in `SellPhaseView` and `GameScreen` (talon + crawl reveal); `sound:turn` in `GameScreen` status render on seat change.
4. **Style**: `.mute-btn` in `game.css` reusing `.icon-btn`; muted/unmuted icon states.
5. **Verify**: lint, tests, manual quickstart pass; update `CLAUDE.md` SPECKIT pointer.

## Complexity Tracking

No constitution violations — section intentionally empty.
