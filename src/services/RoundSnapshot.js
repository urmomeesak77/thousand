'use strict';

const { stepDest } = require('./DealSequencer');

const PHASE_LABELS = {
  'dealing': 'Dealing',
  'bidding': 'Bidding',
  'post-bid-decision': 'Declarer deciding',
  'selling-selection': 'Selling',
  'selling-bidding': 'Selling',
  'play-phase-ready': 'Round ready to play',
  'aborted': 'Round aborted',
};

function seatInfo(round, seat) {
  if (seat === null) {
    return null;
  }
  return { seat, nickname: round._store.players.get(round.seatOrder[seat]).nickname };
}

// passedBidders shown only during bidding; sell opponents shown only during selling-bidding
function passedNicknamesForCurrentPhase(round) {
  let passedSeats;
  if (round.phase === 'selling-bidding') {
    passedSeats = [...round.passedSellOpponents];
  } else if (round.phase === 'bidding') {
    passedSeats = [...round.passedBidders];
  } else {
    passedSeats = [];
  }
  return passedSeats.map((s) => round._store.players.get(round.seatOrder[s]).nickname);
}

// sellAttempt is 1-based: shown during selling phases and in post-bid-decision after a failed attempt
function currentSellAttempt(round) {
  if (round.phase === 'selling-bidding') {
    return round.attemptCount + 1;
  }
  const last = round.attemptHistory[round.attemptHistory.length - 1];
  if (round.phase === 'post-bid-decision' && last?.outcome === 'returned') {
    return round.attemptCount + 1;
  }
  return null;
}

function disconnectedNicknames(round) {
  return [...round.disconnectedSeats]
    .map((s) => round._store.players.get(round.seatOrder[s])?.nickname)
    .filter(Boolean);
}

function buildViewModel(round, seat) {
  return {
    phase: PHASE_LABELS[round.phase] ?? round.phase,
    activePlayer: seatInfo(round, round.currentTurnSeat),
    viewerIsActive: round.currentTurnSeat === seat,
    currentHighBid: round.currentHighBid,
    declarer: seatInfo(round, round.declarerSeat),
    passedPlayers: passedNicknamesForCurrentPhase(round),
    sellAttempt: currentSellAttempt(round),
    disconnectedPlayers: disconnectedNicknames(round),
  };
}

function buildSeatLayout(round, seat) {
  const players = round.seatOrder.map((pid, s) => ({
    seat: s,
    playerId: pid,
    nickname: round._store.players.get(pid).nickname,
  }));
  return {
    self: seat,
    left: (seat + 1) % 3,
    right: (seat + 2) % 3,
    dealer: round.dealerSeat,
    players,
  };
}

function buildHandIdentitiesFor(round, seat) {
  return round.hands[seat].map((id) => {
    const card = round.deck[id];
    return { id, rank: card.rank, suit: card.suit };
  });
}

function buildOpponentHandSizesFor(round, seat) {
  const sizes = {};
  for (const s of [0, 1, 2]) {
    if (s !== seat) {
      sizes[s] = round.hands[s].length;
    }
  }
  return sizes;
}

function buildDealSequenceFor(round, seat) {
  return round.deck.map((card, i) => {
    const to = stepDest(i);
    const step = { id: i, to };
    if (to === `seat${seat}`) {
      step.rank = card.rank;
      step.suit = card.suit;
    }
    return step;
  });
}

function buildSnapshot(round, seat) {
  const gameStatus = buildViewModel(round, seat);
  const payload = {
    type: 'round_state_snapshot',
    phase: gameStatus.phase,
    gameStatus,
    seats: buildSeatLayout(round, seat),
    myHand: buildHandIdentitiesFor(round, seat),
    opponentHandSizes: buildOpponentHandSizesFor(round, seat),
  };

  if (round.talon.length > 0) {
    payload.talonIds = [...round.talon];
  }

  // Deal sequence included so the client can replay the animation on reconnect
  // (only needed when no bids have been placed yet — after that, animating would be jarring)
  if (round.phase === 'bidding' && round.currentHighBid === null) {
    payload.dealSequence = buildDealSequenceFor(round, seat);
  }

  // Exposed sell card identities visible to all during selling-bidding
  if (round.phase === 'selling-bidding') {
    payload.exposed = round.exposedSellCards.map((id) => {
      const card = round.deck[id];
      return { id, rank: card.rank, suit: card.suit };
    });
  }

  if (round.exposedSellCards.length > 0) {
    payload.exposedSellCardIds = [...round.exposedSellCards];
  }

  return payload;
}

module.exports = {
  buildViewModel,
  buildSnapshot,
  buildSeatLayout,
  buildDealSequenceFor,
};
