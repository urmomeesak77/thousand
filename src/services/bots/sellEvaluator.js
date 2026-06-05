'use strict';

const { estimateMakeable, roundDownToStep, rankValue, findMarriages } = require('./botStrategyHelpers');
const { MIN_BID, MAX_BID, BID_STEP, SELL_CUSHION, BUY_MARGIN } = require('./botConstants');

// Declarer's post-bid decision: take a makeable hand, else sell. Bolder bots tolerate a
// thinner hand (smaller effective cushion). Forced to take when no attempts remain.
function takeOrSell(hand, bid, aggressiveness, attemptsLeft) {
  if (attemptsLeft <= 0) { return { kind: 'startGame' }; }
  // A bolder bot tolerates a thinner hand: a wider cushion below the bid before it sells.
  const cushion = SELL_CUSHION * aggressiveness;
  if (estimateMakeable(hand).value >= bid - cushion) { return { kind: 'startGame' }; }
  return { kind: 'sellStart' };
}

// Opponent's sell-auction decision: buy only when the exposed cards merged into the hand
// make the contract clearly profitable, bidding the makeable value within the legal range.
function buyOrPass(hand, exposedCards, bid, aggressiveness, currentHighBid) {
  const merged = [...hand, ...exposedCards.map((c, i) => ({ cardId: -1 - i, rank: c.rank, suit: c.suit }))];
  const makeable = estimateMakeable(merged).value;
  const margin = BUY_MARGIN * (1 - aggressiveness);
  if (makeable < bid + margin) { return { kind: 'sellPass' }; }
  const smallest = currentHighBid === null || currentHighBid === undefined ? MIN_BID : currentHighBid + BID_STEP;
  const amount = Math.min(MAX_BID, Math.max(smallest, roundDownToStep(makeable, BID_STEP)));
  if (amount < smallest) { return { kind: 'sellPass' }; }
  return { kind: 'sellBid', amount };
}

// Expose `count` cards to entice a buyer. A buyer is enticed by cards that lift its OWN
// hand: real point cards, and a genuine marriage HALF it can pair with its matching card.
// A K/Q from a marriage the declarer holds COMPLETE is useless as bait — its partner
// stays with the declarer, so no buyer can ever complete it — and exposing it only reveals
// (and on a sale breaks) the declarer's best asset; those cards are exposed last, to fill
// the count. `priorExposedSets` are the id-sets used in earlier sell attempts this round;
// the chosen set must differ from each (FR-016) or the retry would be rejected.
function chooseSellExposure(hand, count, priorExposedSets = []) {
  const marriageSuits = findMarriages(hand);
  const isKQ = (c) => c.rank === 'K' || c.rank === 'Q';
  const byPoints = (a, b) => rankValue(b.rank) - rankValue(a.rank);
  const halfBaits = hand.filter((c) => isKQ(c) && !marriageSuits.includes(c.suit)).sort(byPoints);
  const others = hand.filter((c) => !isKQ(c)).sort(byPoints);
  const completeCards = hand.filter((c) => isKQ(c) && marriageSuits.includes(c.suit)).sort(byPoints);
  // Best exposure first: one genuine half as marriage bait, the strongest point cards,
  // then any remaining halves, and complete-marriage cards only as a last resort.
  const ordered = [...halfBaits.slice(0, 1), ...others, ...halfBaits.slice(1), ...completeCards];
  const key = (ids) => [...ids].sort((a, b) => a - b).join(',');
  const prior = new Set(priorExposedSets.map(key));
  for (const set of exposureCandidates(ordered, count)) {
    const ids = set.map((c) => c.cardId);
    if (!prior.has(key(ids))) { return ids; }
  }
  return ordered.slice(0, count).map((c) => c.cardId);
}

// Candidate exposure sets in preference order: the strongest `count`, then sets that swap
// one chosen card (weakest first) for a lower-priority one — ample distinct sets to vary
// across the few allowed sell retries.
function* exposureCandidates(ordered, count) {
  yield ordered.slice(0, count);
  for (let i = count - 1; i >= 0; i--) {
    for (let j = count; j < ordered.length; j++) {
      const set = ordered.slice(0, count);
      set[i] = ordered[j];
      yield set;
    }
  }
}

module.exports = { takeOrSell, buyOrPass, chooseSellExposure };
