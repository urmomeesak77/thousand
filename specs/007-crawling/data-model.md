# Phase 1 Data Model: Crawling

In-memory only (consistent with 004/005/006). No persistence, no schema migration. Entities below are extensions of existing in-memory objects; new fields are listed with type, owner, and lifecycle.

---

## TrickPlay (extended — `src/services/TrickPlay.js`)

Owns the crawl sub-state of the first trick. All fields reset per round (a fresh `TrickPlay` is constructed at trick-play start).

| Field | Type | Initial | Lifecycle / Rules |
|-------|------|---------|-------------------|
| `crawlActive` | boolean | `false` | Set `true` by `beginCrawl()` when the declarer initiates a crawl on trick 1. Returns to `false` when the third commit resolves the trick. Never set on trick ≥ 2. |
| `crawlCommits` | `Array<{ seat, cardId }>` | `[]` | One entry appended per `commitCrawlCard`. Order = commit order (declarer first, then opponents in turn order). At length 3, the entries are funnelled into `currentTrick` and `_resolveTrick()` runs; then cleared. **Faces (rank/suit) are never derived from this for any pre-reveal view-model.** |

**Derived (not stored)**: `crawlAvailable` — computed for the view-model as
`trickNumber === 1 && currentTrickLeaderSeat === declarerSeat && !crawlActive && crawlCommits.length === 0 && declarer holds no ace && !fourNinesAckPending`.

### New methods

- **`beginCrawl()`** — preconditions: trick 1, leader is the declarer, declarer eligible (no ace), crawl not already active, four-nines gate closed. Sets `crawlActive = true`. Idempotent (no-op if already active). Returns `{ rejected, reason? }`.
- **`commitCrawlCard(hands, seat, cardId)`** — preconditions: `crawlActive`, `seat === currentTurnSeat`, card in `hands[seat]`. **No follow-suit / trump check.** Removes the card from `hands[seat]`, appends `{ seat, cardId }` to `crawlCommits`, advances `currentTurnSeat = (seat + 1) % 3`. On the third commit: push all `crawlCommits` into `currentTrick`, call `_resolveTrick()`, set `crawlActive = false`, clear `crawlCommits`, and return the resolve result augmented with `{ crawlResolved: true, commits, winnerSeat }`. Otherwise returns `{ rejected: false, crawlResolved: false, committedSeats }`.

### Reused unchanged

`_determineWinner`, `_resolveTrick` (collection + leader advance + trickNumber increment), `collectedTricks`, `collectedTrickCounts`, `currentTrumpSuit` (null on trick 1 → no trump in resolution).

---

## Round (extended — `src/services/Round.js`)

Round already constructs `TrickPlay` at the card-exchange → trick-play transition and delegates `playCard`/`declareMarriage`. Crawl adds parallel delegation.

| Concern | Change |
|---------|--------|
| Eligibility wiring | At trick-play start, compute the declarer's no-ace status via `handHasAce(this.hands[this.declarerSeat], this.deck)` and expose it so `crawlAvailable` can be derived for the view-model. |
| `beginCrawl(seat)` | Phase must be `trick-play`; reject if `isPausedByDisconnect`; reject if `fourNinesAckPending` (FR-011); reject if `seat !== declarerSeat` or declarer holds an ace (FR-009). Delegate to `_trickPlay.beginCrawl()`; sync crawl fields back for snapshot/view-model. |
| `commitCrawlCard(seat, cardId)` | Phase must be `trick-play`; reject if paused or `fourNinesAckPending`. Delegate to `_trickPlay.commitCrawlCard(this.hands, seat, cardId)`; sync `trickNumber`, `currentTrickLeaderSeat`, `currentTurnSeat`, `currentTrick`, `collectedTricks`, `collectedTrickCounts` back (same sync block as `playCard`). On `crawlResolved`, if `_resolveTrick` reported `roundComplete` (cannot happen on trick 1 — defensive only) handle as `playCard` does. |
| Snapshot sync | Mirror `crawlActive` and committed seats onto Round fields read by `RoundSnapshot`. |

`playCard` is unchanged except that it already rejects while `fourNinesAckPending`; a normal first lead through `playCard` implicitly declines the crawl (then `crawlAvailable` derives false because `currentTrick` is non-empty / trickNumber advances).

---

## View-model (extended — `RoundSnapshot.buildViewModel`)

Per-viewer. New fields (present only during trick 1 crawl states; otherwise `false`/empty):

| Field | Type | Visibility | Notes |
|-------|------|-----------|-------|
| `crawlAvailable` | boolean | declarer only | The crawl-offer flag (derived expression above). `false` for opponents and while the four-nines gate is open. |
| `crawlActive` | boolean | all | A crawl is underway. |
| `crawlCommittedSeats` | `number[]` | all | Seats that have committed face-down. **No faces.** Drives placeholders + turn prompt. |
| `viewerCrawlCommit` | `{ cardId, rank, suit } \| null` | self only | The viewer's own committed card (they already know it); echoed so a reconnecting committer can confirm their play. `null` if the viewer has not committed. |
| `legalCardIds` | `number[]` | self | During an active crawl on the committer's turn this is the **full hand** (follow-suit suspended) — already produced by `_computeLegalCardIds` because `currentTrick` is empty during the crawl. |

`currentTrick` stays **empty** in the view-model throughout the crawl (faces arrive only via `crawl_revealed`).

---

## Snapshot (extended — `RoundSnapshot.buildSnapshot`, trick-play branch)

For reconnect during a crawl (FR-012), the trick-play snapshot adds:

```text
crawlActive: true,
crawlCommittedSeats: [ ...seats ],
crawlAvailable: <derived, declarer only>,
viewerCrawlCommit: { cardId, rank, suit } | null   // sticky: the viewer's own commit survives reconnect
```

Other players' committed faces are **never** included. After the crawl resolves, the snapshot reflects the resolved trick exactly like any normal trick (no crawl fields).

---

## Scoring / Summary / History

**No changes.** A crawled trick is collected by `_resolveTrick` like any trick; its card points flow through the unchanged `Scoring.roundScores`/`roundDeltas`, `Round.buildSummary`, and the feature-005 final-results history (research Decision 7).

---

## State transitions (first trick, declarer is on lead, gate closed)

```text
trick-play start (trick 1)
   └─ declarer holds an ace ───────────────► normal first lead (playCard) ─► trick 2 …
   └─ declarer holds no ace  ──► crawlAvailable=true
            ├─ declarer plays face-up (playCard) ─► crawl declined ─► trick 2 …
            └─ declarer crawl_commit ─► crawlActive=true, crawlCommits=[D]
                     └─ opponent crawl_commit ─► crawlCommits=[D,O1]
                              └─ opponent crawl_commit ─► crawlCommits=[D,O1,O2]
                                       └─ funnel → currentTrick → _resolveTrick()
                                                └─ winner collects, leads trick 2 (normal play resumes)
```
