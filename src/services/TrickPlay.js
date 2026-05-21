'use strict';

const { RANK_ORDER, MARRIAGE_BONUS } = require('./Scoring');

const MARRIAGE_FIRST_TRICK = 2;
const MARRIAGE_LAST_TRICK  = 6;

class TrickPlay {
  constructor(declarerSeat, deck) {
    this.declarerSeat = declarerSeat;
    this.deck = deck;

    this.trickNumber = 1;
    this.currentTrickLeaderSeat = declarerSeat;
    this.currentTurnSeat = declarerSeat;
    this.currentTrick = [];
    this.currentTrumpSuit = null;
    this.declaredMarriages = [];
    this.collectedTricks = { 0: [], 1: [], 2: [] };
    this.collectedTrickCounts = { 0: 0, 1: 0, 2: 0 };

    // Crawl sub-state (feature 007). Only ever active during trick 1 when an
    // ace-less declarer crawls. Commits accumulate here — never in the
    // face-exposing `currentTrick` — until the third lands (R-202).
    this.crawlActive = false;
    this.crawlCommits = [];
  }

  // FR-003: arm the crawl. Only valid on trick 1 with the declarer leading.
  // Idempotent — re-arming an active crawl is a harmless no-op.
  beginCrawl() {
    if (this.trickNumber !== 1 || this.currentTrickLeaderSeat !== this.declarerSeat) {
      return { rejected: true, reason: 'Crawl is only available on the first lead' };
    }
    this.crawlActive = true;
    return { rejected: false };
  }

  // FR-004/FR-006/FR-007: commit one card face-down. Follow-suit is suspended
  // (no _checkFollowSuit). On the third commit the three commits funnel into
  // `currentTrick` and resolve via the standard `_resolveTrick`, so winner
  // determination, collection, and the trick-2 advance are not reimplemented.
  commitCrawlCard(hands, seat, cardId) {
    if (!this.crawlActive) {
      return { rejected: true, reason: 'Crawl is not active' };
    }
    if (seat !== this.currentTurnSeat) {
      return { rejected: true, reason: 'Not your turn' };
    }
    if (!hands[seat].includes(cardId)) {
      return { rejected: true, reason: 'Card not in hand' };
    }

    hands[seat] = hands[seat].filter(id => id !== cardId);
    this.crawlCommits.push({ seat, cardId });
    this.currentTurnSeat = (seat + 1) % 3;
    const committedSeats = this.crawlCommits.map(c => c.seat);

    if (this.crawlCommits.length < 3) {
      return { rejected: false, crawlResolved: false, committedSeats, commits: this.crawlCommits.slice() };
    }

    // Third commit: the declarer's commit (index 0) sets the led suit.
    this.currentTrick = this.crawlCommits.map(({ seat: s, cardId: id }) => ({ seat: s, cardId: id }));
    const commits = this.crawlCommits.slice();
    const resolve = this._resolveTrick();
    this.crawlActive = false;
    this.crawlCommits = [];
    return { ...resolve, crawlResolved: true, commits, committedSeats };
  }

  playCard(hands, seat, cardId, _opts = {}) {
    if (seat !== this.currentTurnSeat) {
      return { rejected: true, reason: 'Not your turn' };
    }
    if (!hands[seat].includes(cardId)) {
      return { rejected: true, reason: 'Card not in hand' };
    }

    const followSuitRejection = this._checkFollowSuit(hands, seat, cardId);
    if (followSuitRejection) {return followSuitRejection;}

    hands[seat] = hands[seat].filter(id => id !== cardId);
    this.currentTrick.push({ seat, cardId });
    this.currentTurnSeat = (seat + 1) % 3;

    if (this.currentTrick.length === 3) {
      return this._resolveTrick();
    }

    return { rejected: false };
  }

  _checkFollowSuit(hands, seat, cardId) {
    if (this.currentTrick.length === 0) {return null;}

    const ledSuit = this.deck[this.currentTrick[0].cardId].suit;
    const playedSuit = this.deck[cardId].suit;

    if (playedSuit === ledSuit) {return null;}

    const hasLedSuit = hands[seat].some(id => this.deck[id].suit === ledSuit);
    if (hasLedSuit) {
      return { rejected: true, reason: 'You must follow suit' };
    }

    // T043: FR-007 trump-priority — out of led suit, must play trump if available
    if (this.currentTrumpSuit !== null) {
      const hasTrump = hands[seat].some(id => this.deck[id].suit === this.currentTrumpSuit);
      if (hasTrump && playedSuit !== this.currentTrumpSuit) {
        return { rejected: true, reason: 'You must play trump' };
      }
    }

    return null;
  }

  // T044: FR-010 — declare marriage (must be called before playing the card)
  declareMarriage(hands, seat, cardId) {
    if (this.currentTrick.length !== 0) {
      return { rejected: true, reason: 'Can only declare marriage when leading' };
    }

    if (this.trickNumber < MARRIAGE_FIRST_TRICK || this.trickNumber > MARRIAGE_LAST_TRICK) {
      return { rejected: true, reason: 'Marriage can only be declared on tricks 2 through 6' };
    }

    if (seat !== this.currentTrickLeaderSeat) {
      return { rejected: true, reason: 'Can only declare marriage when leading' };
    }

    const card = this.deck[cardId];
    if (card.rank !== 'K' && card.rank !== 'Q') {
      return { rejected: true, reason: 'Marriage can only be declared with K or Q' };
    }

    const suit = card.suit;
    const hasK = hands[seat].some(id => this.deck[id].suit === suit && this.deck[id].rank === 'K');
    const hasQ = hands[seat].some(id => this.deck[id].suit === suit && this.deck[id].rank === 'Q');
    if (!hasK || !hasQ) {
      return { rejected: true, reason: 'You do not hold both K and Q of that suit' };
    }

    const bonus = MARRIAGE_BONUS[suit];
    this.declaredMarriages.push({ playerSeat: seat, suit, bonus, trickNumber: this.trickNumber });
    this.currentTrumpSuit = suit;

    return { rejected: false, suit, bonus, newTrumpSuit: suit };
  }

  _resolveTrick() {
    const { winnerSeat, winningCardId } = this._determineWinner();

    const trickCardIds = this.currentTrick.map(c => c.cardId);
    for (const cardId of trickCardIds) {
      this.collectedTricks[winnerSeat].push(cardId);
    }
    this.collectedTrickCounts[winnerSeat] += 1;

    this.currentTrick = [];
    this.currentTrickLeaderSeat = winnerSeat;
    this.currentTurnSeat = winnerSeat;

    const result = { rejected: false, trickResolved: true, winnerSeat, winningCardId, trickCardIds };

    if (this.trickNumber < 8) {
      this.trickNumber += 1;
      return { ...result, roundComplete: false };
    }

    // trickNumber === 8: last trick
    return { ...result, roundComplete: true };
  }

  _determineWinner() {
    const ledSuit = this.deck[this.currentTrick[0].cardId].suit;
    const trumpCards = this.currentTrick.filter(
      c => this.deck[c.cardId].suit === this.currentTrumpSuit
    );
    const candidates = trumpCards.length > 0
      ? trumpCards
      : this.currentTrick.filter(c => this.deck[c.cardId].suit === ledSuit);

    const winner = candidates.reduce((a, b) =>
      RANK_ORDER[this.deck[a.cardId].rank] > RANK_ORDER[this.deck[b.cardId].rank] ? a : b
    );

    return { winnerSeat: winner.seat, winningCardId: winner.cardId };
  }
}

module.exports = TrickPlay;
