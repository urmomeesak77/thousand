'use strict';

// Pure card-evaluation helpers for the bot decision policy. Ported from the smart
// end-to-end test bot (tests/e2e-live-smart.js) and adapted to operate on
// authoritative round data ({ cardId, rank, suit }) instead of scraped DOM nodes.
// No round/store state is read here — every function is a pure function of its args.

// Point value of a card (what it's worth to capture/save). 7/8 (4-player deck) are 0.
const RANK_VALUE = { A: 11, '10': 10, K: 4, Q: 3, J: 2, '9': 0, '8': 0, '7': 0 };
// Trick-winning order, high→low: A,10,K,Q,J,9,8,7 (distinct from point value).
const RANK_STRENGTH = { A: 8, '10': 7, K: 6, Q: 5, J: 4, '9': 3, '8': 2, '7': 1 };
// Marriage bonus by suit letter (♣100 / ♠80 / ♥60 / ♦40).
const MARRIAGE_BONUS = { C: 100, S: 80, H: 60, D: 40 };

function rankValue(rank) {
  return RANK_VALUE[rank] ?? 0;
}

function rankStrength(rank) {
  return RANK_STRENGTH[rank] ?? 0;
}

function roundDownToStep(value, step) {
  return Math.floor(value / step) * step;
}

// Suits for which the cards hold both K and Q (a complete marriage).
function findMarriages(cards) {
  const bySuit = {};
  for (const c of cards) {
    if (!c.suit) { continue; }
    (bySuit[c.suit] ||= new Set()).add(c.rank);
  }
  return Object.keys(bySuit).filter((s) => bySuit[s].has('K') && bySuit[s].has('Q'));
}

// Pick the highest- or lowest-point-value card from a pool. Returns null if empty.
function pickCard(cards, { highest }) {
  const pool = cards.filter((c) => c.cardId !== undefined && c.cardId !== null);
  if (pool.length === 0) { return null; }
  const sorted = pool.slice().sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
  return highest ? sorted[sorted.length - 1] : sorted[0];
}

// The card currently winning the trick: highest trump if any, else highest strength.
function bestCenterCard(centerCards, trump) {
  const better = (a, b) => {
    const aT = a.suit === trump, bT = b.suit === trump;
    if (aT !== bT) { return aT ? a : b; }
    return rankStrength(a.rank) >= rankStrength(b.rank) ? a : b;
  };
  return centerCards.reduce((best, c) => (best ? better(best, c) : c), null);
}

// Would `card` beat the current best card on the table (trump-aware)?
function cardBeats(card, best, trump) {
  if (!best) { return true; }
  const cT = card.suit === trump, bT = best.suit === trump;
  if (cT && !bT) { return true; }
  if (!cT && bT) { return false; }
  if (cT && bT) { return rankStrength(card.rank) > rankStrength(best.rank); }
  // Neither trump: only a higher card of the same (led) suit wins.
  return card.suit === best.suit && rankStrength(card.rank) > rankStrength(best.rank);
}

// Estimate the score a declarer can safely make against passive opponents: the
// ~120 sweepable trick points (minus a buffer for a lost trick) plus the bonus of
// every COMPLETE marriage held, with a small capped nudge for half-marriages a
// talon might complete. Never inflates past the sweepable ceiling on its own.
function estimateMakeable(hand) {
  const bySuit = {};
  for (const c of hand) {
    if (!c.suit) { continue; }
    (bySuit[c.suit] ||= new Set()).add(c.rank);
  }
  let completeBonus = 0;
  let halfCount = 0;
  const complete = [];
  for (const suit of Object.keys(bySuit)) {
    const has = bySuit[suit];
    if (has.has('K') && has.has('Q')) {
      completeBonus += MARRIAGE_BONUS[suit];
      complete.push(suit);
    } else if (has.has('K') || has.has('Q')) {
      halfCount += 1;
    }
  }
  const value = 105 + completeBonus + Math.min(halfCount * 5, 10);
  return { value, complete, half: halfCount };
}

// Pick the weakest card a declarer can give away in exchange: never a card that
// completes a marriage, and not an ace/ten (kept to win point-rich tricks). Falls
// back to looser pools only if those protections leave nothing.
function pickExchangeCard(hand) {
  const marriageSuits = findMarriages(hand);
  const isMarriageCard = (c) => marriageSuits.includes(c.suit) && (c.rank === 'K' || c.rank === 'Q');
  const protectedRank = (c) => c.rank === 'A' || c.rank === '10';
  const pools = [
    hand.filter((c) => !isMarriageCard(c) && !protectedRank(c)),
    hand.filter((c) => !isMarriageCard(c)),
    hand,
  ];
  for (const pool of pools) {
    const card = pickCard(pool, { highest: false });
    if (card) { return card; }
  }
  return null;
}

module.exports = {
  RANK_VALUE,
  RANK_STRENGTH,
  MARRIAGE_BONUS,
  rankValue,
  rankStrength,
  roundDownToStep,
  findMarriages,
  pickCard,
  bestCenterCard,
  cardBeats,
  estimateMakeable,
  pickExchangeCard,
};
