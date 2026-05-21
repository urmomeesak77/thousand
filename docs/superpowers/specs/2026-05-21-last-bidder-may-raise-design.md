# Last bidder may raise instead of auto-taking at 100

**Date:** 2026-05-21
**Status:** Approved — ready for implementation plan
**Area:** Main bidding phase (`Round.js`, `RoundSnapshot.js`, bidding controls)

## Problem

When the first two players pass without placing a bid, `Round.submitPass()`
(`src/services/Round.js`, the `remaining.length === 1` branch) immediately
resolves the auction: it forces `currentHighBid` to `100` (or `120` if the
sole remaining player is on barrel) and transitions to `post-bid-decision`.
The third player never receives a bidding turn — they are handed the contract
at exactly the minimum with no opportunity to raise.

The rulebook intent is that the last surviving player *takes* the contract but
may choose to bid higher. The current auto-take removes that choice.

## Behavior change

When both other players have passed **and no bid is on the table**
(`currentHighBid === null`), the last player gets a real bidding turn:

- They **must bid at least 100** (at least `120` if on barrel). The existing
  `submitBid` validators already enforce both floors.
- They **cannot pass** — passing would leave the round with no declarer.
- Bidding at the minimum is equivalent to "take at 100"; any higher legal
  value is a raise.
- Submitting the bid resolves the auction: the bidder becomes `declarerSeat`,
  the talon is absorbed, and the phase moves to `post-bid-decision` — exactly
  the same resolution effects as today.

This new path triggers **only** when `currentHighBid === null`. If a real bid
already exists (e.g. P1 bid 110, the other two passed), nothing changes — that
player already chose their number and resolution stays on the final pass.

## Server changes — `src/services/Round.js`

1. **`submitPass(seat)`** — reject the pass when the seat would be the forced
   last bidder:

   ```js
   if (this.currentHighBid === null && this.passedBidders.size === 2) {
     return { rejected: true, reason: 'You must bid at least 100; you cannot pass.' };
   }
   ```

   This check runs before adding the seat to `passedBidders`. With it in
   place, the `remaining.length === 1 && currentHighBid === null` auto-set
   branch becomes unreachable for the null case; it is retained only to resolve
   the `currentHighBid !== null` real-bid scenario (a sole survivor after a
   genuine bid).

2. **`submitBid(seat, amount)`** — after recording the bid and before/instead
   of advancing the turn, check whether all other seats have already passed
   (the set of non-passed seats is just this one). If so, resolve the auction
   in the same way the pass-resolution path does:
   - set `this.declarerSeat = seat`
   - call `this._absorbTalon()`
   - set `this.phase = 'post-bid-decision'` and `this.currentTurnSeat = seat`
   - return `{ rejected: false, resolved: true, talonIds, identities }`

   In all other (normal) bidding scenarios the non-passed set has more than one
   seat right after a bid, so this branch is inert and existing flow is
   unchanged.

## View-model change — `RoundSnapshot.buildViewModel`

Add a boolean field `viewerMustBid`, true when:

- `round.phase === 'bidding'`, and
- `round.currentTurnSeat === seat`, and
- `round.currentHighBid === null`, and
- `round.passedBidders.size === 2`

This tells the active client that passing is not an option for them.

## Frontend changes

- **`BiddingControls` / `BidControls`** — support a `mustBid` flag. When set,
  the Pass button is hidden (or disabled). The bid input, ±5 steppers, and Bid
  button are unchanged: the input defaults to `100`, or `120` when on barrel
  via the existing `setOnBarrel` path.
- **`GameScreenControls._mountBidding`** — read `gameStatus.viewerMustBid` and
  forward it to the bid controls so the Pass button is suppressed for the
  forced last bidder.

## Spec + test updates

The following existing requirements describe the old auto-take and will be
updated to describe the bid-driven flow (last remaining player is *prompted to
bid* at the minimum and may raise, rather than being auto-assigned):

- Feature 004 **FR-011** and acceptance scenario **AS-8**.
- Feature 005 **AS-4** and the **FR-022(d)** barrel auto-declarer-at-120 rule.

Test updates:

- `tests/Round.bidding.test.js`:
  - The FR-011 "dealer becomes declarer at 100 when P1 and P2 both pass" test
    and the FR-010 "sole survivor via submitBid" test change: a pass by the
    last seat is now **rejected**; the dealer must call `submitBid`.
  - Add: pass-rejection of the forced last bidder; take-at-100 via `submitBid`
    resolves to declarer + `post-bid-decision`; raise-above-100 via
    `submitBid`; barrel floor (120) enforced on the forced bid;
    `viewerMustBid` present/absent in the view-model at the right moments.
- `tests/Game.barrel.test.js`: the FR-022(d) auto-declarer-120 case updates to
  the bid-driven flow (dealer must bid ≥ 120, cannot pass).

## Out of scope

The selling sub-auction (`submitSellBid` / `submitSellPass`) has different
rules (the declarer does not bid; opponents bid for the exposed cards) and is
not touched by this change.
