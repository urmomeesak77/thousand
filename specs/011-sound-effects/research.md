# Phase 0 Research: Sound Effects

All Technical Context items were resolvable from the existing codebase and the constitution; no `NEEDS CLARIFICATION` remained after the spec clarification. The decisions below capture the non-obvious choices.

## D1 — Playback primitive: built-in `HTMLAudioElement`

- **Decision**: Use the browser-native `Audio` element (`new Audio(src)`); no Web Audio API, no library.
- **Rationale**: Constitution §I/§III — vanilla JS, no dependencies, least code that works. Three short one-shot SFX do not need the Web Audio graph. `Audio` preloads and plays with a one-line call.
- **Alternatives considered**: Web Audio API (`AudioContext` + buffers) — rejected as overkill for three fire-and-forget cues; adds gain-node/buffer-decode complexity for no required benefit.

## D2 — Overlapping playback (rapid deal)

- **Decision**: On each `play(cue)`, clone the cached, preloaded element (`base.cloneNode()`) and call `.play()` on the clone. The base element is only used for preloading/caching the asset.
- **Rationale**: A single `Audio` element cannot play two overlapping instances; the 24-card deal fires `sound:card` ~24 times in ~2 s and would otherwise cut itself off. `cloneNode()` reuses the already-fetched media resource, so overlap is cheap and needs no pool bookkeeping. Clones are transient and garbage-collected after they finish; no `ended` listener is attached (that would violate §XI).
- **Alternatives considered**: (a) `currentTime = 0; play()` on one element — rejected, restarts/cuts the previous cue during the deal. (b) Fixed Audio pool — rejected as premature optimization (§III).

## D3 — Browser autoplay-gate handling

- **Decision**: Rely on prior user gestures. No sound fires before the player has clicked through the lobby and the in-game **Start game** / action buttons, which satisfies the browser's autoplay-unlock requirement. No dedicated unlock handshake is added.
- **Rationale**: Every sound trigger (deal, flight, flip, turn) occurs strictly after the player has interacted with the page, so the audio context is already unlocked by the time the first cue plays. Failure to play is swallowed (FR-010), so even a pre-gesture edge case degrades silently.
- **Alternatives considered**: An explicit "click to enable sound" priming step — rejected as unnecessary UX friction given the natural gesture flow.

## D4 — Routing triggers through Antlion (§XI compliance)

- **Decision**: Trigger sites call `antlion.emit('sound:card' | 'sound:flip' | 'sound:turn')`. `SoundManager` subscribes with `antlion.onInput(...)`. The mute button is wired with `antlion.bindInput(el, 'click', 'sound-toggle-mute')`.
- **Rationale**: Constitution §XI — all frontend event flow goes through the engine bus; no module attaches its own DOM listener or timer for sound. `Audio.prototype.play()` is a side effect (not a timer/listener/RAF), so calling it directly inside a `SoundManager` handler is permitted. We deliberately do **not** attach `audio.addEventListener('ended', …)`.
- **Alternatives considered**: Direct method calls into a singleton `SoundManager` from each view — rejected: bypasses the engine bus and couples views to the sound module.

## D5 — Turn-change detection point

- **Decision**: Detect turn changes centrally in `GameScreen` by comparing the previous `activePlayer.seat` (already tracked as `_lastGameStatus`) against the incoming `gameStatus.activePlayer.seat` on every status render; emit `sound:turn` when the seat changes (and a new active seat exists).
- **Rationale**: Per the clarification, the turn sound fires on **every** active-player change for any seat. `GameScreen._renderStatus` / `updateStatus` is the single chokepoint through which all `gameStatus` updates flow, so one comparison there covers every phase (bidding, exchange, trick play) without scattering logic. `StatusBar` already reads `gameStatus.activePlayer`.
- **Alternatives considered**: Emitting from each phase view — rejected, duplicative and error-prone; risks double-firing or missing transitions.

## D6 — Mute preference persistence

- **Decision**: New `MutePreferenceStore` (under `src/public/js/storage/`) wrapping `localStorage` under its own key `thousand_muted`, mirroring `IdentityStore`'s try/catch resilience. Stores a boolean; absent ⇒ unmuted (default sound on).
- **Rationale**: Matches the existing client-preference persistence pattern (§X — feature-specific storage lives in the storage layer). Independent key keeps it orthogonal to identity and survives identity expiry. Best-effort writes (Safari private mode / quota) never throw into callers.
- **Alternatives considered**: Folding the boolean into the identity record — rejected: couples unrelated concerns and ties mute state to the 24 h identity TTL.

## D7 — Mute button placement & wiring

- **Decision**: `ScoreboardPanel` gains a `_buildMuteBtn()` that appends a `.mute-btn .icon-btn` immediately next to the existing `.rules-btn` in the header `controls`. A separate `MuteButton` controller (bound once at app startup, exactly like `RulesModal`) wires every `.mute-btn` via `antlion.bindInput`, toggles `SoundManager`, and reflects on/off state (icon + `aria-pressed` + `title`).
- **Rationale**: "Right next to the game info icon" → same `controls` flex row as `.rules-btn`. Reusing the `RulesModal` binding pattern keeps construction (chrome) separate from behavior (controller), and reuses `.icon-btn` styling for a touch-friendly, responsive target (§VI).
- **Alternatives considered**: Putting toggle logic inside `ScoreboardPanel` — rejected: violates single-responsibility; ScoreboardPanel only builds chrome.

## D8 — Testability via injected audio factory

- **Decision**: `SoundManager` constructor takes an optional `audioFactory = (src) => new Audio(src)`. Tests inject a stub factory returning a spy with `cloneNode()`/`play()`.
- **Rationale**: jsdom does not implement real media playback (`HTMLMediaElement.play` is a no-op/throws "Not implemented"). Injection lets unit tests assert "muted ⇒ no play; unmuted ⇒ play called once per cue" without real audio, keeping coverage ≥90% (constitution Testing).
- **Alternatives considered**: Monkey-patching global `Audio` in tests — rejected: brittle and leaks across test files.
