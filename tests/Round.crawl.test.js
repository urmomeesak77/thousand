'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Round = require('../src/services/Round');

// Reaches post-bid-decision with seat 0 as declarer (mirrors Round.fournines),
// then forces trick-play, trick 1, declarer leading.
function makeTrickPlayRound() {
  const pids = ['p0', 'p1', 'p2'];
  const game = { players: new Set(pids) };
  const store = {
    players: new Map([
      ['p0', { nickname: 'Dealer' }],
      ['p1', { nickname: 'P1' }],
      ['p2', { nickname: 'P2' }],
    ]),
  };
  const round = new Round({ game, store });
  round.start();
  round.advanceFromDealingToBidding();
  round.submitPass(1);
  round.submitPass(2);
  round.submitBid(0, 100); // seat 0 becomes declarer
  round.phase = 'trick-play';
  round.trickNumber = 1;
  round.currentTrickLeaderSeat = 0;
  round.currentTurnSeat = 0;
  return round;
}

const findId = (round, rank, suit) => round.deck.find((c) => c.rank === rank && c.suit === suit).id;

// Declarer (seat 0) holds no ace; seat 0 leads Q♥, seat 1 commits K♠ (off-suit),
// seat 2 commits 10♥ (highest heart → winner). All four aces sit on opponents.
function arrangeAcelessCrawl(round) {
  round.hands[0] = [findId(round, 'Q', '♥'), findId(round, 'J', '♣'), findId(round, 'K', '♦')];
  round.hands[1] = [findId(round, 'K', '♠'), findId(round, 'A', '♣'), findId(round, 'A', '♠')];
  round.hands[2] = [findId(round, '10', '♥'), findId(round, 'A', '♥'), findId(round, 'A', '♦')];
  return {
    s0: findId(round, 'Q', '♥'),
    s1: findId(round, 'K', '♠'),
    s2: findId(round, '10', '♥'),
  };
}

describe('Round crawl — delegation and state sync (FR-003, FR-006, FR-007)', () => {
  it('beginCrawl flips crawlActive and is accepted for an eligible ace-less declarer', () => { // per FR-003
    const round = makeTrickPlayRound();
    arrangeAcelessCrawl(round);
    const r = round.beginCrawl(0);
    assert.equal(r.rejected, false);
    assert.equal(round.crawlActive, true);
  });

  it('syncs currentTurnSeat and committedSeats as each commit lands', () => { // per FR-003
    const round = makeTrickPlayRound();
    const { s0, s1 } = arrangeAcelessCrawl(round);
    round.beginCrawl(0);

    const c0 = round.commitCrawlCard(0, s0);
    assert.equal(c0.rejected, false);
    assert.equal(round.currentTurnSeat, 1, 'turn synced to seat 1');

    const c1 = round.commitCrawlCard(1, s1);
    assert.deepEqual(c1.committedSeats, [0, 1]);
    assert.equal(round.currentTurnSeat, 2);
  });

  it('drives a full crawl that resolves into trick 2 with the winner on lead', () => { // per FR-006, FR-007
    const round = makeTrickPlayRound();
    const { s0, s1, s2 } = arrangeAcelessCrawl(round);
    round.beginCrawl(0);
    round.commitCrawlCard(0, s0);
    round.commitCrawlCard(1, s1);
    const r = round.commitCrawlCard(2, s2);

    assert.equal(r.crawlResolved, true);
    assert.equal(r.winnerSeat, 2);
    // Round fields synced from TrickPlay (FR-007).
    assert.equal(round.trickNumber, 2);
    assert.equal(round.currentTrickLeaderSeat, 2);
    assert.equal(round.currentTurnSeat, 2);
    assert.equal(round.collectedTrickCounts[2], 1);
    assert.equal(round.collectedTricks[2].length, 3);
    assert.equal(round.currentTrick.length, 0, 'no faces linger in currentTrick after resolution');
    assert.equal(round.crawlActive, false);
  });

  it('auto-begins the crawl on the declarer\'s first commit (no explicit beginCrawl)', () => { // per FR-003
    const round = makeTrickPlayRound();
    const { s0 } = arrangeAcelessCrawl(round);
    const c0 = round.commitCrawlCard(0, s0);
    assert.equal(c0.rejected, false);
    assert.equal(round.crawlActive, true);
    assert.equal(round.currentTurnSeat, 1);
  });
});

// Declarer (seat 0) holds an ace — never eligible to crawl.
function arrangeAceDeclarer(round) {
  round.hands[0] = [findId(round, 'A', '♥'), findId(round, 'J', '♣'), findId(round, 'K', '♦')];
  round.hands[1] = [findId(round, 'K', '♠'), findId(round, 'A', '♣'), findId(round, 'A', '♠')];
  round.hands[2] = [findId(round, '10', '♥'), findId(round, '9', '♣'), findId(round, 'A', '♦')];
  return { lead: findId(round, 'J', '♣') };
}

describe('Round crawl — eligibility (FR-002, FR-009, FR-011)', () => {
  it('crawlAvailable is true only in the ace-less declarer\'s own view-model', () => { // per FR-002
    const round = makeTrickPlayRound();
    arrangeAcelessCrawl(round);
    assert.equal(round.getViewModelFor(0).crawlAvailable, true, 'declarer sees the offer');
    assert.equal(round.getViewModelFor(1).crawlAvailable, false, 'opponents never see it');
    assert.equal(round.getViewModelFor(2).crawlAvailable, false);
  });

  it('crawlAvailable is false when the declarer holds an ace', () => { // per FR-009
    const round = makeTrickPlayRound();
    arrangeAceDeclarer(round);
    assert.equal(round.getViewModelFor(0).crawlAvailable, false);
  });

  it('crawlAvailable is false while the four-nines ack-gate is open', () => { // per FR-011
    const round = makeTrickPlayRound();
    arrangeAcelessCrawl(round);
    round.fourNinesAckPending = true;
    assert.equal(round.getViewModelFor(0).crawlAvailable, false);
  });
});

describe('Round crawl — rejection guards (FR-002, FR-009, FR-011)', () => {
  it('rejects beginCrawl for a non-declarer', () => { // per FR-002
    const round = makeTrickPlayRound();
    arrangeAcelessCrawl(round);
    assert.equal(round.beginCrawl(1).rejected, true);
  });

  it('rejects beginCrawl when the declarer holds an ace', () => { // per FR-009
    const round = makeTrickPlayRound();
    arrangeAceDeclarer(round);
    const r = round.beginCrawl(0);
    assert.equal(r.rejected, true);
    assert.match(r.reason, /ace/i);
  });

  it('rejects beginCrawl when it is not trick 1', () => { // per FR-002
    const round = makeTrickPlayRound();
    arrangeAcelessCrawl(round);
    round.trickNumber = 2;
    assert.equal(round.beginCrawl(0).rejected, true);
  });

  it('rejects crawl while the four-nines ack-gate is open', () => { // per FR-011
    const round = makeTrickPlayRound();
    const { s0 } = arrangeAcelessCrawl(round);
    round.fourNinesAckPending = true;
    const r = round.commitCrawlCard(0, s0);
    assert.equal(r.rejected, true);
    assert.match(r.reason, /four-nines/i);
  });

  it('rejects a commit from a non-declarer before the crawl is active', () => { // per FR-002
    const round = makeTrickPlayRound();
    const { s1 } = arrangeAcelessCrawl(round);
    // seat 1 tries to commit first — auto-begin guards reject (only the declarer
    // may initiate).
    assert.equal(round.commitCrawlCard(1, s1).rejected, true);
  });
});

describe('Round crawl — reconnect snapshot (FR-005, FR-012)', () => {
  it('a mid-crawl snapshot carries crawlActive, committed seats, and the viewer\'s own sticky commit', () => { // per FR-012
    const round = makeTrickPlayRound();
    const { s0 } = arrangeAcelessCrawl(round);
    round.beginCrawl(0);
    round.commitCrawlCard(0, s0); // declarer has committed; seat 1 is up next

    const declarerSnap = round.getSnapshotFor(0);
    assert.equal(declarerSnap.crawlActive, true);
    assert.deepEqual(declarerSnap.crawlCommittedSeats, [0]);
    assert.ok(declarerSnap.viewerCrawlCommit, 'the committer sees their own face-down card');
    assert.equal(declarerSnap.viewerCrawlCommit.cardId, s0);
  });

  it('never includes another player\'s committed face in their snapshot', () => { // per FR-005
    const round = makeTrickPlayRound();
    const { s0 } = arrangeAcelessCrawl(round);
    round.beginCrawl(0);
    round.commitCrawlCard(0, s0);

    const opponentSnap = round.getSnapshotFor(1);
    assert.equal(opponentSnap.crawlActive, true);
    assert.deepEqual(opponentSnap.crawlCommittedSeats, [0]);
    assert.equal(opponentSnap.viewerCrawlCommit, null, 'a non-committer has no own commit yet');
    // The declarer's committed card id must not appear anywhere face-up in the snapshot.
    assert.equal((opponentSnap.currentTrick ?? []).length, 0, 'no faces in currentTrick during the crawl');
  });
});

describe('Round crawl — decline path (FR-002)', () => {
  it('a normal first lead proceeds as an ordinary trick and leaves crawlAvailable false', () => { // per FR-002
    const round = makeTrickPlayRound();
    const { s0 } = arrangeAcelessCrawl(round);
    // The eligible declarer declines by leading face-up via the normal play path.
    const r = round.playCard(0, s0);
    assert.equal(r.rejected, false);
    assert.equal(round.crawlActive, false);
    assert.equal(round.currentTrick.length, 1, 'the lead is an ordinary face-up card');
    assert.equal(round.getViewModelFor(0).crawlAvailable, false, 'no crawl offer after a normal lead');
  });
});
