'use strict';

const RoundSnapshot = require('../RoundSnapshot');
const {
  rankValue, rankStrength, roundDownToStep, findMarriages, pickCard,
  bestCenterCard, cardBeats, isBossCard, estimateMakeable, pickExchangeCard, MARRIAGE_BONUS,
} = require('./botStrategyHelpers');
const { MIN_BID, MAX_BID, BID_STEP, BARREL_BID_FLOOR, MAX_TALON_GAMBLE } = require('./botConstants');

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
      case 'post-bid-decision': return seat === round.declarerSeat ? { kind: 'startGame' } : null;
      case 'selling-bidding': return BotStrategy._decideSellBidding(round, seat);
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
    const safe = estimateMakeable(hand).value;
    const gamble = Math.round(aggressiveness * MAX_TALON_GAMBLE);
    const target = roundDownToStep(safe + gamble, BID_STEP);
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

  // A bot opponent never buys a sold hand in v1 — it passes the sell auction (legal,
  // completes the selling-phase obligation). The declarer itself never sells.
  static _decideSellBidding(round, seat) {
    if (seat === round.declarerSeat || round.currentTurnSeat !== seat) { return null; }
    return { kind: 'sellPass' };
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
    const hand = handCards(round, seat);
    if (seat !== round.declarerSeat) {
      // On the lead, cash a recalled boss card (the led card sets the suit, so a boss is
      // a guaranteed winner); otherwise dump the lowest legal card as in feature 009.
      if (round.currentTrick.length === 0) {
        const boss = BotStrategy._bossLead(round, legal, knowledge, hand);
        if (boss) { return { kind: 'playCard', cardId: boss.cardId }; }
      }
      return { kind: 'playCard', cardId: pickCard(legal, { highest: false }).cardId };
    }
    return round.currentTrick.length === 0
      ? BotStrategy._declarerLead(round, legal, knowledge, hand)
      : BotStrategy._declarerFollow(round, legal);
  }

  // Highest-point recalled boss card legal to lead, never a reserved marriage card.
  // Gated on non-empty recall so empty knowledge ⇒ feature-009 behaviour (S1); the boss
  // property is computed only from what the bot recalls as gone (S2).
  static _bossLead(round, legal, knowledge, hand, reserved = new Set()) {
    const goneCardIds = knowledge?.goneCardIds;
    if (!goneCardIds || goneCardIds.size === 0) { return null; }
    const context = { goneCardIds, hand, currentTrick: round.currentTrick, deck: round.deck };
    const trump = round.currentTrumpSuit;
    return legal
      .filter((c) => !reserved.has(c.cardId) && rankValue(c.rank) > 0 && isBossCard(c, context, trump))
      .sort((a, b) => rankValue(b.rank) - rankValue(a.rank))[0] ?? null;
  }

  // Declarer lead: declare the most valuable marriage in its legal window, else cash a
  // recalled boss card, else draw trumps, else lead the highest free card while
  // reserving a still-declarable marriage.
  static _declarerLead(round, legal, knowledge, hand) {
    const trump = round.currentTrumpSuit;
    const trickNumber = round.trickNumber;
    const marriageSuits = declarableMarriageSuits(legal, trump);
    if (trickNumber >= 2 && trickNumber <= 6) {
      for (const suit of marriageSuits) {
        const king = legal.find((c) => c.rank === 'K' && c.suit === suit);
        if (king) { return { kind: 'playCard', cardId: king.cardId, declareMarriage: true }; }
      }
    }
    const reserved = reservedMarriageCards(legal, marriageSuits, trickNumber);
    const boss = BotStrategy._bossLead(round, legal, knowledge, hand, reserved);
    if (boss) { return { kind: 'playCard', cardId: boss.cardId }; }
    if (trump) {
      const trumps = legal.filter((c) => c.suit === trump)
        .sort((a, b) => rankStrength(b.rank) - rankStrength(a.rank));
      if (trumps.length > 0) { return { kind: 'playCard', cardId: trumps[0].cardId }; }
    }
    const pool = legal.filter((c) => !reserved.has(c.cardId));
    const best = pickCard(pool.length > 0 ? pool : legal, { highest: true });
    return best ? { kind: 'playCard', cardId: best.cardId } : null;
  }

  // Declarer follow: win as cheaply as possible without spending a reserved marriage
  // card; otherwise discard the lowest free card, protecting K+Q for declaration.
  static _declarerFollow(round, legal) {
    const trump = round.currentTrumpSuit;
    const marriageSuits = findMarriages(legal).filter((s) => s !== trump);
    const reserved = reservedMarriageCards(legal, marriageSuits, round.trickNumber);
    const center = round.currentTrick.map(({ cardId }) => ({
      rank: round.deck[cardId].rank, suit: round.deck[cardId].suit,
    }));
    const best = bestCenterCard(center, trump);
    const winners = legal
      .filter((c) => !reserved.has(c.cardId) && cardBeats(c, best, trump))
      .sort((a, b) => rankStrength(a.rank) - rankStrength(b.rank));
    if (winners.length > 0) { return { kind: 'playCard', cardId: winners[0].cardId }; }
    const discardPool = legal.filter((c) => !reserved.has(c.cardId));
    const worst = pickCard(discardPool.length > 0 ? discardPool : legal, { highest: false });
    return worst ? { kind: 'playCard', cardId: worst.cardId } : null;
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

// Complete marriages held (excluding the current trump), highest-bonus first.
function declarableMarriageSuits(legal, trump) {
  return findMarriages(legal)
    .filter((s) => s !== trump)
    .sort((a, b) => MARRIAGE_BONUS[b] - MARRIAGE_BONUS[a]);
}

// The K/Q of still-declarable marriages, reserved (never spent) while a declaration
// remains reachable (before trick 6 ends).
function reservedMarriageCards(legal, marriageSuits, trickNumber) {
  if (trickNumber > 6) { return new Set(); }
  return new Set(
    legal
      .filter((c) => marriageSuits.includes(c.suit) && (c.rank === 'K' || c.rank === 'Q'))
      .map((c) => c.cardId),
  );
}

module.exports = BotStrategy;
