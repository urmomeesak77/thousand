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

// Expose `count` cards to entice a buyer: ONE king/queen as marriage bait (a buyer
// holding the matching half can complete a marriage), then the strongest point cards
// to show real winning power. Never expose an all-K/Q hand — that reveals only marriage
// halves and tips opponents to your marriages. Extra K/Q are used only to fill the count.
function chooseSellExposure(hand, count) {
  const isMarriageHalf = (c) => c.rank === 'K' || c.rank === 'Q';
  const byPoints = (a, b) => rankValue(b.rank) - rankValue(a.rank);
  const baits = hand.filter(isMarriageHalf).sort(byPoints);
  const others = hand.filter((c) => !isMarriageHalf(c)).sort(byPoints);
  const chosen = [];
  if (baits.length > 0) { chosen.push(baits[0]); }
  for (const c of others) { if (chosen.length >= count) { break; } chosen.push(c); }
  for (const c of baits.slice(1)) { if (chosen.length >= count) { break; } chosen.push(c); }
  return chosen.slice(0, count).map((c) => c.cardId);
}

module.exports = { takeOrSell, buyOrPass, chooseSellExposure };
