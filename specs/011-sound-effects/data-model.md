# Phase 1 Data Model: Sound Effects

This feature is frontend-only and adds no server state and no network messages. The "entities" are small client-side concepts.

## Entity: SoundCue (value/enum)

A logical sound event type mapped to one asset file.

| Cue | Engine event | Asset | Fired when |
|-----|--------------|-------|------------|
| `card` | `sound:card` | `sound/playing-card.mp3` | A single card moves: each dealt card, each trick-flight (play-to-centre and collect-to-winner), each exchange pass, talon absorb. |
| `flip` | `sound:flip` | `sound/flipcard.mp3` | A hidden card turns face-up: talon reveal, crawl reveal, exposed sell cards. |
| `turn` | `sound:turn` | `sound/turn.mp3` | `gameStatus.activePlayer.seat` changes to a different (non-null) seat. |

- **Validation**: cue must be one of the three known keys; unknown cue ⇒ no-op (defensive).
- **Cardinality**: one asset per cue; one engine-event name per cue (1:1:1).

## Entity: MutePreference (persisted boolean)

Per-browser/device setting for whether sound effects are silenced.

- **Field**: `muted: boolean`
- **Storage key**: `localStorage['thousand_muted']` (string `"true"`/`"false"`)
- **Default**: absent ⇒ `false` (sound on) — FR-009.
- **Lifecycle**:
  - Read once on `SoundManager` construction → initial in-memory `muted`.
  - Written on every toggle (best-effort; failure swallowed, in-memory state still updates) — FR-008.
- **Invariants**: in-memory `muted` is the source of truth during a session; storage is a mirror for the next session.

## Entity: SoundManager (runtime, not persisted)

Owns playback and mute state. No DOM ownership.

- **State**: `muted: boolean`; `_bases: Map<cue, Audio>` (preloaded base elements for caching).
- **Behavior**:
  - `play(cue)` → if `muted` return; else clone the cached base element and `.play()` (errors swallowed) — FR-001/002/003/007/010.
  - `toggleMute()` → flip `muted`, persist, return new value — FR-008.
  - `isMuted()` → current state (read by `MuteButton` to render the icon).
  - Registers `antlion.onInput('sound:card'|'sound:flip'|'sound:turn', …)` on construction.

## Entity: MuteButton (runtime UI controller, not persisted)

Mirrors the `RulesModal` pattern: binds every `.mute-btn`, reflects state.

- **State**: none of its own; reads `SoundManager.isMuted()`.
- **Behavior**: on `sound-toggle-mute` input → `soundManager.toggleMute()` then re-render all `.mute-btn` icons/`aria-pressed`/`title`. On bind, set initial icon from current state — FR-005/006/012.

## State transition: turn sound

```text
prevSeat = _lastGameStatus?.activePlayer?.seat
nextSeat = incoming gameStatus?.activePlayer?.seat
if nextSeat != null AND nextSeat !== prevSeat:
    antlion.emit('sound:turn')
```

No other entity has meaningful state transitions.
