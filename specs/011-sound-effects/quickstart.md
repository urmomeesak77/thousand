# Quickstart: Sound Effects

## Run

```bash
npm start          # serve on :3000 (StaticServer already serves src/public/sound/)
npm test           # unit tests incl. sound-manager / mute-preference-store / mute-button
npm run lint
```

## Manual verification (maps to Success Criteria)

1. Open a game with bots, start a round.
2. **SC-001 — card sound**: during the deal you hear `playing-card.mp3` per card; you hear it again on each card played to a trick, each exchange pass, and the talon absorb.
3. **SC-001 — flip sound**: when the talon is revealed, crawl cards are turned up, or sell cards are exposed, you hear `flipcard.mp3`.
4. **SC-001 — turn sound**: every time the active player changes (after each card in trick play, and on phase/round turn handoffs) you hear `turn.mp3`.
5. **SC-003 — mute control**: the mute toggle sits immediately next to the rules (info) icon in the scoreboard header; clicking it silences all sound; the icon switches to a muted state. Clicking again restores sound on the very next event.
6. **SC-002 — muted silence**: with mute on, play a full round — zero sounds.
7. **SC-004 — persistence**: mute, reload the page → game starts muted; unmute, reload → starts with sound on.

## Key files (after implementation)

- `src/public/js/thousand/SoundManager.js` — preload + `play(cue)` + mute state, subscribes to `sound:card|flip|turn`.
- `src/public/js/storage/MutePreferenceStore.js` — `localStorage['thousand_muted']` get/set.
- `src/public/js/thousand/MuteButton.js` — binds `.mute-btn`, toggles + reflects state (RulesModal pattern).
- `src/public/js/thousand/ScoreboardPanel.js` — `_buildMuteBtn()` next to `.rules-btn`.
- `src/public/js/core/ThousandApp.js` — constructs `SoundManager` + `MuteButton.bind()`.
- Emitters: `DealAnimation.js`, `CardFlightAnimator.js`, `CardExchangeView.js`, `SellPhaseView.js`, `GameScreen.js`.
- `src/public/css/game.css` — `.mute-btn` (reuses `.icon-btn`).
