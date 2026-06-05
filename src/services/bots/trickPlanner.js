'use strict';

const {
  findMarriages, pickCard, bestCenterCard,
  cheapestWinner, isBossCard, trickPoints,
  rankValue, rankStrength, hasTrumpControl, MARRIAGE_BONUS,
} = require('./botStrategyHelpers');

// Point value of a ten: the threshold below which a declarer treats a winner as a
// throwaway it will spend to capture a point trick (an ace/ten it saves to duck instead).
const RANK_VALUE_TEN = 10;

// K/Q of still-declarable marriages, reserved while a declaration remains reachable.
function reservedMarriageCards(legal, trump, trickNumber) {
  if (trickNumber > 6) { return new Set(); }
  const suits = findMarriages(legal).filter((s) => s !== trump);
  return new Set(legal
    .filter((c) => suits.includes(c.suit) && (c.rank === 'K' || c.rank === 'Q'))
    .map((c) => c.cardId));
}

// Following a trick already in progress: capture point-rich tricks as cheaply as possible,
// otherwise duck with the lowest-value card (keeping aces/tens and reserved marriages).
function chooseFollow(ctx) {
  const { legal, hand, trump, currentTrick, deck, goneCardIds, playerCount, trickNumber, isDeclarer } = ctx;
  const reserved = reservedMarriageCards(legal, trump, trickNumber);
  const usable = legal.filter((c) => !reserved.has(c.cardId));
  const pool = usable.length > 0 ? usable : legal;

  const center = currentTrick.map(({ cardId }) => ({ rank: deck[cardId].rank, suit: deck[cardId].suit }));
  const best = bestCenterCard(center, trump);
  const points = trickPoints(center);
  const winner = cheapestWinner(pool, best, trump);
  const amLast = currentTrick.length === playerCount - 1;

  if (winner && points > 0) {
    const sure = isBossCard(winner, { goneCardIds, hand, currentTrick, deck }, trump);
    if (amLast || sure) { return { cardId: winner.cardId }; }
    // A declarer must CAPTURE its bid, so on a point-rich trick it grabs the points with a
    // throwaway winner (a low ruff or low card) rather than ducking them to the opponents.
    // It still refuses to risk an ace or ten to a later over-take — those it saves to duck.
    if (isDeclarer && rankValue(winner.rank) < RANK_VALUE_TEN) { return { cardId: winner.cardId }; }
  }
  const duck = pickCard(pool, { highest: false });
  return duck ? { cardId: duck.cardId } : null;
}

// Small bonus for making `suit` trump: trump length + protected side aces.
function trumpUsefulness(hand, suit) {
  const trumpLen = hand.filter((c) => c.suit === suit).length;
  const sideAces = hand.filter((c) => c.suit !== suit && c.rank === 'A').length;
  return trumpLen * 2 + sideAces * 3;
}

// Declarer marriage lead (tricks 2-6): declare promptly to bank the bonus, choosing which
// marriage by bonus + trump usefulness. Returns a lead-with-declare, or null.
function chooseMarriageLead(ctx) {
  const { legal, hand, trump, trickNumber } = ctx;
  if (trickNumber < 2 || trickNumber > 6) { return null; }
  const suits = findMarriages(legal).filter((s) => s !== trump);
  if (suits.length === 0) { return null; }
  const bestSuit = suits
    .map((suit) => ({ suit, score: MARRIAGE_BONUS[suit] + trumpUsefulness(hand, suit) }))
    .sort((a, b) => b.score - a.score)[0].suit;
  const king = legal.find((c) => c.rank === 'K' && c.suit === bestSuit);
  return king ? { cardId: king.cardId, declareMarriage: true } : null;
}

// Lead a low card from the longest non-trump side suit, keeping aces/tens. Null if none.
function chooseSafeLead(legal, reserved, trump) {
  const candidates = legal.filter((c) => !reserved.has(c.cardId)
    && c.suit !== trump && c.rank !== 'A' && c.rank !== '10');
  if (candidates.length === 0) { return null; }
  const bySuit = {};
  for (const c of candidates) { (bySuit[c.suit] ||= []).push(c); }
  const longest = Object.keys(bySuit).sort((a, b) => bySuit[b].length - bySuit[a].length)[0];
  return bySuit[longest].sort((a, b) => rankValue(a.rank) - rankValue(b.rank))[0];
}

// Leading a fresh trick.
function chooseLead(ctx) {
  const { legal, hand, trump, trickNumber, goneCardIds, currentTrick, deck, isDeclarer } = ctx;
  if (isDeclarer) {
    const marriage = chooseMarriageLead(ctx);
    if (marriage) { return marriage; }
  }
  const reserved = reservedMarriageCards(legal, trump, trickNumber);
  const context = { goneCardIds, hand, currentTrick, deck };
  const boss = legal
    .filter((c) => !reserved.has(c.cardId) && rankValue(c.rank) > 0 && isBossCard(c, context, trump))
    .sort((a, b) => rankValue(b.rank) - rankValue(a.rank))[0];
  if (boss) { return { cardId: boss.cardId }; }

  if (trump && hasTrumpControl(hand, context, trump)) {
    const trumps = legal.filter((c) => c.suit === trump)
      .sort((a, b) => rankStrength(b.rank) - rankStrength(a.rank));
    if (trumps.length > 0) { return { cardId: trumps[0].cardId }; }
  }
  const safe = chooseSafeLead(legal, reserved, trump);
  if (safe) { return { cardId: safe.cardId }; }
  const fallback = pickCard(legal.filter((c) => !reserved.has(c.cardId)), { highest: false })
    || pickCard(legal, { highest: false });
  return fallback ? { cardId: fallback.cardId } : null;
}

module.exports = { chooseLead, chooseFollow, reservedMarriageCards };
