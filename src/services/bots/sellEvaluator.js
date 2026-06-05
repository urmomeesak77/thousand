'use strict';

const { estimateMakeable, roundDownToStep, rankValue } = require('./botStrategyHelpers');
const { MIN_BID, MAX_BID, BID_STEP, SELL_CUSHION, BUY_MARGIN } = require('./botConstants');

// Declarer's post-bid decision: take a makeable hand, else sell. Bolder bots tolerate a
// thinner hand (smaller effective cushion). Forced to take when no attempts remain.
function takeOrSell(hand, bid, aggressiveness, attemptsLeft) {
  if (attemptsLeft <= 0) { return { kind: 'startGame' }; }
  const cushion = SELL_CUSHION * (1 - aggressiveness);
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

// Expose `count` cards most likely to entice a buyer. Kings and queens go first — a
// buyer holding the matching half can complete a marriage — then the highest-point
// cards. (buyOrPass re-estimates the merged hand, so exposed marriage bait pays off.)
function chooseSellExposure(hand, count) {
  const isMarriageHalf = (c) => c.rank === 'K' || c.rank === 'Q';
  const sorted = hand.slice().sort((a, b) => {
    const am = isMarriageHalf(a) ? 1 : 0;
    const bm = isMarriageHalf(b) ? 1 : 0;
    if (am !== bm) { return bm - am; }
    return rankValue(b.rank) - rankValue(a.rank);
  });
  return sorted.slice(0, count).map((c) => c.cardId);
}

module.exports = { takeOrSell, buyOrPass, chooseSellExposure };
