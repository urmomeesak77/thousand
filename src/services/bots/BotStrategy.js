'use strict';

const RoundSnapshot = require('../RoundSnapshot');
const trickPlanner = require('./trickPlanner');
const sellEvaluator = require('./sellEvaluator');
const {
  roundDownToStep, pickCard, estimateMakeable, pickExchangeCard,
} = require('./botStrategyHelpers');
const { MIN_BID, MAX_BID, BID_STEP, BARREL_BID_FLOOR, MAX_TALON_GAMBLE, SAFETY_MARGIN } = require('./botConstants');

// Maps the bot's current obligation in authoritative round state to a single legal
// action (a Bot Decision, see data-model.md). Every action it returns is validated
// again by the RoundActionHandler it is routed through, so an over-eager decision is
// rejected (a bug surfaced in tests) rather than reaching other players illegally.
//
// Bidding is scaled by the bot's persistent aggressiveness trait (FR-016/FR-017);
// every other phase uses one shared deterministic strategy ported from the smart
// end-to-end bot. v1 simplifications: the declarer never sells (always starts), a
// bot always declares a marriage when it can, and it declines the crawl.
class BotStrategy {
  // Returns a Bot Decision for the bot at `seat`, or null when it has no obligation.
  // `knowledge.goneCardIds` is the set of past-trick cards the bot recalls as played
  // (feature 010); the default empty set ⇒ behaviour identical to feature 009 (S1). The
  // strategy reads recalled-gone cards ONLY from here, never from round state (S2).
  static decide(round, seat, aggressiveness, knowledge = { goneCardIds: new Set() }) {
    if (!round) { return null; }
    switch (round.phase) {
      case 'bidding': return BotStrategy._decideBidding(round, seat, aggressiveness);
      case 'post-bid-decision': return BotStrategy._decidePostBid(round, seat, aggressiveness);
      case 'selling-selection': return seat === round.declarerSeat ? BotStrategy._decideSellSelection(round, seat) : null;
      case 'selling-bidding': return BotStrategy._decideSellBidding(round, seat, aggressiveness);
      case 'card-exchange': return seat === round.declarerSeat ? BotStrategy._decideExchange(round, seat) : null;
      case 'trick-play': return BotStrategy._decideTrickPlay(round, seat, knowledge);
      case 'round-summary': return BotStrategy._decideContinue(round, seat);
      default: return null;
    }
  }

  // Pure bid decision (FR-016/FR-017): safe makeable floor + an aggressiveness-scaled
  // talon gamble, rounded to the bid step and clamped to [floor, MAX_BID]. A cautious
  // bot whose target is below the floor passes — unless it is the forced last bidder.
  static decideBid(hand, aggressiveness, floor, { forced = false } = {}) {
    const expected = estimateMakeable(hand).value;
    const gamble = Math.round(aggressiveness * MAX_TALON_GAMBLE);
    // Bid below the mean expectation by a safety margin; aggressiveness erodes it.
    const target = roundDownToStep(expected - SAFETY_MARGIN + gamble, BID_STEP);
    if (target >= floor) {
      return { kind: 'bid', amount: Math.min(target, MAX_BID) };
    }
    if (forced) {
      return { kind: 'bid', amount: Math.min(floor, MAX_BID) };
    }
    return { kind: 'pass' };
  }

  static _decideBidding(round, seat, aggressiveness) {
    if (round.currentTurnSeat !== seat || round.isPausedByDisconnect) { return null; }
    const smallest = round.currentHighBid === null ? MIN_BID : round.currentHighBid + BID_STEP;
    const onBarrel = round._game?.session?.barrelState?.[seat]?.onBarrel;
    const floor = Math.max(smallest, onBarrel ? BARREL_BID_FLOOR : 0);
    const forced = round.currentHighBid === null && round.passedBidders.size === round.playerCount - 1;
    return BotStrategy.decideBid(handCards(round, seat), aggressiveness, floor, { forced });
  }

  // Declarer's post-bid decision: take a makeable hand, else start selling (FR-competent).
  // Sell at most once and never when the round has already disallowed it — a prior returned
  // auction bumps attemptCount and a prior sale blocks selling outright; re-selling there
  // would be silently rejected and stall the bot, so just take the hand.
  static _decidePostBid(round, seat, aggressiveness) {
    if (seat !== round.declarerSeat) { return null; }
    const sold = (round.attemptHistory || []).some((a) => a.outcome === 'sold');
    const attemptsLeft = (round.attemptCount || 0) > 0 || sold ? 0 : 1;
    return sellEvaluator.takeOrSell(handCards(round, seat), round.currentHighBid, aggressiveness, attemptsLeft);
  }

  // Declarer exposes its strongest cards (playerCount of them) to entice a buyer.
  static _decideSellSelection(round, seat) {
    const cardIds = sellEvaluator.chooseSellExposure(handCards(round, seat), round.playerCount);
    return cardIds.length === round.playerCount ? { kind: 'sellSelect', cardIds } : null;
  }

  // Opponent's sell-auction decision: buy a profitable exposed hand, else pass.
  static _decideSellBidding(round, seat, aggressiveness) {
    if (seat === round.declarerSeat || round.currentTurnSeat !== seat) { return null; }
    const exposed = (round.exposedSellCards || []).map((id) => ({ rank: round.deck[id].rank, suit: round.deck[id].suit }));
    return sellEvaluator.buyOrPass(handCards(round, seat), exposed, round.currentHighBid, aggressiveness, round.currentHighBid);
  }

  static _decideExchange(round, seat) {
    const card = pickExchangeCard(handCards(round, seat));
    const toSeat = nextExchangeDest(round, seat);
    if (!card || toSeat === null) { return null; }
    return { kind: 'exchangePass', cardId: card.cardId, toSeat };
  }

  static _decideTrickPlay(round, seat, knowledge) {
    if (round.fourNinesAckPending) {
      return round.fourNinesAcks.has(seat) ? null : { kind: 'acknowledgeFourNines' };
    }
    if (round.isPausedByDisconnect || round.currentTurnSeat !== seat) { return null; }
    if (round.crawlActive) {
      // Respond to a human declarer's crawl: commit the lowest card face-down
      // (follow-suit is suspended during a crawl, so any card is legal).
      const lowest = pickCard(handCards(round, seat), { highest: false });
      return lowest ? { kind: 'crawlCommit', cardId: lowest.cardId } : null;
    }
    const legal = legalCards(round, seat);
    if (legal.length === 0) { return null; }
    const ctx = {
      legal, hand: handCards(round, seat), trump: round.currentTrumpSuit,
      trickNumber: round.trickNumber, goneCardIds: knowledge.goneCardIds || new Set(),
      currentTrick: round.currentTrick, deck: round.deck, playerCount: round.playerCount,
      isDeclarer: seat === round.declarerSeat,
    };
    const decision = round.currentTrick.length === 0
      ? trickPlanner.chooseLead(ctx)
      : trickPlanner.chooseFollow(ctx);
    if (!decision) { return null; }
    return {
      kind: 'playCard', cardId: decision.cardId,
      ...(decision.declareMarriage ? { declareMarriage: true } : {}),
    };
  }

  static _decideContinue(round, seat) {
    const presses = round._game?.session?.continuePresses;
    if (presses?.has(seat)) { return null; }
    return { kind: 'continueToNextRound' };
  }
}

// ── module-private pure helpers ────────────────────────────────────────────────

function handCards(round, seat) {
  return round.hands[seat].map((id) => ({ cardId: id, rank: round.deck[id].rank, suit: round.deck[id].suit }));
}

function legalCards(round, seat) {
  return RoundSnapshot.computeLegalCardIds(round, seat)
    .map((id) => ({ cardId: id, rank: round.deck[id].rank, suit: round.deck[id].suit }));
}

function nextExchangeDest(round, declarerSeat) {
  for (let s = 0; s < round.playerCount; s++) {
    if (s !== declarerSeat && !round._usedExchangeDestSeats.has(s)) { return s; }
  }
  return null;
}

module.exports = BotStrategy;
