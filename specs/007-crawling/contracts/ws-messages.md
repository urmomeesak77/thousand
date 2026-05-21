# WS Message Contracts: Crawling

Messages added or modified by this feature. Everything else from features 004/005/006 is unchanged. Per-viewer card-identity filtering rules (FR-005 / minimal knowledge) are tightened for crawl commits: no committed face is sent to anyone until the third commit.

---

## Client → Server (new)

### `crawl_commit`

Submitted to commit one card face-down during the crawl. The **same** message serves the declarer's initiating commit and each opponent's response; the server interprets it by turn order (FR-003, FR-004).

```json
{ "type": "crawl_commit", "cardId": 17 }
```

| Field | Type | Notes |
|-------|------|-------|
| cardId | integer | A card id currently in the sender's hand. |

**Processing preconditions**:
- sender has a `gameId`, `game.round` exists, sender is seated;
- `round.phase === 'trick-play'`, not paused by disconnect;
- `round.fourNinesAckPending === false` (FR-011 — the four-nines gate precedes the crawl);
- it is the sender's turn (`seat === currentTurnSeat`);
- **first commit (declarer)**: `crawlAvailable` must be true (trick 1, leader is declarer, declarer holds no ace) — otherwise rejected (`action_rejected`, sender only);
- **subsequent commits (opponents)**: `crawlActive` must already be true;
- `cardId` is in the sender's hand. **No follow-suit / trump restriction applies** (FR-004).
- per-player throttle: `crawl_commit` bypasses the shared 250 ms limiter (like `play_card`/`exchange_pass`) since commits can arrive in quick succession.

**Server behaviour**: remove the card from the sender's hand, append to `crawlCommits`, advance the turn. Broadcast `crawl_committed` (no faces). On the **third** commit, funnel the three commits into `currentTrick`, resolve via the standard trick rules, then broadcast `crawl_revealed` (faces + winner) and the normal trick-2 `gameStatus`.

**Rejection**: turn/eligibility/phase violations return `action_rejected` to the sender only, with a descriptive reason (e.g. "Not your turn", "You hold an ace — cannot crawl", "Acknowledge the four-nines bonus first"). State is not mutated on rejection.

**Decline path**: there is no decline message. An eligible declarer who instead sends the normal `play_card` leads face-up; `crawlAvailable` then derives false and the trick proceeds as an ordinary trick.

---

## Server → Client (new)

### `crawl_committed`

Broadcast after each face-down commit. Carries **no** card identity (FR-005).

```json
{
  "type": "crawl_committed",
  "seat": 1,
  "committedSeats": [1],
  "gameStatus": { "...": "per-viewer view-model" }
}
```

| Field | Type | Notes |
|-------|------|-------|
| seat | integer | Seat that just committed. |
| committedSeats | integer[] | All seats that have committed so far (in commit order). |
| gameStatus | object | Per-viewer view-model. `crawlActive: true`, `crawlCommittedSeats` set, `currentTrick` empty. `viewerCrawlCommit` is populated only in the committer's own view-model. |

**Client behaviour**: render a face-down placeholder in the committed seat's centre slot; if `crawlActive` and it is the viewer's turn, prompt "commit a card face-down to steal the trick." No faces are shown.

### `crawl_revealed`

Broadcast after the third commit. Reveals all three faces and the winner (FR-006).

```json
{
  "type": "crawl_revealed",
  "commits": [
    { "seat": 0, "cardId": 17, "rank": "10", "suit": "hearts" },
    { "seat": 1, "cardId": 4,  "rank": "K",  "suit": "spades" },
    { "seat": 2, "cardId": 22, "rank": "9",  "suit": "hearts" }
  ],
  "winnerSeat": 0,
  "gameStatus": { "...": "per-viewer view-model (trick 2)" }
}
```

| Field | Type | Notes |
|-------|------|-------|
| commits | array | All three committed cards with full identity, in commit order. The first entry (declarer's) sets the led suit. |
| winnerSeat | integer | Seat that won the crawl trick by standard rules (highest led-suit card; no trump on trick 1). Winner collects the three cards and leads trick 2. |
| gameStatus | object | Per-viewer view-model already advanced to trick 2: `crawlActive: false`, `trickNumber: 2`, updated `collectedTrickCounts`, `currentTrickLeaderSeat = winnerSeat`. |

**Client behaviour**: flip the face-down placeholders to their revealed faces, then run the existing collect-to-winner flight animation (reused from `TrickPlayView`); restore normal trick-play controls for trick 2.

---

## Modified message behaviour

### `play_card` (first lead)

Unchanged in mechanics. Note: while `crawlAvailable` is true, an eligible declarer **may** still choose to lead face-up via `play_card`; doing so declines the crawl. While `fourNinesAckPending` is true, `play_card` (and now `crawl_commit`) is rejected exactly as in feature 006.

### Reconnect snapshot (`round_state_snapshot`, trick-play branch)

When a crawl is in progress, the trick-play snapshot gains `crawlActive`, `crawlCommittedSeats`, `crawlAvailable` (declarer only), and `viewerCrawlCommit` (the reconnecting player's own committed card, sticky). Other players' committed faces are never included (FR-005, FR-012).

### `round_summary` / `final_results`

**Unchanged.** A crawled trick is scored like any other trick; no new summary or history fields (research Decision 7).
