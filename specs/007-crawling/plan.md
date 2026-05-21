# Implementation Plan: Crawling

**Branch**: `master` (no feature branch — kashka's standing no-new-branches rule; spec dir is `007-crawling`) | **Date**: 2026-05-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/007-crawling/spec.md`

## Summary

A first-trick variant on top of feature 005's trick-play loop. When trick play begins and the declarer's 8-card hand holds **no ace**, the declarer is offered the option to **crawl**: instead of leading face-up, the declarer commits any one card **face-down** to the centre. Each of the two opponents then commits one card face-down (blind — follow-suit is suspended). When all three are committed, the cards are revealed and the trick is resolved by the **standard rules** (declarer's card sets the led suit, no trump on trick 1, highest led-suit card wins); the winner collects the three cards and leads trick 2. Crawling is optional — an ace-less declarer may decline and lead normally — and is never offered when the declarer holds an ace.

Architecturally this is additive and reuses the existing `TrickPlay` resolution path. Eligibility is a pure card-fact check (`handHasAce`) added to `Scoring.js`. The crawl sub-state (committed-but-hidden cards, who has committed) lives on `TrickPlay`, which already owns trick state, leader rotation, and `_resolveTrick`/`_determineWinner` — the crawl's reveal funnels the three committed cards into the **existing** `currentTrick` + `_resolveTrick` machinery, so winner determination, collection, and trick-2 leader advance are not duplicated. The only genuinely new mechanics are: (1) holding the committed cards **hidden** until the third commit (a per-viewer view-model concern, mirroring the minimal-knowledge rule), and (2) **suspending follow-suit** for the crawl trick. The four-nines ack-gate (feature 006) already withholds `trick_play_started` and rejects `play_card` until acknowledged; the crawl offer/commit reuse that exact guard, so the gate naturally precedes any crawl.

Frontend gains a small `CrawlControls` widget (the declarer's *crawl / lead-normally* choice, and the opponents' *commit face-down* prompt) plus face-down centre rendering and a reveal animation in `TrickPlayView` (reusing its existing flight/collect machinery). All input/timing continues through Antlion per §XI.

## Technical Context

**Language/Version**: Node.js v18+ (CommonJS server) / Vanilla JS ES6+ ES modules (browser) — unchanged.
**Primary Dependencies**: `ws` ^8, Node.js built-in `crypto` — unchanged. Reuses every feature 004/005/006 service (`Round`, `TrickPlay`, `Scoring`, `RoundSnapshot`, `RoundActionHandler`, `ConnectionManager`, `validators`, `Antlion`, `TrickPlayView`, `GameScreenControls`).
**Storage**: In-memory only. Crawl sub-state lives on the in-memory `Round._trickPlay`; lost on server restart (consistent with 004/005/006).
**Testing**: Node.js built-in `--test` runner (`*.test.js`); `jsdom` for frontend. Minimum 90% coverage. Live multi-browser e2e via the `thousand-live-e2e` skill, forced through a deck seam.
**Target Platform**: Node.js server + modern browser (ES6+) — unchanged.
**Project Type**: Web application (lobby + real-time game).
**Performance Goals**:
- Crawl offer presented to the declarer within 1 s of the first lead becoming operable (SC-001).
- On the third face-down commit, all three clients reveal the same three faces and the same winner within 1 s (SC-002).
**Constraints**:
- §XI: all frontend timing/input through `Antlion` — no raw `setTimeout`/`setInterval`/`addEventListener`/`requestAnimationFrame` in feature modules. `CrawlControls` binds buttons via `Antlion.bindInput`; the reveal/collect animation reuses `TrickPlayView`'s `Antlion.onTick`/`schedule` flights.
- **Minimal knowledge (FR-005)**: no committed card's face may appear in any view-model or message until the third commit. The crawl cards must therefore be held **outside** the public `currentTrick` view-model field (which exposes rank/suit) until reveal.
- **Follow-suit suspended for the crawl trick only (FR-004, FR-008)**: trick 2 onward must enforce standard follow-suit/trump exactly as today.
- **Four-nines gate ordering (FR-011)**: crawl offer/commit reuse the `fourNinesAckPending` guard so the gate always precedes the crawl.
- §IX: `TrickPlay.js` (~143 lines) and `TrickPlayView.js` (~507 lines) are pre-existing size risks. Keep crawl additions small; the declarer/opponent choice UI goes in a **new** `CrawlControls.js`, not into `TrickPlayView`. If `TrickPlay.js` server logic grows past the guideline, the crawl sub-state methods relocate to a `CrawlTrick.js` collaborator.
**Scale/Scope**: 3-player rooms only. FR-001 .. FR-012. One eligibility check, one new client→server commit message, two new server→client messages, one centre-hidden/reveal view-model surface, one small frontend control widget.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| §    | Principle                | Status | Notes |
|------|--------------------------|--------|-------|
| §I   | Vanilla JS + Node.js     | ✓ PASS | No new dependencies. Crawl is plain card-id bookkeeping + the existing resolver. |
| §II  | Single-file frontend     | ✓ PASS | One new ES module (`CrawlControls.js`) under `src/public/js/thousand/`. No bundlers/CDN/inline JS. |
| §III | Least code               | ✓ PASS | Reuses `TrickPlay._resolveTrick`/`_determineWinner` for resolution — no parallel winner logic. Eligibility is one pure helper. |
| §IV  | Backend as thin server   | ✓ PASS | Eligibility on `Scoring`; crawl state on `TrickPlay`; dispatch in `RoundActionHandler`/`ConnectionManager`/`validators`. HTTP controllers untouched. |
| §V   | No build step            | ✓ PASS | Plain `.js`. |
| §VI  | Responsive design        | ✓ PASS | `CrawlControls` reuses existing control-strip CSS (relative units, `--touch-min` buttons); face-down centre uses the existing card-back sprite. |
| §VII | Classes over functions   | ✓ PASS | `CrawlControls` is an ES6 class. `handHasAce` is a pure stateless card helper → the §VII carve-out (lives in `Scoring.js` beside `findFourNinesSeat`). |
| §VIII| One class per file       | ✓ PASS | `CrawlControls.js` holds one class. `handHasAce` is a function export in existing `Scoring.js` (matches `findFourNinesSeat`). |
| §IX  | Small units              | ⚠ RISK | `TrickPlay.js` and `TrickPlayView.js` are pre-existing size risks (R-201). New server methods (`beginCrawl`, `commitCrawlCard`) are small and reuse `_resolveTrick`; if they push `TrickPlay.js` over, relocate to `CrawlTrick.js`. UI choice widget is a separate file. Tracked below. |
| §X   | Logical cohesion         | ✓ PASS | Eligibility = card fact → `Scoring.js`. Crawl trick state/resolution = trick mechanic → `TrickPlay.js`. Centre face-down/reveal rendering = trick view → `TrickPlayView.js`. Choice/prompt UI → `CrawlControls.js`. |
| §XI  | Frontend through Antlion | ✓ PASS | `CrawlControls` buttons via `Antlion.bindInput`; reveal animation via `TrickPlayView`'s existing Antlion-driven flights. No raw listeners/timers. |

No gate violations. The one §IX size signal (R-201) is mitigated by reusing the existing resolver and putting new UI in its own file.

**Post-design re-check**: See research.md Decisions 1–7 and data-model.md. Reusing `_resolveTrick` and keeping crawl commits in a dedicated hidden field (not `currentTrick`) keeps each change within the §IX guideline; remaining size risk stays under R-201.

## Project Structure

### Documentation (this feature)

```text
specs/007-crawling/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ws-messages.md   # Phase 1 output
├── checklists/
│   └── requirements.md  # /speckit-specify output
├── spec.md              # Feature specification
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code

```text
# New backend files
(none — all server changes are extensions of existing files; crawl state lives on TrickPlay)

# Modified backend files
src/services/Scoring.js                 # New pure helper: handHasAce(handCardIds, deck) → boolean (FR-001)
src/services/TrickPlay.js               # Crawl sub-state + methods: crawlAvailable flag, beginCrawl(), commitCrawlCard(hands, seat, cardId) suspending follow-suit; on 3rd commit funnel commits into currentTrick and call _resolveTrick() (FR-003, FR-004, FR-006, FR-007). crawl applies only when trickNumber===1 and leader===declarer; cleared from trick 2 (FR-008)
src/services/Round.js                   # Expose crawl: at trick-play start set crawl availability from handHasAce(declarer hand); delegate beginCrawl/commitCrawlCard to _trickPlay; reuse the fourNinesAckPending guard before accepting crawl (FR-002, FR-009, FR-011); sync crawl fields for snapshot/view-model
src/services/RoundSnapshot.js           # View-model + snapshot: crawlAvailable (declarer only), crawlActive, crawlCommittedSeats (no faces), viewer's own committed card; legalCardIds = full hand for the current committer (follow-suit suspended) (FR-005, FR-010, FR-012)
src/controllers/RoundActionHandler.js   # New handleCrawlCommit(playerId, cardId): gate on fourNinesAckPending; broadcast crawl_committed after each commit; on 3rd commit broadcast crawl_revealed (3 identities + winnerSeat) then resume normal trick-2 flow / round-end if applicable
src/services/ConnectionManager.js       # Dispatch crawl_commit → RoundActionHandler.handleCrawlCommit
src/controllers/validators.js           # Validate crawl_commit shape ({ cardId:int })

# New frontend files (src/public/js/thousand/)
src/public/js/thousand/CrawlControls.js # Declarer: "Crawl (play face-down) / Lead normally" choice when crawlAvailable; opponents: "Commit a card face-down to steal the trick" prompt when crawlActive & their turn (FR-002, FR-003, FR-004)

# Modified frontend files
src/public/js/thousand/TrickPlayView.js          # When crawling: route hand-clicks to sendCrawlCommit; render face-down placeholders for crawlCommittedSeats; on crawl_revealed flip faces up + reuse collect-flight to winner (FR-005, FR-010)
src/public/js/thousand/GameScreenControls.js     # Mount/unmount CrawlControls during the crawl states of trick 1
src/public/js/thousand/RoundActionDispatcher.js  # sendCrawlCommit(cardId) outbound wrapper
src/public/js/core/ThousandMessageRouter.js      # Validate + route crawl_committed and crawl_revealed → app handlers
src/public/js/core/ThousandApp.js                # onCrawlCommitted / onCrawlRevealed handlers feeding TrickPlayView

# New test files
tests/Scoring.crawl.test.js             # handHasAce: hands with/without an ace across all suits; empty/edge
tests/TrickPlay.crawl.test.js           # beginCrawl only when eligible; commitCrawlCard suspends follow-suit; 3rd commit resolves via _resolveTrick (correct winner by led suit, no trump); winner collects + leads trick 2; trick 2 enforces follow-suit again (FR-004,006,007,008)
tests/Round.crawl.test.js               # Eligibility from declarer's post-exchange hand (FR-001); decline → normal lead (FR-002); ace-holding declarer never offered crawl (FR-009); crawl rejected while fourNinesAckPending (FR-011); snapshot hides faces / shows own commit (FR-005,012)
tests/round-messages.crawl.test.js      # End-to-end via ConnectionManager: trick start → crawl_commit ×3 → crawl_revealed → trick 2 normal; declines path; reveal hides faces until 3rd commit
tests/CrawlControls.test.js             # Declarer choice + opponent prompt render; buttons dispatch once; no residual Antlion handlers on destroy
```

**Structure Decision**: Single project (unchanged from 004/005/006). No new top-level directories. The only new files are one frontend control widget and the test files; everything else extends existing files.

## Implementation Phases (delivery order)

Maps to the spec's user-story priorities; lands as one PR.

1. **P1 — Eligibility + crawl mechanic, server-side** (FR-001 .. FR-009, US1/US2 core). `handHasAce` helper; `TrickPlay` crawl sub-state + `beginCrawl`/`commitCrawlCard` reusing `_resolveTrick`; `Round` eligibility wiring + four-nines guard reuse; `RoundActionHandler.handleCrawlCommit` + `crawl_committed`/`crawl_revealed` broadcasts; `validators`/`ConnectionManager` dispatch. This is the functional core: an ace-less declarer can crawl or decline, opponents commit blind, the trick resolves correctly, and trick 2 plays normally.
2. **P1 — Frontend crawl UX** (US1/US2 UI, US3). `CrawlControls` choice/prompt; `TrickPlayView` face-down centre + reveal animation; dispatcher/router/app wiring; `GameScreenControls` mount. Delivers the visible, shared crawl experience (US3) and the declarer's decline path in the UI.
3. **Reconnect + visibility hardening** (FR-005, FR-010, FR-012). Snapshot crawl fields (hidden faces, sticky own commit); consistent multi-client reveal. Lands with P1 since the crawl sub-state is the only new state surface.

There is no separate summary/history work: a crawled trick is an ordinary trick in scoring, so feature 005's round summary and history need no changes (research Decision 7).

## Complexity Tracking

*(No new constitution violations; one pre-existing §IX size signal on `TrickPlay.js`/`TrickPlayView.js` carried from 004/005 — section not required.)*

## Known Risks

| ID    | Risk | Detail | Mitigation |
|-------|------|--------|------------|
| R-201 | `TrickPlay.js` / `TrickPlayView.js` size | Both are already over the §IX ~100-line guideline. Crawl adds methods/branches. | Reuse `_resolveTrick`/`_determineWinner` (no duplicate winner logic); put the declarer/opponent choice UI in a new `CrawlControls.js`. If `TrickPlay.js` still grows too far, extract crawl sub-state into a `CrawlTrick.js` collaborator (mirrors Round→TrickPlay delegation). Documented in research Decision 2. |
| R-202 | Face leak before reveal | If crawl commits land in the public `currentTrick` view-model field, their rank/suit would broadcast to everyone, breaking the blind gamble (FR-005). | Crawl commits live in a dedicated `crawlCommits` field on `TrickPlay`; the view-model exposes only `crawlCommittedSeats` (seats, no faces). Faces are sent **only** in `crawl_revealed` after the third commit. `round-messages.crawl.test.js` asserts no rank/suit appears in any pre-reveal payload. |
| R-203 | Follow-suit leaking into the crawl trick | The existing `playCard`/`_computeLegalCardIds` enforce follow-suit + trump priority; applying them to crawl commits would reject legal blind plays (FR-004). | Crawl commits go through `commitCrawlCard`, **not** `playCard`; it skips `_checkFollowSuit`. With `currentTrick` empty during crawl, `_computeLegalCardIds` returns the full hand for the current committer (any card legal). Trick 2 onward uses the normal path, so follow-suit returns. `TrickPlay.crawl.test.js` covers an opponent legally committing an off-suit card on trick 1, then being forced to follow suit on trick 2. |
| R-204 | Crawl offered/accepted before the four-nines gate clears | Feature 006 withholds `trick_play_started` and rejects `play_card` while `fourNinesAckPending`. A `crawl_commit` arriving during the gate must be rejected too (FR-011). | `Round`/`RoundActionHandler` reuse the `fourNinesAckPending` guard for `crawl_commit` (same rejection reason shape as `play_card`). `crawlAvailable` is false in the view-model while the gate is open. `Round.crawl.test.js` covers a premature `crawl_commit` rejection. |
| R-205 | Crawl wrongly offered after trick 1 / to the wrong seat | Crawl is strictly trick 1, declarer-only, and only when the declarer holds no ace. | `crawlAvailable` is computed as `trickNumber===1 && leader===declarer && !handHasAce(declarer hand) && !crawlActive && !fourNinesAckPending`. Cleared once the crawl resolves or a normal lead is played. `Round.crawl.test.js` asserts the flag is false for opponents, for ace-holding declarers, and from trick 2 on. |
| R-206 | `CrawlControls` handler leak between rounds | Like other mounted widgets, failing to unbind Antlion inputs leaks handlers across rounds (cf. `input-handler-leaks.test.js`). | `CrawlControls.destroy()` unbinds all Antlion inputs; `GameScreenControls` unmounts it when the crawl states end. `CrawlControls.test.js` asserts no residual handlers. |

## Verification

Run `npm test && npm run lint`. Manual end-to-end with 3 browser tabs follows `quickstart.md`, forcing an ace-less declarer via the deck seam (a `no-ace-declarer` mode added to `Round._stackedDeckForTest`, mirroring the existing `four-nines` seam). Coverage stays ≥ 90%.
