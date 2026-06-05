# Contract: Sound Engine Events (frontend, Antlion bus)

This feature exposes **no HTTP or WebSocket** surface. Its only "contract" is the
set of Antlion engine events that trigger sites emit and `SoundManager` consumes.
Keeping this list authoritative prevents drift between emitters and the consumer.

## Engine input events (emitted by views, consumed by SoundManager)

| Event | Payload | Emitters (call site) | Consumer |
|-------|---------|----------------------|----------|
| `sound:card` | none | `DealAnimation._launchCard` (per card); `CardFlightAnimator.spawn` (per flight); `CardExchangeView` pass; talon-absorb path | `SoundManager` → plays `playing-card.mp3` |
| `sound:flip` | none | talon reveal (`GameScreen` talon render on face-down→up); crawl reveal (`GameScreen.revealCrawl`); `SellPhaseView` expose animation (per exposed card) | `SoundManager` → plays `flipcard.mp3` |
| `sound:turn` | none | `GameScreen` status render when `activePlayer.seat` changes | `SoundManager` → plays `turn.mp3` |

Rules:
- Emitters MUST emit exactly once per logical event (FR-004): one `sound:card`
  per card movement, one `sound:flip` per face-up reveal, one `sound:turn` per
  active-seat change.
- `SoundManager` is the **only** subscriber to these events. It MUST no-op when muted.
- Emitting an event when no `SoundManager` is registered (e.g. lobby) is a safe no-op
  (EventBus has no listeners).

## UI input event (DOM → engine, via Antlion.bindInput)

| Engine input | Bound element | Handler |
|--------------|---------------|---------|
| `sound-toggle-mute` | every `.mute-btn` | `MuteButton` → `SoundManager.toggleMute()` + re-render icon |

## Asset contract

Files MUST exist under `src/public/sound/` (already present) and be served by the
existing `StaticServer`:

- `playing-card.mp3`
- `flipcard.mp3`
- `turn.mp3`

## Persistence contract

`localStorage['thousand_muted']` — string `"true"` / `"false"`. Absent ⇒ unmuted.
Read/write is best-effort; failures never throw into callers (mirrors `IdentityStore`).
