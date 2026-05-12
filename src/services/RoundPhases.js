'use strict';

// Move talon cards into the declarer's hand; returns { talonIds, identities } for the talon_absorbed broadcast.
// Caller must set round.talon = [] after calling.
function absorbTalon({ hands, talon, deck, declarerSeat }) {
  const talonIds = [...talon];
  const identities = {};
  for (const id of talonIds) {
    const card = deck[id];
    identities[id] = { rank: card.rank, suit: card.suit };
  }
  for (const id of talonIds) {
    hands[declarerSeat].push(id);
  }
  return { talonIds, identities };
}

// Opponents eligible to bid in the sell auction (neither the declarer nor already passed)
function activeSellOpponents(declarerSeat, passedSellOpponents) {
  return [0, 1, 2].filter(s => s !== declarerSeat && !passedSellOpponents.has(s));
}

// Next sell opponent in clockwise order from fromSeat (skipping declarer and already-passed opponents)
function nextSellOpponent(fromSeat, declarerSeat, passedSellOpponents) {
  for (let i = 1; i <= 2; i++) {
    const candidate = (fromSeat + i) % 3;
    if (candidate !== declarerSeat && !passedSellOpponents.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

// Resolve a sell auction where the buyer wins; mutates hands and attemptHistory.
// Caller must update round.declarerSeat, round.currentTurnSeat, round.phase, round.exposedSellCards after.
function resolveSellSold({ hands, exposedSellCards, declarerSeat, lastSellBidderSeat, attemptHistory }) {
  const buyerSeat = lastSellBidderSeat;
  const oldDeclarerSeat = declarerSeat;
  const exposedIds = [...exposedSellCards];
  hands[buyerSeat] = [...hands[buyerSeat], ...exposedIds];
  attemptHistory.push({ outcome: 'sold', exposedIds });
  return { rejected: false, resolved: true, outcome: 'sold', buyerSeat, oldDeclarerSeat, exposedIds };
}

// Resolve a sell auction where all opponents pass; mutates hands and attemptHistory.
// Caller must increment attemptCount and update round.currentTurnSeat, round.phase, round.exposedSellCards after.
function resolveSellReturned({ hands, declarerSeat, exposedSellCards, attemptHistory }) {
  const exposedIds = [...exposedSellCards];
  hands[declarerSeat] = [...hands[declarerSeat], ...exposedIds];
  attemptHistory.push({ outcome: 'returned', exposedIds });
  return { rejected: false, resolved: true, outcome: 'returned', exposedIds };
}

module.exports = { absorbTalon, activeSellOpponents, nextSellOpponent, resolveSellSold, resolveSellReturned };
