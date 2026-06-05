# Bot-initiated crawl — design

Date: 2026-06-05

## Problem

When a bot is the declarer with an ace-less hand on the opening lead, it currently
leads a normal face-up card. Per the crawl rule (feature 007), an ace-less declarer
should instead *crawl*: play the first trick face-down so all players commit blind,
giving the weak declarer a chance to steal the trick and the lead it would otherwise
certainly lose face-up. Bots already *respond* to a human declarer's crawl, but they
never *initiate* one — `BotStrategy` is documented as deliberately declining the crawl
(v1 simplification).

## Goal

Teach bot declarers to initiate a crawl whenever they are eligible.

## Eligibility (always crawl when possible)

In `BotStrategy._decideTrickPlay`, before the normal lead/follow path (and after the
existing `fourNinesAckPending` / paused / not-my-turn / `crawlActive`-response early
returns), the bot crawls when **all** hold:

- `seat === round.declarerSeat`
- `round.trickNumber === 1`
- `round.currentTrick.length === 0` (it holds the opening lead)
- its hand contains **no ace** (the rule's precondition)

When eligible, it returns `{ kind: 'crawlCommit', cardId }` instead of `{ kind: 'playCard' }`.

No other wiring is needed: `BotTurnDriver._execute` already routes `crawlCommit` to
`handleCrawlCommit`, and `Round.commitCrawlCard` auto-arms the crawl on the declarer's
first commit (the wire protocol has no separate "begin crawl" message — the initiating
commit is disambiguated by turn order).

## Card choice — weighted random, never a marriage card

The declarer's commit sets the led suit, so a higher card has a better chance of topping
the blind trick and keeping the lead. The pick is therefore **random but weighted toward
higher cards**, and **never** a King/Queen that forms a still-declarable marriage.

A new `trickPlanner.chooseCrawlCard(hand, trump, trickNumber)`:

1. `reserved = reservedMarriageCards(hand, trump, trickNumber)` — the existing helper. At
   trick 1 no marriage has been declared yet, so every held K+Q pair is reserved.
2. `pool = hand` minus `reserved` (fall back to the full hand only in the degenerate case
   where every card is a reserved marriage card).
3. Pick one card from `pool` by **weighted random**, weight = `rankStrength(rank)`
   (A:8, 10:7, K:6, Q:5, J:4, 9:3 — all nonzero). With no ace present, 10s and Ks are the
   strongest pulls while lower cards retain a real, smaller chance.

`BotStrategy` calls this helper (mirroring how it already delegates to
`trickPlanner.chooseLead` / `chooseFollow`), keeping `BotStrategy` thin.

## Out of scope

- The opponent crawl-*response* branch (`round.crawlActive`) is unchanged — it still
  commits the lowest card.
- No change to the human crawl UI or the wire protocol.

## Testing

Unit tests (`tests/`):

- An eligible ace-less bot declarer on trick 1 returns a `crawlCommit`; the committed
  `cardId` is never a reserved marriage K/Q (assert the exclusion invariant over many
  runs, since the card is random — not a specific card).
- A declarer **holding an ace** does not crawl (returns a normal `playCard`).
- A non-declarer, or the declarer past trick 1 / not on the opening lead, does not crawl.
- `chooseCrawlCard` excludes marriage cards and (statistically) favours higher ranks.
