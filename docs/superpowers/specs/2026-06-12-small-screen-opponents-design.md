# Small-screen opponent collapse + trump box fit — design

Date: 2026-06-12

## Goal

On narrow viewports the opponent card stacks crowd the table (see
`temp/view.png`, ~490px wide): the left/right/across stacks render at full
fanned width, and the trump box wraps "No trump" onto two lines. Collapse each
opponent stack to a single card with a count badge sooner, lay the 4-player
across seat's collapsed card on its side to save vertical space, and let the
trump box size to its one-line content.

## Context

- `game.css:1326` already has a `@media (max-width: 480px)` block that
  collapses `.opponent-view__stack` to a single card and reveals the
  `.opponent-view__count` badge, overriding OpponentView's inline `width`/`left`
  styles with `!important` (acknowledged tech debt, tracked separately).
  The screenshot's ~490px viewport just misses that breakpoint.
- `OpponentView._buildCardStack()` already renders the count badge on the
  topmost card; no JS change is needed to show it.
- The 4-player across seat (`.game-table--four > .across-zone`) sits alone in
  the top grid row; its row height is driven by `var(--card-height)`.
- `.trump-box` is a flex row (`TRUMP` label + suit glyph) inside the centre
  grid column, which squeezes it at small widths and wraps the
  `trump-box__suit--none` "No trump" text.

## Decisions (confirmed with user)

1. **Breakpoint**: raise the single-card collapse from ≤480px to ≤640px, for
   both 3- and 4-player (matches the existing hand fan-stack breakpoint).
2. **Across seat**: at ≤640px the collapsed card lies landscape — implemented
   by swapping width/height (`width: var(--card-height); height:
   var(--card-width)`), not `transform: rotate`, so the layout box shrinks
   with it. Count badge stays upright in the card centre; name above and
   stats below are unchanged.
3. **Trump box**: never wraps — `white-space: nowrap` on label and suit,
   `width: max-content` on the box so it grows to fit "TRUMP No trump" on one
   line instead of being squeezed by the centre column.

## Changes — `src/public/css/game.css` only

1. Move the opponent-stack collapse rules out of the `@media (max-width:
   480px)` block into a `@media (max-width: 640px)` block (the unrelated
   `.status-bar` rule stays at 480px). The 4-player trick-centre width rules
   at ≤600px/≤480px are untouched.
2. In the same ≤640px block, scoped to `.game-table--four > .across-zone`:
   swap the stack and stack-card dimensions to landscape.
3. `.trump-box { width: max-content; }` plus `white-space: nowrap` on
   `.trump-box__label` and `.trump-box__suit` (base rules, not media-scoped).

## Testing

CSS-only — no unit-testable logic. Visual verification with the live e2e
setup at ~490px and ~360px viewport widths in both 3- and 4-player games:

- left/right opponents show one card + count badge
- 4-player across seat shows one landscape card + count badge
- trump box renders "TRUMP No trump" on one line
- regression check at desktop width (stacks still fan, across card upright)

## Out of scope

- Refactoring the `!important` inline-style override to custom properties.
- Any JS changes (`OpponentView.js`, `CardTable.js` slot math).
