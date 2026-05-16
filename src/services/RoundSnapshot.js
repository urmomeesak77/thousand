'use strict';

const { stepDest } = require('./DealSequencer');
const Scoring = require('./Scoring');

const PHASE_LABELS = {
  'dealing': 'Dealing',
  'bidding': 'Bidding',
  'post-bid-decision': 'Declarer deciding',
  'selling-selection': 'Selling',
  'selling-bidding': 'Selling',
  'play-phase-ready': 'Round ready to play',
  'card-exchange': 'Card exchange',
  'trick-play': 'Trick play',
  'round-summary': 'Round complete',
  'aborted': 'Round aborted',
};

function seatInfo(round, seat) {
  if (seat === null) {
    return null;
  }
  const player = round._store.players.get(round.seatOrder[seat]);
  return { seat, nickname: player?.nickname ?? null };
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
  return passedSeats
    .map((s) => round._store.players.get(round.seatOrder[s])?.nickname)
    .filter(Boolean);
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
  const session = round._game?.session;
  const isPhaseFinal = round.phase === 'round-summary' || session?.gameStatus === 'game-over';
  return {
    phase: PHASE_LABELS[round.phase] ?? round.phase,
    activePlayer: seatInfo(round, round.currentTurnSeat),
    viewerIsActive: round.currentTurnSeat === seat,
    currentHighBid: round.currentHighBid,
    declarer: seatInfo(round, round.declarerSeat),
    passedPlayers: passedNicknamesForCurrentPhase(round),
    sellAttempt: currentSellAttempt(round),
    disconnectedPlayers: disconnectedNicknames(round),
    trickNumber: round.trickNumber > 0 ? round.trickNumber : null,
    currentTrumpSuit: round.currentTrumpSuit ?? null,
    cumulativeScores: session ? session.cumulativeScores : { 0: 0, 1: 0, 2: 0 },
    collectedTrickCounts: round.collectedTrickCounts ?? { 0: 0, 1: 0, 2: 0 },
    legalCardIds: round.phase === 'trick-play' ? _computeLegalCardIds(round, seat) : null,
    viewerIsLeading: round.phase === 'trick-play'
      && round.currentTurnSeat === seat
      && (round.currentTrick?.length ?? 0) === 0,
    exchangePassesCommitted: round.phase === 'card-exchange' ? round.exchangePassesCommitted : null,
    exchangePassesToSeats: round.phase === 'card-exchange' ? [...round._usedExchangeDestSeats] : null,
    continuePressedSeats: isPhaseFinal && session ? [...session.continuePresses] : null,
    roundNumber: session ? session.currentRoundNumber : 1,
    // Absent when no player is on barrel (null entry per seat when onBarrel === false)
    barrelMarkers: session
      ? Object.fromEntries([0, 1, 2].map(s => [s, session.barrelState[s].onBarrel
        ? { onBarrel: true, barrelRoundsUsed: session.barrelState[s].barrelRoundsUsed }
        : null]))
      : null,
  };
}

function buildSeatLayout(round, seat) {
  const players = round.seatOrder.map((pid, s) => ({
    seat: s,
    playerId: pid,
    nickname: round._store.players.get(pid)?.nickname ?? null,
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

// Returns the card IDs that are legal to play for the given seat on their turn.
// Enforces follow-suit; if not their turn, returns [].
function _computeLegalCardIds(round, seat) {
  if (round.currentTurnSeat !== seat) {
    return [];
  }
  const hand = round.hands[seat];
  if (!round.currentTrick || round.currentTrick.length === 0) {
    return hand; // leading — all cards legal
  }
  const ledCardId = round.currentTrick[0].cardId;
  const ledSuit = round.deck[ledCardId]?.suit;
  if (!ledSuit) {
    return hand;
  }
  const followSuitCards = hand.filter((id) => round.deck[id]?.suit === ledSuit);
  if (followSuitCards.length > 0) { return followSuitCards; }
  // Out of led suit — must play trump if held (trump-priority rule)
  const trumpSuit = round.currentTrumpSuit;
  if (trumpSuit) {
    const trumpCards = hand.filter((id) => round.deck[id]?.suit === trumpSuit);
    if (trumpCards.length > 0) { return trumpCards; }
  }
  return hand;
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

  if (round.phase === 'card-exchange') {
    payload.exchangePassesCommitted = round.exchangePassesCommitted;
    payload.exchangePassesToSeats = [...round._usedExchangeDestSeats];
    payload.myHand = buildHandIdentitiesFor(round, seat);
    payload.receivedFromExchange = null;
    payload.isDeclarerView = seat === round.declarerSeat;
    payload.isMyTurn = round.currentTurnSeat === seat;
  }

  if (round.phase === 'trick-play') {
    payload.trickNumber = round.trickNumber;
    payload.currentTrickLeaderSeat = round.currentTrickLeaderSeat;
    payload.currentTrick = round.currentTrick.map(({ seat: s, cardId }) => {
      const card = round.deck[cardId];
      return { seat: s, cardId, rank: card.rank, suit: card.suit };
    });
    payload.currentTrumpSuit = round.currentTrumpSuit;
    payload.declaredMarriages = [...round.declaredMarriages];
    payload.collectedTrickCounts = { ...round.collectedTrickCounts };
    payload.myHand = buildHandIdentitiesFor(round, seat);
    payload.isMyTurn = round.currentTurnSeat === seat;
    payload.legalCardIds = _computeLegalCardIds(round, seat);
  }

  if (round.phase === 'round-summary') {
    payload.summary = round.summary;
    const myCollected = round.collectedTricks?.[seat] ?? [];
    payload.viewerCollectedCards = myCollected.map((id) => {
      const card = round.deck[id];
      return { rank: card.rank, suit: card.suit };
    });
    const session = round._game?.session;
    payload.continuePressedSeats = session ? [...session.continuePresses] : [];
  }

  // Final-results snapshot for game-over
  const session = round._game?.session;
  if (session?.gameStatus === 'game-over') {
    payload.finalResults = Scoring.buildFinalResults(session);
  }

  return payload;
}

module.exports = {
  buildViewModel,
  buildSnapshot,
  buildSeatLayout,
  buildDealSequenceFor,
};
