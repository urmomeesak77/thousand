# Clubs-combo easter egg — design

Date: 2026-06-05
Status: approved

## Summary

Add a hidden audio reward: when a single seat leads three consecutive tricks
with **A♣**, then **10♣**, then declares a **clubs marriage** (leading K♣/Q♣),
play `sound/clubs_easter.mp3` for **every** player (including the declarer).
The cue respects the existing mute toggle.

## Trigger semantics

"In a row" = strictly consecutive leads by the same seat:

1. Seat S leads trick `T-2` with **A♣**.
2. Seat S leads trick `T-1` with **10♣**.
3. Seat S declares a **clubs marriage** while leading trick `T`.

Because a player leads a trick only by winning the previous one, requiring the
leads of `T-2` and `T-1` to belong to S guarantees the consecutive streak —
no separate "did S win" bookkeeping is needed.

Non-triggers: wrong order (10♣ then A♣), any non-club lead breaking the streak,
a non-clubs marriage, or the two clubs led by different seats.

## Architecture (server-authoritative)

### `src/services/TrickPlay.js`
- New per-round `leadLog` array. In `playCard`, when a card is led (current
  trick empty before the push), append `{ seat, cardId, trickNumber }`.
  - Crawl trick 1 is ignored: a crawl only occurs with an ace-less declarer,
    so A♣ can never be the crawled lead.
- In `declareMarriage`, when `suit === '♣'` (clubs), inspect `leadLog`:
  the lead of trick `T-1` is 10♣ by S **and** the lead of trick `T-2` is A♣
  by S, where `T = this.trickNumber`. If matched, include `easterEgg: true`
  in the returned result object.

### `src/services/RoundActionBroadcaster.js`
- In `_broadcastMarriage`, add `easterEgg: !!marriageResult.easterEgg` to the
  existing `marriage_declared` message. No new message type — reconnecting and
  late-joining players are unaffected.

## Architecture (client)

### `src/public/js/thousand/SoundManager.js`
- Add cue `clubsEaster: 'sound/clubs_easter.mp3'` to `CUE_FILES`.
- Register `antlion.onInput('sound:clubs-easter', () => this.play('clubsEaster'))`.
- Playback flows through `play()`, so it is a no-op when muted (consistent with
  every other cue).

### `src/public/js/core/ThousandApp.js`
- In `onMarriageDeclared(msg)`, if `msg.easterEgg`, `this._antlion.emit('sound:clubs-easter')`.
  This fires for all players including the declarer — independent of the
  `MarriageNotice` self-suppression in `GameScreen.notifyMarriageDeclared`.

## Testing

`tests/` (Node built-in runner), `TrickPlay` unit tests:
- Positive: A♣ (T-2) → 10♣ (T-1) → clubs marriage (T) by same seat sets
  `easterEgg: true`.
- Negatives (each `easterEgg` falsy): reversed order; a non-club lead in
  between; non-clubs marriage; the two clubs led by different seats.

## Out of scope
- No visual effect, no history-log entry, no new WS message type.
- No new mute control — reuses the existing toggle.
