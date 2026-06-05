# Trump info box — design

Date: 2026-06-05

## Goal

Add a dedicated box above the game-status-box (in the talon column) that shows
the current trump suit, with the suit symbol rendered in its correct color
(red for ♥/♦, light/white for ♠/♣ so it stays legible on the dark table).

## Context

- `gameStatus.currentTrumpSuit` is already in the snapshot payload
  (`RoundSnapshot.js`). It is a Unicode suit symbol (`♣ ♠ ♥ ♦`) or `null`.
- The top `StatusBar` already shows a small "Trump: ♥" text; this new box is a
  prominent, color-coded display near the talon — independent of the status bar.
- The talon column (`.talon-col`) stacks `statusBoxEl` then `talonEl`. The new
  box goes above `statusBoxEl`.
- CSS variables already exist: `--card-color-red: #e94560`, and the dark theme
  provides `--color-text` (light) / `--color-text-muted`.

## Decisions (confirmed with user)

1. **No-trump state**: box is always visible during an active round; shows a
   muted "No trump" until a trump suit is set.
2. **Content**: a `TRUMP` label + the large colored suit symbol.
3. **Black suits on dark table**: rendered in a light/white color (not literal
   `#1a1a1a`, which would be invisible). Red suits use `--card-color-red`.

## Components

### `src/public/js/thousand/TrumpBox.js` (new)

Mirrors `GameStatusBox`. Constructor takes a container, builds:

```
<div class="trump-box hidden">
  <span class="trump-box__label">Trump</span>
  <span class="trump-box__suit"></span>
</div>
```

`render(currentTrumpSuit, visible)`:
- Toggles `hidden` based on `visible`.
- When `currentTrumpSuit` is null/empty: suit span text = `No trump`, classes
  set to the muted variant (`trump-box__suit--none`).
- When set: suit span text = the symbol; class `trump-box__suit--red` for
  `♥`/`♦`, else `trump-box__suit--black`.

### `GameScreen._buildDom` (edit)

Create `trumpBoxEl`, mount before status box:
`centerColEl.append(trumpBoxEl, statusBoxEl, talonEl)`, and
`this._trumpBox = new TrumpBox(trumpBoxEl)`.

### `GameScreen._renderStatus` (edit)

Add one call:
`this._trumpBox.render(gameStatus.currentTrumpSuit, isRoundActive(gameStatus.phase))`
where the active phases are `Bidding`, `Declarer deciding`, `Selling`,
`Card exchange`, `Trick play`. Hidden for `Round complete` / `Game over` /
`Game aborted` / empty.

## CSS — `src/public/css/game.css`

- `.trump-box`: styled like `.game-status-box` (surface bg, border, radius,
  centered), arranged as a horizontal row (label + suit) with a small gap.
- `.trump-box__label`: muted, small, uppercase.
- `.trump-box__suit`: larger, bold suit glyph.
- `.trump-box__suit--red { color: var(--card-color-red); }`
- `.trump-box__suit--black { color: var(--color-text); }`
- `.trump-box__suit--none { color: var(--color-text-muted); }`

## Testing

`tests/TrumpBox.test.js` (jsdom, node test runner):
- red class applied for `♥` and `♦`
- black class applied for `♠` and `♣`
- "No trump" text + none class when suit is null
- `hidden` toggled by the `visible` flag

TDD: write the test first, watch it fail, then implement.

## Out of scope

- No change to the existing StatusBar trump text.
- No server/snapshot changes (`currentTrumpSuit` already present).
