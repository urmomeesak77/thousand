'use strict';

// Deal sequencing → DealSequencer.js; phase-transition helpers → RoundPhases.js;
// snapshot/view-model serialization → RoundSnapshot.js
const { makeDeck, shuffle } = require('./Deck');
const { buildDealDistribution } = require('./DealSequencer');
const { stackedDeckForTest } = require('./testDeckStacking');
const { MARRIAGE_BONUS, applyPenaltyAnnotations, findFourNinesSeat, handHasAce } = require('./Scoring');
const { FOUR_NINES_BONUS } = require('./GameRules');
const {
  absorbTalon, activeSellOpponents, nextSellOpponent, resolveSellSold, resolveSellReturned,
} = require('./RoundPhases');
const RoundSnapshot = require('./RoundSnapshot');
const TrickPlay = require('./TrickPlay');
const { seatRange, initSeatMap } = require('./Seats');

const MIN_BID = 100;
const MAX_BID = 300;
const BID_STEP = 5;
const BARREL_BID_FLOOR = 120;
const MAX_SELL_ATTEMPTS = 3;

class Round {
  constructor({ game, store }) {
    this._game = game;
    this._store = store;

    // playerCount (3 or 4) drives every seat range, rotation modulus, deck/talon size,
    // exchange-pass count, trick width, and sell-selection size. Source of truth is the
    // game record's requiredPlayers (mirrored onto the Game session). Defaults to 3 for
    // tests that build Round without a session/record so 3-player behavior is unchanged.
    this.playerCount = game.session?.playerCount ?? game.requiredPlayers ?? 3;

    // seat 0 = Dealer = 1st joiner (host), seat 1 = P1 = 2nd joiner, seat 2 = P2 = 3rd joiner.
    // After round 1, session.dealerSeat is rotated clockwise (FR-016); inherit it so every
    // new Round honors the rotation. Falls back to 0 for tests that build Round without a session.
    this.dealerSeat = game.session?.dealerSeat ?? 0;
    this.seatOrder = [...game.players];
    this.seatByPlayer = new Map(this.seatOrder.map((pid, idx) => [pid, idx]));

    // phase ∈ { 'dealing' | 'bidding' | 'post-bid-decision' | 'selling-selection' |
    //           'selling-bidding' | 'play-phase-ready' | 'card-exchange' | 'trick-play' |
    //           'round-summary' | 'aborted' }
    this.phase = 'dealing';
    this.deck = null;
    this.hands = initSeatMap(this.playerCount, () => []);
    this.talon = [];
    this.exposedSellCards = [];
    this.currentTurnSeat = null;
    this.currentHighBid = null;
    this.bidHistory = [];
    this.passedBidders = new Set();
    this.passedSellOpponents = new Set();
    this._lastSellBidderSeat = null;
    this.declarerSeat = null;
    this.attemptCount = 0;
    this.attemptHistory = [];
    this.isPausedByDisconnect = false;
    this.disconnectedSeats = new Set();

    // Phase 3 fields (card-exchange + trick-play + round-summary)
    this.trickNumber = 0;
    this.currentTrickLeaderSeat = null;
    this.currentTrick = [];
    this.currentTrumpSuit = null;
    this.declaredMarriages = [];
    this.collectedTricks = initSeatMap(this.playerCount, () => []);
    this.collectedTrickCounts = initSeatMap(this.playerCount, 0);
    this.playedLog = [];  // feature 010: cards-already-gone timeline, mirrored from TrickPlay
    this.leadLog = [];    // clubs-combo easter egg: per-trick lead cards, mirrored from TrickPlay
    this.exchangePassesCommitted = 0;
    this._usedExchangeDestSeats = new Set();
    this.roundScores = null;
    this.roundDeltas = null;
    this.summary = null;
    this._trickPlay = null;  // TrickPlay instance, set on entry to trick-play phase

    // Four-nines bonus (feature 006). Detected once at the card-exchange →
    // trick-play transition; the ack-gate holds the first lead until all three
    // players acknowledge (FR-001, FR-003, FR-005).
    this.fourNinesAward = null;          // { seat, amount } | null
    this.fourNinesAckPending = false;
    this.fourNinesAcks = new Set();      // seats that acknowledged (sticky, FR-010)

    // Crawl sub-state (feature 007), mirrored from _trickPlay for snapshot/view-model.
    this.crawlActive = false;
    this.crawlCommits = [];
  }

  start() {
    const ordered = stackedDeckForTest(this.playerCount) ?? shuffle(makeDeck(this.playerCount));
    this.deck = ordered.map((card, i) => ({ id: i, rank: card.rank, suit: card.suit }));
    const dist = buildDealDistribution(this.playerCount);
    this.hands = dist.hands;
    this.talon = dist.talon;
    this.phase = 'dealing';
    this.currentTurnSeat = null;
    this.currentHighBid = null;
  }

  getRoundStartedPayloadFor(playerId) {
    const selfSeat = this.seatByPlayer.get(playerId);
    return {
      type: 'round_started',
      seats: RoundSnapshot.buildSeatLayout(this, selfSeat),
      dealSequence: RoundSnapshot.buildDealSequenceFor(this, selfSeat),
      gameStatus: RoundSnapshot.buildViewModel(this, selfSeat),
    };
  }

  advanceFromDealingToBidding() {
    if (this.phase !== 'dealing') {return;}
    this.phase = 'bidding';
    // P1 (clockwise-left of Dealer) bids first per FR-004
    this.currentTurnSeat = (this.dealerSeat + 1) % this.playerCount;
  }

  submitBid(seat, amount) {
    if (this.phase !== 'bidding') {return { rejected: true, reason: 'Not in bidding phase' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (seat !== this.currentTurnSeat) {return { rejected: true, reason: 'Not your turn' };}
    if (!Number.isInteger(amount)) {return { rejected: true, reason: 'Bid must be an integer' };}
    if (amount % BID_STEP !== 0) {return { rejected: true, reason: `Bid must be a multiple of ${BID_STEP}` };}
    if (amount > MAX_BID) {return { rejected: true, reason: `Bid cannot exceed ${MAX_BID}` };}
    if (this._game.session?.barrelState?.[seat]?.onBarrel && amount < BARREL_BID_FLOOR) {
      return { rejected: true, reason: `Players on barrel must bid at least ${BARREL_BID_FLOOR}.` };
    }
    const smallest = this.currentHighBid === null ? MIN_BID : this.currentHighBid + BID_STEP;
    if (amount < smallest) {return { rejected: true, reason: `Bid must be at least ${smallest}` };}

    this.bidHistory.push({ seat, amount });
    this.currentHighBid = amount;

    // If every other seat has already passed, this bid resolves the auction:
    // the bidder is the declarer (this is the forced-last-bidder take/raise path).
    const remaining = seatRange(this.playerCount).filter(s => !this.passedBidders.has(s));
    if (remaining.length === 1) {
      this.declarerSeat = seat;
      this.phase = 'post-bid-decision';
      this.currentTurnSeat = seat;
      const { talonIds, identities } = this._absorbTalon();
      return { rejected: false, resolved: true, talonIds, identities };
    }

    this.currentTurnSeat = this._nextActiveBidder(seat);
    return { rejected: false };
  }

  submitPass(seat) {
    if (this.phase !== 'bidding') {return { rejected: true, reason: 'Not in bidding phase' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (seat !== this.currentTurnSeat) {return { rejected: true, reason: 'Not your turn' };}

    // Forced last bidder: if every other seat has already passed and no bid was
    // placed, this seat must take the contract. They cannot pass. The floor is
    // MIN_BID, or BARREL_BID_FLOOR when this seat is on barrel (FR-022).
    if (this.currentHighBid === null && this.passedBidders.size === this.playerCount - 1) {
      const floor = this._game.session?.barrelState?.[seat]?.onBarrel ? BARREL_BID_FLOOR : MIN_BID;
      return { rejected: true, reason: `You must bid at least ${floor}; you cannot pass.` };
    }

    this.passedBidders.add(seat);
    this.bidHistory.push({ seat, amount: null });

    const remaining = seatRange(this.playerCount).filter(s => !this.passedBidders.has(s));
    if (remaining.length === 1 && this.currentHighBid !== null) {
      // A real bid exists and the last opponent just passed — resolve to that sole survivor.
      this.declarerSeat = remaining[0];
      this.phase = 'post-bid-decision';
      this.currentTurnSeat = remaining[0];
      const { talonIds, identities } = this._absorbTalon();
      return { rejected: false, resolved: true, talonIds, identities };
    } else {
      // Either more bidders remain, or no bid has been placed yet (forced-last-bidder path:
      // the sole survivor must take a real bidding turn before the auction resolves).
      this.currentTurnSeat = this._nextActiveBidder(seat);
    }

    return { rejected: false };
  }

  // Bounded version of "advance until non-passed seat" — `bidding` is unreachable
  // when all seats have passed (submitPass would have resolved to declarer at
  // length-1), but a bounded loop documents the invariant and prevents future
  // changes to the resolution logic from creating an infinite loop here.
  _nextActiveBidder(fromSeat) {
    for (let i = 1; i <= this.playerCount; i++) {
      const candidate = (fromSeat + i) % this.playerCount;
      if (!this.passedBidders.has(candidate)) {return candidate;}
    }
    return fromSeat;
  }

  getViewModelFor(seat) {
    return RoundSnapshot.buildViewModel(this, seat);
  }

  markDisconnected(seat) {
    this.disconnectedSeats.add(seat);
    if (seat === this.currentTurnSeat) {this.isPausedByDisconnect = true;}
  }

  markReconnected(seat) {
    this.disconnectedSeats.delete(seat);
    if (seat === this.currentTurnSeat) {this.isPausedByDisconnect = false;}
  }

  abort() {
    this.phase = 'aborted';
    this.currentTurnSeat = null;
  }

  getSnapshotFor(seat) {
    return RoundSnapshot.buildSnapshot(this, seat);
  }

  startGame(seat) {
    if (this.phase === 'card-exchange') {return { noop: true };}
    if (this.phase !== 'post-bid-decision') {return { rejected: true, reason: 'Not in decision phase' };}
    if (seat !== this.declarerSeat) {return { rejected: true, reason: 'Only the declarer can start the game' };}
    this.phase = 'card-exchange';
    this.currentTurnSeat = this.declarerSeat;
    this.exchangePassesCommitted = 0;
    this._usedExchangeDestSeats = new Set();
    return { noop: false, declarerId: this.seatOrder[this.declarerSeat], finalBid: this.currentHighBid };
  }

  // T017 — FR-002/FR-003: card exchange
  submitExchangePass(seat, cardId, destSeat) {
    if (this.phase !== 'card-exchange') {return { rejected: true, reason: 'Not in card-exchange phase' };}
    if (seat !== this.declarerSeat) {return { rejected: true, reason: 'Only the declarer can pass cards' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (!this.hands[seat].includes(cardId)) {return { rejected: true, reason: 'Card not in hand' };}
    // Reject before the `hands[destSeat].push` below — an out-of-range key (e.g. 99,
    // null, "foo") makes `this.hands[destSeat]` undefined and crashes the WS handler.
    if (!Number.isInteger(destSeat) || destSeat < 0 || destSeat >= this.playerCount) {
      return { rejected: true, reason: 'Invalid destination seat' };
    }
    if (destSeat === this.declarerSeat) {return { rejected: true, reason: 'Cannot pass to yourself' };}
    if (this._usedExchangeDestSeats.has(destSeat)) {
      return { rejected: true, reason: 'Already passed to that opponent' };
    }

    this.hands[seat] = this.hands[seat].filter(id => id !== cardId);
    this.hands[destSeat].push(cardId);
    this._usedExchangeDestSeats.add(destSeat);
    this.exchangePassesCommitted += 1;

    // After the declarer has passed one card to each opponent: transition to trick-play.
    if (this.exchangePassesCommitted === this.playerCount - 1) {
      this.phase = 'trick-play';
      this.trickNumber = 1;
      this.currentTrickLeaderSeat = this.declarerSeat;
      this.currentTurnSeat = this.declarerSeat;
      this._trickPlay = new TrickPlay(this.declarerSeat, this.deck, this.playerCount);
      this._detectFourNines();
      return { rejected: false, transitionedToTrickPlay: true, cardId, destSeat, fourNinesAward: this.fourNinesAward };
    }

    return { rejected: false, cardId, destSeat };
  }

  // FR-001/FR-003/FR-005: at trick-play start, award the four-nines bonus to the
  // seat (if any) whose 8-card hand holds all four 9s and open the ack-gate.
  // Idempotent: only fires when no award has been recorded yet.
  _detectFourNines() {
    if (this.fourNinesAward) {return;}
    const seat = findFourNinesSeat(this.hands, this.deck, this.playerCount);
    if (seat === null) {return;}
    this.fourNinesAward = { seat, amount: FOUR_NINES_BONUS };
    this.fourNinesAckPending = true;
    this.fourNinesAcks = new Set();
  }

  // FR-003: record a player's acknowledgment (sticky/idempotent). Closes the gate
  // once every seat has acknowledged. Returns whether the gate just closed.
  recordFourNinesAck(seat) {
    if (!this.fourNinesAckPending) {return { changed: false, gateClosed: false };}
    const sizeBefore = this.fourNinesAcks.size;
    this.fourNinesAcks.add(seat);
    const changed = this.fourNinesAcks.size !== sizeBefore;
    if (this.fourNinesAcks.size === this.playerCount) {this.fourNinesAckPending = false;}
    return { changed, gateClosed: !this.fourNinesAckPending, acknowledgedSeats: [...this.fourNinesAcks] };
  }

  // Lazily create the TrickPlay instance if the round was forced into trick-play
  // phase without going through submitExchangePass, syncing any pre-set Round
  // fields into it. Idempotent: a no-op once _trickPlay exists.
  _ensureTrickPlay() {
    if (this._trickPlay) {return;}
    this._trickPlay = new TrickPlay(this.currentTrickLeaderSeat ?? this.declarerSeat, this.deck, this.playerCount);
    this._trickPlay.trickNumber = this.trickNumber;
    this._trickPlay.currentTrickLeaderSeat = this.currentTrickLeaderSeat;
    this._trickPlay.currentTurnSeat = this.currentTurnSeat;
    this._trickPlay.currentTrick = this.currentTrick;
    this._trickPlay.collectedTricks = this.collectedTricks;
    this._trickPlay.currentTrumpSuit = this.currentTrumpSuit;
    this._trickPlay.declaredMarriages = this.declaredMarriages;
    this._trickPlay.playedLog = this.playedLog;
    this._trickPlay.leadLog = this.leadLog;
  }

  // T044 — delegate to TrickPlay.declareMarriage
  declareMarriage(seat, cardId) {
    if (this.phase !== 'trick-play') {return { rejected: true, reason: 'Not in trick-play phase' };}

    this._ensureTrickPlay();

    const result = this._trickPlay.declareMarriage(this.hands, seat, cardId);
    if (result.rejected) {return result;}

    // Sync state back to Round fields
    this.currentTrumpSuit = this._trickPlay.currentTrumpSuit;
    this.declaredMarriages = this._trickPlay.declaredMarriages;

    return result;
  }

  // T018 — delegate to TrickPlay
  playCard(seat, cardId, opts = {}) {
    if (this.phase !== 'trick-play') {return { rejected: true, reason: 'Not in trick-play phase' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (this.fourNinesAckPending) {return { rejected: true, reason: 'Acknowledge the four-nines bonus first' };}
    // While a crawl is active every card is committed face-down via crawl_commit.
    // A face-up play_card here would land in the (still-empty) currentTrick,
    // bypass follow-suit, split state across crawlCommits/currentTrick, and
    // orphan the declarer's committed card. Reject it.
    if (this._trickPlay?.crawlActive) {
      return { rejected: true, reason: 'Crawl in progress — commit your card face-down' };
    }

    this._ensureTrickPlay();

    const result = this._trickPlay.playCard(this.hands, seat, cardId, opts);
    if (result.rejected) {return result;}

    this._syncTrickState();

    if (result.trickResolved && result.roundComplete) {
      this.phase = 'round-summary';
      this.currentTurnSeat = null;
      // roundScores and buildSummary will be called by the controller (T027)
    }

    return result;
  }

  // Mirror TrickPlay state onto Round fields for snapshot/view-model. Shared by
  // playCard and the crawl methods so the two paths can never drift.
  _syncTrickState() {
    this.trickNumber = this._trickPlay.trickNumber;
    this.currentTrickLeaderSeat = this._trickPlay.currentTrickLeaderSeat;
    this.currentTurnSeat = this._trickPlay.currentTurnSeat;
    this.currentTrick = this._trickPlay.currentTrick;
    this.collectedTricks = this._trickPlay.collectedTricks;
    this.collectedTrickCounts = this._trickPlay.collectedTrickCounts;
    this.crawlActive = this._trickPlay.crawlActive;
    this.crawlCommits = this._trickPlay.crawlCommits;
    this.playedLog = this._trickPlay.playedLog;
    this.leadLog = this._trickPlay.leadLog;
  }

  // FR-003: arm the crawl for an eligible ace-less declarer. The trick-1/leader
  // check lives in TrickPlay; the declarer + ace-eligibility checks need the
  // hands/deck and live here.
  beginCrawl(seat) {
    if (this.phase !== 'trick-play') {return { rejected: true, reason: 'Not in trick-play phase' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (this.fourNinesAckPending) {return { rejected: true, reason: 'Acknowledge the four-nines bonus first' };}
    if (seat !== this.declarerSeat) {return { rejected: true, reason: 'Only the declarer can crawl' };}
    if (handHasAce(this.hands[this.declarerSeat], this.deck)) {
      return { rejected: true, reason: 'You hold an ace — cannot crawl' };
    }

    this._ensureTrickPlay();
    const result = this._trickPlay.beginCrawl();
    if (result.rejected) {return result;}
    this._syncTrickState();
    return result;
  }

  // FR-004/FR-006/FR-007: commit one card face-down. The declarer's first commit
  // auto-arms the crawl (the wire message is a bare crawl_commit, disambiguated
  // by turn order — research Decision 4). On the third commit TrickPlay resolves
  // the trick and advances to trick 2.
  commitCrawlCard(seat, cardId) {
    if (this.phase !== 'trick-play') {return { rejected: true, reason: 'Not in trick-play phase' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (this.fourNinesAckPending) {return { rejected: true, reason: 'Acknowledge the four-nines bonus first' };}

    this._ensureTrickPlay();
    if (!this._trickPlay.crawlActive) {
      // Specific reason for opponents who fire ahead of the declarer's
      // initiating commit — bubbling up beginCrawl's "Only the declarer can
      // crawl" would imply they're trying to initiate, not just out of turn.
      if (seat !== this.declarerSeat) {
        return { rejected: true, reason: 'Wait for the declarer to crawl first' };
      }
      const begin = this.beginCrawl(seat);
      if (begin.rejected) {return begin;}
    }

    const result = this._trickPlay.commitCrawlCard(this.hands, seat, cardId);
    if (result.rejected) {return result;}
    this._syncTrickState();
    return result;
  }

  // T019 — FR-015: assemble RoundSummary view-model
  buildSummary(_game) {
    const { roundScores: scores, roundDeltas: deltas } = this;

    const marriageBonusBySeat = initSeatMap(this.playerCount, 0);
    for (const m of this.declaredMarriages) {
      marriageBonusBySeat[m.playerSeat] += MARRIAGE_BONUS[m.suit] ?? 0;
    }

    const perPlayer = {};
    for (const seat of seatRange(this.playerCount)) {
      const pid = this.seatOrder[seat];
      const player = this._store.players.get(pid);
      const marriageBonus = marriageBonusBySeat[seat];
      const roundTotal = scores ? scores[seat] : 0;
      const trickPoints = roundTotal - marriageBonus;
      const delta = deltas ? deltas[seat] : 0;
      perPlayer[seat] = {
        nickname: player?.nickname ?? null,
        seat,
        trickPoints,
        marriageBonus,
        roundTotal,
        delta,
        cumulativeAfter: delta,  // US3 replaces
        penalties: [],
        // FR-008: distinct four-nines line item on the awarded seat's row.
        fourNinesBonus: this.fourNinesAward?.seat === seat ? this.fourNinesAward.amount : 0,
      };
    }

    // FR-023/FR-024: pre-compute which penalties will fire this round before applyRoundEnd runs.
    const session = this._game?.session;
    if (session && deltas) {
      applyPenaltyAnnotations(session, perPlayer, deltas);
    }

    this.summary = {
      roundNumber: 1,  // US3 replaces with game.currentRoundNumber
      declarerSeat: this.declarerSeat,
      declarerNickname: this._store.players.get(this.seatOrder[this.declarerSeat])?.nickname ?? null,
      bid: this.currentHighBid,
      declarerMadeBid: scores ? scores[this.declarerSeat] >= this.currentHighBid : false,
      perPlayer,
      viewerCollectedCards: [],  // per-viewer, filled by RoundSnapshot
      victoryReached: false,  // US3 replaces
    };
    return this.summary;
  }

  startSelling(seat) {
    if (this.phase !== 'post-bid-decision') {return { rejected: true, reason: 'Not in decision phase' };}
    if (seat !== this.declarerSeat) {return { rejected: true, reason: 'Only the declarer can start selling' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (this.attemptHistory.some((a) => a.outcome === 'sold')) {
      return { rejected: true, reason: 'Selling is no longer available' };
    }
    if (this.attemptCount >= MAX_SELL_ATTEMPTS) {return { rejected: true, reason: 'No selling attempts remaining' };}
    this.phase = 'selling-selection';
    return { rejected: false };
  }

  cancelSelling(seat) {
    if (this.phase !== 'selling-selection') {return { rejected: true, reason: 'Not in selling-selection phase' };}
    if (seat !== this.declarerSeat) {return { rejected: true, reason: 'Only the declarer can cancel selling' };}
    this.phase = 'post-bid-decision';
    return { rejected: false };
  }

  commitSellSelection(seat, cardIds) {
    if (this.phase !== 'selling-selection') {return { rejected: true, reason: 'Not in selling-selection phase' };}
    if (seat !== this.declarerSeat) {return { rejected: true, reason: 'Only the declarer can select cards' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (!Array.isArray(cardIds) || cardIds.length !== this.playerCount) {
      return { rejected: true, reason: `Exactly ${this.playerCount} cards must be selected` };
    }
    if (new Set(cardIds).size !== this.playerCount) {
      return { rejected: true, reason: 'Cards must be distinct' };
    }
    const hand = this.hands[this.declarerSeat];
    for (const id of cardIds) {
      if (!hand.includes(id)) {return { rejected: true, reason: 'Card is not in your hand' };}
    }
    // FR-016: selection must differ from every prior attempt's exposed set
    const sortedNew = [...cardIds].sort((a, b) => a - b);
    for (const entry of this.attemptHistory) {
      const sortedPrior = [...entry.exposedIds].sort((a, b) => a - b);
      if (sortedNew.every((v, i) => v === sortedPrior[i])) {
        return { rejected: true, reason: 'You must select a different set of cards than a prior attempt' };
      }
    }
    this.hands[this.declarerSeat] = hand.filter(id => !cardIds.includes(id));
    this.exposedSellCards = [...cardIds];
    this.phase = 'selling-bidding';
    // clockwise-left of declarer bids first (FR-015, parallels FR-004)
    this.currentTurnSeat = (this.declarerSeat + 1) % this.playerCount;
    this.passedSellOpponents = new Set();
    this._lastSellBidderSeat = null;
    return { rejected: false };
  }

  submitSellBid(seat, amount) {
    if (this.phase !== 'selling-bidding') {return { rejected: true, reason: 'Not in selling-bidding phase' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (seat === this.declarerSeat) {return { rejected: true, reason: 'The declarer cannot bid in the sell auction' };}
    if (seat !== this.currentTurnSeat) {return { rejected: true, reason: 'Not your turn' };}
    if (!Number.isInteger(amount)) {return { rejected: true, reason: 'Bid must be an integer' };}
    if (amount % BID_STEP !== 0) {return { rejected: true, reason: `Bid must be a multiple of ${BID_STEP}` };}
    if (amount > MAX_BID) {return { rejected: true, reason: `Bid cannot exceed ${MAX_BID}` };}
    if (this._game.session?.barrelState?.[seat]?.onBarrel && amount < BARREL_BID_FLOOR) {
      return { rejected: true, reason: `Players on barrel must bid at least ${BARREL_BID_FLOOR}.` };
    }
    const smallest = this.currentHighBid === null ? MIN_BID : this.currentHighBid + BID_STEP;
    if (amount < smallest) {return { rejected: true, reason: `Bid must be at least ${smallest}` };}

    this.currentHighBid = amount;
    this._lastSellBidderSeat = seat;

    const next = this._nextSellOpponent(seat);
    if (next !== null) {
      this.currentTurnSeat = next;
      return { rejected: false };
    }

    // No remaining active opponents → the bidder wins immediately
    return this._resolveSellSold();
  }

  submitSellPass(seat) {
    if (this.phase !== 'selling-bidding') {return { rejected: true, reason: 'Not in selling-bidding phase' };}
    if (this.isPausedByDisconnect) {return { rejected: true, reason: 'Round is paused' };}
    if (seat === this.declarerSeat) {
      return { rejected: true, reason: 'The declarer cannot pass in the sell auction' };
    }
    if (seat !== this.currentTurnSeat) {return { rejected: true, reason: 'Not your turn' };}

    this.passedSellOpponents.add(seat);

    const remaining = this._activeSellOpponents();

    if (remaining.length === 0) {
      // Both opponents passed without anyone bidding
      return this._resolveSellReturned();
    }

    if (this._lastSellBidderSeat !== null) {
      // One passed and the other has bid at least once (FR-016 / FR-017)
      return this._resolveSellSold();
    }

    // Remaining opponent hasn't bid yet — continue
    this.currentTurnSeat = remaining[0];
    return { rejected: false };
  }

  _nextSellOpponent(fromSeat) {
    return nextSellOpponent(fromSeat, this.declarerSeat, this.passedSellOpponents, this.playerCount);
  }

  _activeSellOpponents() {
    return activeSellOpponents(this.declarerSeat, this.passedSellOpponents, this.playerCount);
  }

  _resolveSellSold() {
    const result = resolveSellSold({
      hands: this.hands,
      exposedSellCards: this.exposedSellCards,
      declarerSeat: this.declarerSeat,
      lastSellBidderSeat: this._lastSellBidderSeat,
      attemptHistory: this.attemptHistory,
    });
    this.declarerSeat = result.buyerSeat;
    this.currentTurnSeat = result.buyerSeat;
    this.exposedSellCards = [];
    this.phase = 'post-bid-decision';
    return result;
  }

  _resolveSellReturned() {
    const result = resolveSellReturned({
      hands: this.hands,
      declarerSeat: this.declarerSeat,
      exposedSellCards: this.exposedSellCards,
      attemptHistory: this.attemptHistory,
    });
    this.exposedSellCards = [];
    this.attemptCount += 1;
    this.currentTurnSeat = this.declarerSeat;
    this.phase = 'post-bid-decision';
    return result;
  }

  // T041 helper — moves talon into declarerSeat's hand; called at every bidding resolution site
  _absorbTalon() {
    const result = absorbTalon({
      hands: this.hands,
      talon: this.talon,
      deck: this.deck,
      declarerSeat: this.declarerSeat,
    });
    this.talon = [];
    return result;
  }

}

module.exports = Round;
