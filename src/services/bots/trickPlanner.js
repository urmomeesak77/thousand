'use strict';

const {
  findMarriages, pickCard, bestCenterCard,
  cheapestWinner, isBossCard, trickPoints,
} = require('./botStrategyHelpers');

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
  const { legal, hand, trump, currentTrick, deck, goneCardIds, playerCount, trickNumber } = ctx;
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
  }
  const duck = pickCard(pool, { highest: false });
  return duck ? { cardId: duck.cardId } : null;
}

module.exports = { chooseFollow, reservedMarriageCards };
