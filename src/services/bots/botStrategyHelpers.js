'use strict';

// Pure card-evaluation helpers for the bot decision policy. Ported from the smart
// end-to-end test bot (tests/e2e-live-smart.js) and adapted to operate on
// authoritative round data ({ cardId, rank, suit }) instead of scraped DOM nodes.
// No round/store state is read here — every function is a pure function of its args.

// Point value of a card (what it's worth to capture/save). 7/8 (4-player deck) are 0.
const RANK_VALUE = { A: 11, '10': 10, K: 4, Q: 3, J: 2, '9': 0, '8': 0, '7': 0 };
// Trick-winning order, high→low: A,10,K,Q,J,9,8,7 (distinct from point value).
const RANK_STRENGTH = { A: 8, '10': 7, K: 6, Q: 5, J: 4, '9': 3, '8': 2, '7': 1 };
// Marriage bonus by suit. Keyed by BOTH the letter form used in unit tests and the
// symbol form the real Deck produces (♣100 / ♠80 / ♥60 / ♦40), so lookups never return
// undefined — an undefined bonus would poison estimateMakeable's sum with NaN.
const MARRIAGE_BONUS = {
  C: 100, S: 80, H: 60, D: 40,
  '♣': 100, '♠': 80, '♥': 60, '♦': 40,
};

// Realistic expected-capture weights (tunable). A declarer in a CONTESTED game does
// not sweep all 120 trick points, so estimateMakeable values the points the hand can
// actually win rather than assuming a full sweep.
const ACE_OFFSUIT_FACTOR = 0.85;  // an off-trump ace can be ruffed away
const TEN_BARE_FACTOR = 0.4;      // a ten with no same-suit ace usually loses to it
const MARRIAGE_FACTOR = 1.0;      // a declared marriage is the declarer's most reliable
                                  // points — it controls when to declare and holds the
                                  // K/Q trick to do it on, so value it in full (a K+Q
                                  // clubs hand must clear the 100 floor, not pass)
const RUFF_PER_TRUMP = 8;         // each trump beyond the third ruffs an opponent point trick
const HALF_MARRIAGE_NUDGE = 5;    // a hidden talon card may complete a half marriage
const HALF_MARRIAGE_CAP = 10;

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

// Cards still unaccounted-for that could beat `card` (trump-aware, per cardBeats):
// every deck card that outranks it and is NOT recalled gone, in the bot's own hand, or
// already on the table. `context.deck` resolves a cardId to its rank/suit (goneCardIds
// carries only ids). An empty result ⇒ `card` is a guaranteed winner if led.
function remainingBeaters(card, { goneCardIds, hand, currentTrick, deck }, trump) {
  const accounted = new Set(goneCardIds);
  for (const c of hand) { accounted.add(c.cardId); }
  for (const c of currentTrick) { accounted.add(c.cardId); }
  const beaters = [];
  for (let id = 0; id < deck.length; id++) {
    if (id === card.cardId || accounted.has(id)) { continue; }
    if (cardBeats({ rank: deck[id].rank, suit: deck[id].suit }, card, trump)) { beaters.push(id); }
  }
  return beaters;
}

// A "boss" card: nothing still in play can beat it. Conservative under forgetting — a
// higher card that is genuinely gone but NOT recalled (absent from goneCardIds) counts
// as unaccounted, so the bot won't treat the card as safe (the "memory mistake", H3).
function isBossCard(card, context, trump) {
  return remainingBeaters(card, context, trump).length === 0;
}

// Total point value of the cards currently on the table.
function trickPoints(centerCards) {
  return centerCards.reduce((sum, c) => sum + rankValue(c.rank), 0);
}

// The lowest-strength card in `cards` that beats `best` (trump-aware), or null. Lets a
// bot win a trick without overspending a high card.
function cheapestWinner(cards, best, trump) {
  const winners = cards
    .filter((c) => cardBeats(c, best, trump))
    .sort((a, b) => rankStrength(a.rank) - rankStrength(b.rank));
  return winners[0] ?? null;
}

// True when the bot's highest trump is unbeatable by anything still unaccounted — i.e. it
// holds the top remaining trump, so leading trumps strips opponents without being overtaken.
function hasTrumpControl(hand, context, trump) {
  if (!trump) { return false; }
  const trumps = hand.filter((c) => c.suit === trump)
    .sort((a, b) => rankStrength(b.rank) - rankStrength(a.rank));
  return trumps.length > 0 && isBossCard(trumps[0], context, trump);
}

// The suit a declarer would make trump: the longest suit, breaking ties toward the
// higher marriage bonus (so a K/Q-bearing suit wins a length tie). Returns null on an
// empty/suitless hand.
function chooseTrumpSuit(bySuit) {
  let best = null;
  let bestLen = 0;
  let bestBonus = 0;
  for (const suit of Object.keys(bySuit)) {
    const len = bySuit[suit].size;
    const bonus = MARRIAGE_BONUS[suit] ?? 0;
    if (len > bestLen || (len === bestLen && bonus > bestBonus)) {
      best = suit; bestLen = len; bestBonus = bonus;
    }
  }
  return best;
}

// Estimate the points a declarer can realistically CAPTURE against contesting
// opponents (not a full sweep): discounted aces/tens, ruffing power from a long
// trump suit, and complete-marriage bonuses. Keeps the { value, complete, half }
// shape its callers (bidding, selling, buying) read.
function estimateMakeable(hand) {
  const bySuit = {};
  for (const c of hand) {
    if (!c.suit) { continue; }
    (bySuit[c.suit] ||= new Set()).add(c.rank);
  }
  const trump = chooseTrumpSuit(bySuit);

  let points = 0;
  let completeBonus = 0;
  let halfCount = 0;
  const complete = [];

  for (const suit of Object.keys(bySuit)) {
    const has = bySuit[suit];
    const isTrump = suit === trump;
    if (has.has('A')) {
      points += isTrump ? RANK_VALUE.A : RANK_VALUE.A * ACE_OFFSUIT_FACTOR;
    }
    if (has.has('10')) {
      const protectedTen = isTrump || has.has('A');
      points += protectedTen ? RANK_VALUE['10'] : RANK_VALUE['10'] * TEN_BARE_FACTOR;
    }
    if (has.has('K') && has.has('Q')) {
      completeBonus += MARRIAGE_BONUS[suit] * MARRIAGE_FACTOR;
      complete.push(suit);
    } else if (has.has('K') || has.has('Q')) {
      halfCount += 1;
    }
  }

  const trumpLen = trump ? bySuit[trump].size : 0;
  const ruffBonus = Math.max(0, trumpLen - 3) * RUFF_PER_TRUMP;
  const halfNudge = Math.min(halfCount * HALF_MARRIAGE_NUDGE, HALF_MARRIAGE_CAP);

  const value = Math.round(points + completeBonus + ruffBonus + halfNudge);
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
  remainingBeaters,
  isBossCard,
  trickPoints,
  cheapestWinner,
  hasTrumpControl,
  estimateMakeable,
  pickExchangeCard,
};
