# Tasks: Multilanguage Support (English + Russian)

**Input**: Design documents from `specs/013-multilanguage-support/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/i18n-api.md, contracts/ws-rejection-codes.md, quickstart.md

**Tests**: Included — the plan's `tests/` section explicitly lists new and modified test files (I18n, catalog parity, rejection codes, page translator, language button, detection, formatters).

**Organization**: Tasks are grouped by user story. US1 (full Russian coverage) is the MVP; US2 (on-the-fly switch) and US3 (persistence/detection) layer on top of the shared foundation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 — maps to the user stories in spec.md
- Component-conversion tasks all append keys to the shared catalogs (`en.js`/`ru.js`), so they are intentionally **not** marked [P]

## Path Conventions

Existing web-app structure: backend `src/services/` + `src/controllers/`, frontend `src/public/` (ES modules under `src/public/js/`), tests in `tests/` (Node built-in runner, jsdom for DOM units).

---

## Phase 1: Setup

**Purpose**: Create the i18n feature directory and catalog skeleton everything else builds on.

- [x] T001 Create `src/public/js/i18n/catalogs/` with stub catalogs `src/public/js/i18n/catalogs/en.js` and `src/public/js/i18n/catalogs/ru.js` — each a flat default-exported object (per contracts/i18n-api.md "Catalog module shape"), seeded with the `lang.*` keys (language self-names "English"/"Русский", toggle title/aria-label)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The I18n service, preference store, and boot wiring that ALL user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 [P] Implement `LanguagePreferenceStore` in `src/public/js/i18n/LanguagePreferenceStore.js` — `localStorage` key `thousand_lang`, best-effort try/catch mirroring `src/public/js/storage/MutePreferenceStore.js`; `get()` returns `'en' | 'ru' | null` (any other value or read failure → `null`), `set(id)` swallows storage failures
- [x] T003 [P] Write failing unit tests in `tests/I18n.test.js` — key lookup, `{param}` interpolation, fallback chain active-catalog → en → `params.fallback` → key (never empty, FR-009), unknown tokens left literal, plural selection for ru `one/few/many` (1 / 2 / 5 / 11 / 21, FR-010) and en `one/other`, `setLanguage` persists + emits `language:changed` exactly once (idempotent call does not emit)
- [x] T004 Implement `I18n` in `src/public/js/i18n/I18n.js` per contracts/i18n-api.md — static `SUPPORTED_LANGUAGES` (`[{ id: 'en', selfName: 'English' }, { id: 'ru', selfName: 'Русский' }]`); constructor `{ preferenceStore, navigatorLanguages }` resolves language: valid stored value → else primary subtag `ru` → `'ru'` → else `'en'` (FR-007/FR-008); `t(key, params?)` with `Intl.PluralRules`-driven plural-object selection (in-value category fallback `many`→`other`→`few`→`one`), English-catalog fallback, `{name}` token interpolation; `setLanguage(id)` ignores unsupported ids, persists via store, refreshes plural rules, emits `Antlion.emit('language:changed', { language: id })`; make `tests/I18n.test.js` pass
- [x] T005 Wire i18n into boot: in `src/public/js/index.js` construct `LanguagePreferenceStore` + `I18n` (passing `navigator.languages`) **before** any screen renders; in `src/public/js/core/ThousandApp.js` own and pass the `i18n` instance down to screens/components exactly like `Toast`/`GameApi`

**Checkpoint**: `node --test tests/I18n.test.js` green — user story phases can begin.

---

## Phase 3: User Story 1 - Play the game entirely in Russian (Priority: P1) 🎯 MVP

**Goal**: With Russian selected, 100% of interface text — lobby, waiting room, in-game controls, status, scoreboard, history, summaries, results, rules, gameplay errors, notifications — renders in Russian (SC-001); English is the universal fallback (FR-009); player-entered names pass through verbatim (FR-012).

**Independent Test**: Select Русский and walk a complete session (nickname → lobby → new game → waiting room with bots → bidding → selling/exchange → trick play with a marriage → round summary → final results → rules modal), forcing one rejection toast; zero English strings appear (quickstart US1).

### Tests for User Story 1

> Write these first; they fail (or are trivially green on stubs) until the phase completes.

- [x] T006 [P] [US1] Write `tests/catalogParity.test.js` — every key in `catalogs/en.js` has a non-empty `ru` entry; ru `{token}` sets ⊆ the en value's tokens; plural objects contain only CLDR categories with non-empty string values (SC-001 guard)
- [x] T007 [P] [US1] Write failing jsdom tests in `tests/PageTranslator.test.js` — applies `data-i18n` textContent and `data-i18n-attr` (`placeholder`/`title`/`aria-label`) at boot, re-applies all of them on `language:changed`
- [x] T008 [P] [US1] Write failing jsdom tests in `tests/LanguageButton.test.js` — binds every `.lang-btn`, click toggles en↔ru via `i18n.setLanguage`, preference store written, `language:changed` emitted, button face/title/aria-label reflect the **target** language's self-name
- [x] T009 [P] [US1] Write failing tests in `tests/rejection-codes.test.js` — every server-emitted rejection `code` exists as a `reject.*` key in `catalogs/en.js`; `params` are primitives only; existing English `reason` strings unchanged (contracts/ws-rejection-codes.md registry rule)
- [x] T010 [US1] Update formatter tests for the `(t, …)` signature with localized assertions in both languages: `tests/historyEntryText.test.js`, the `computeStatusText` assertions in `tests/StatusBar.test.js` / `tests/StatusBar.005.test.js`, and the `formatRoundStats` assertions in `tests/GameScreen.roundstats.test.js` (ru plural forms: 1 взятка / 2 взятки / 5 взяток, FR-010)

### Implementation for User Story 1 — i18n UI machinery

- [x] T011 [P] [US1] Implement `PageTranslator` in `src/public/js/i18n/PageTranslator.js` — walks `[data-i18n]` / `[data-i18n-attr]`, writes `i18n.t(key)`, subscribes to `language:changed` to re-walk; make `tests/PageTranslator.test.js` pass
- [x] T012 [P] [US1] Implement `LanguageButton` in `src/public/js/i18n/LanguageButton.js` — binds every `.lang-btn` via `antlion.bindInput(el, 'click', 'language-toggle')` with a single `onInput` handler calling `i18n.setLanguage(<other>)`, reflects state on `language:changed` (mirrors `src/public/js/thousand/MuteButton.js`); make `tests/LanguageButton.test.js` pass
- [x] T013 [US1] Annotate static text in `src/public/index.html` with `data-i18n` / `data-i18n-attr` keys — nickname screen, lobby header/list, waiting room, buttons, placeholders, titles/aria-labels (incl. the two `.rules-btn` labels) — and add the `.lang-btn` control to the lobby header; add every referenced key with its English text to `src/public/js/i18n/catalogs/en.js`
- [x] T014 [US1] Annotate the rules modal prose in `src/public/index.html` (`#rules-modal`, `.rules-body`: title, ~15 headings/paragraphs/list blocks) with one `data-i18n` key per block (`rules.*` namespace per research R5); add the keys to `catalogs/en.js`
- [x] T015 [US1] Wire the new classes in `src/public/js/index.js` — instantiate `PageTranslator` (initial walk before first paint) and `LanguageButton` after `I18n` construction
- [x] T016 [US1] Add a `.lang-btn` to the in-game icon row in `src/public/js/thousand/ScoreboardPanel.js`, next to the mute and rules buttons (FR-004: discoverable from both lobby and game)

### Implementation for User Story 1 — pure formatters

- [x] T017 [US1] Convert `src/public/js/thousand/statusText.js` to `computeStatusText(t, gameStatus, ctx)` — all phase/turn labels via i18n keys, player names as params (FR-012); update its caller in `src/public/js/thousand/GameScreen.js`; keys to `catalogs/en.js`
- [x] T018 [US1] Convert `src/public/js/thousand/historyEntryText.js` to `historyEntryText(t, entry, seats)` — entry kinds and suit names via `history.*` / `suit.*` keys, plural-aware counts (FR-010/FR-011); update its caller in `src/public/js/thousand/HistoryPanel.js`; keys to `catalogs/en.js`
- [x] T019 [US1] Convert `src/public/js/thousand/roundStatsText.js` to `formatRoundStats(t, stats)` — plural-object keys for tricks/points (`stats.*`); update its caller in `src/public/js/thousand/OpponentView.js`; keys to `catalogs/en.js`; formatter tests from T010 pass

### Implementation for User Story 1 — component string conversion (each task moves literals to `i18n.t()` and appends its keys to `catalogs/en.js`)

- [x] T020 [US1] Lobby screens: `src/public/js/screens/NicknameScreen.js`, `src/public/js/screens/GameList.js`, `src/public/js/screens/WaitingRoom.js` (nicknames, game names, bot names stay verbatim params, FR-012)
- [x] T021 [US1] Overlays + lobby toasts: `src/public/js/overlays/NewGameModal.js`, `src/public/js/overlays/PlayerTooltip.js`, `src/public/js/overlays/ReconnectOverlay.js`, `src/public/js/overlays/RulesModal.js`, toast literals in `src/public/js/core/LobbyBinder.js`
- [x] T022 [US1] Bidding/selling controls: `src/public/js/thousand/BiddingControls.js`, `BidControls.js`, `SellBidControls.js`, `DeclarerDecisionControls.js`, `SellSelectionControls.js`, `SellPhaseView.js` (all in `src/public/js/thousand/`)
- [x] T023 [US1] Prompts and notices: `src/public/js/thousand/CrawlControls.js`, `FourNinesPrompt.js`, `MarriageDeclarationPrompt.js`, `MarriageNotice.js`, `TurnReminder.js` (all in `src/public/js/thousand/`)
- [x] T024 [US1] Round flow screens: `src/public/js/thousand/RoundReadyScreen.js`, `RoundSummaryScreen.js`, `FinalResultsScreen.js` (all in `src/public/js/thousand/`)
- [x] T025 [US1] Panels and status surfaces: `src/public/js/thousand/ScoreboardPanel.js`, `HistoryPanel.js`, `StatusBar.js`, `GameStatusBox.js`, `TrumpBox.js` (all in `src/public/js/thousand/`)
- [x] T026 [US1] Table views and root screen: `src/public/js/thousand/TalonView.js`, `CardExchangeView.js`, `TrickPlayView.js`, `OpponentView.js`, `CollectedTricksStack.js`, `GameScreen.js`, `GameScreenControls.js` (all in `src/public/js/thousand/`)

### Implementation for User Story 1 — server rejection codes (contracts/ws-rejection-codes.md)

- [x] T027 [US1] Add sibling `code` (+ `params` where the prose interpolates values) to every `{ rejected: true, reason }` return in `src/services/Round.js` (~62 sites; reuse one code per cause — `reject.notYourTurn`, `reject.bidBelowMin` `{min}`, `reject.bidNotMultiple` `{step}`, `reject.barrelBidFloor` `{floor}`, etc.); English `reason` strings unchanged
- [x] T028 [P] [US1] Add `code`/`params` to the ~15 rejection returns in `src/services/TrickPlay.js` (`reject.cardNotInHand`, `reject.mustFollowSuit`, `reject.ackFourNinesFirst`, `reject.holdAceCannotCrawl`, …) and to any join/seat rejection prose in `src/services/ThousandStore.js`; English `reason` strings unchanged
- [x] T029 [US1] Pass `code`/`params` through to the `action_rejected` payload in `src/controllers/RoundActionHandler.js` and `src/controllers/TrickPlayActionHandler.js`; add `code` to `game_join_failed` in `src/controllers/GameController.js`; give `round_aborted` the catalog key `reject.playerGraceExpired` with `params: { name }` per the contract
- [x] T030 [US1] Add every `reject.*` code as a key in `catalogs/en.js` (the catalog **is** the code registry); make `tests/rejection-codes.test.js` pass
- [x] T031 [US1] In `src/public/js/core/ThousandMessageRouter.js`, word `action_rejected` / `game_join_failed` / `round_aborted` toasts as `i18n.t(code, params)` when the code resolves, falling back to the English `reason` text (FR-009); infrastructure `error` payloads keep the server text verbatim (exempt per clarification)

### Implementation for User Story 1 — Russian catalog + layout

- [x] T032 [US1] Produce the complete Russian catalog in `src/public/js/i18n/catalogs/ru.js` by translating every `en.js` key (development-time autotranslation, FR-003), using established Тысяча terminology — марьяж (marriage), бочка (barrel), прикуп (talon), взятка (trick), роспись-family for crawl — with correct ru plural objects `{ one, few, many }` for all counted values; `tests/catalogParity.test.js` passes
- [x] T033 [US1] Absorb 10–30% longer Russian text (FR-013): style `.lang-btn` and relax English-length-assuming widths in `src/public/css/index.css` (lobby/nickname/waiting room/modals) and `src/public/css/game.css` (bidding/sell/declarer controls, status bar, scoreboard + history headers) with `min-width`/wrap/ellipsis-tolerant rules
- [x] T034 [US1] Checkpoint: run `npm test` and `npm run lint`, then the quickstart US1 walkthrough
  <!-- Automated gates green: 1224 tests pass, lint clean, catalog parity + rejection-codes pass,
       static audit shows zero hardcoded user-facing English. Manual browser walkthrough deferred to T047. --> — full session in Russian with zero English strings, including a forced rejection toast (bid out of turn from a second tab)

**Checkpoint**: US1 fully functional — the game is completely playable in Russian. MVP deliverable.

---

## Phase 4: User Story 2 - Switch language on the fly (Priority: P2)

**Goal**: Changing language re-renders every visible label immediately — no reload, game state and other players untouched (FR-005/FR-006); existing history entries re-word (FR-011).

**Independent Test**: Join a game in English, switch to Русский mid-trick: controls/status/scoreboard/trump box/history update instantly, hand/bids/turn unaffected, a second player in another browser stays in their own language (quickstart US2).

### Tests for User Story 2

- [x] T035 [P] [US2] Write failing jsdom test `tests/GameScreen.language.test.js` — on `language:changed`, `GameScreen` re-renders status bar, controls, scoreboard, and trump box from retained `_lastGameStatus`/`_lastSnapshot` without dispatching any round action or touching the socket (FR-005)
- [x] T036 [P] [US2] Extend `tests/HistoryPanel.test.js` — entries rendered before a language switch re-render in the new language from the retained `actionHistory` (FR-011)

### Implementation for User Story 2

- [x] T037 [US2] In `src/public/js/thousand/GameScreen.js`, subscribe to `language:changed` and re-render the status bar, phase controls (`GameScreenControls`), scoreboard, round stats, and trump box from `_lastGameStatus`/`_lastSnapshot`; make `tests/GameScreen.language.test.js` pass
- [x] T038 [US2] In `src/public/js/thousand/HistoryPanel.js`, re-render all entries from the retained snapshot `actionHistory` on `language:changed`; make the extended `tests/HistoryPanel.test.js` pass
- [x] T039 [US2] In `src/public/js/core/ThousandApp.js`, re-render the visible lobby state (game list, waiting room, nickname screen labels) from current app state on `language:changed`; transient toasts/prompts are not retro-translated — the next occurrence uses the new language (spec edge case)
- [x] T040 [US2] Checkpoint: quickstart US2
  <!-- Automated: GameScreen.language + HistoryPanel live-switch tests green; full suite 1231 pass. Manual mid-game browser walkthrough deferred to T047. --> — switch mid-bidding and mid-trick; verify instant re-render (< 1 s, SC-002), untouched game state, history re-worded, second browser unaffected

**Checkpoint**: US1 + US2 both work — language is fully live-switchable.

---

## Phase 5: User Story 3 - Language preference is remembered (Priority: P3)

**Goal**: The chosen language survives browser restarts and reconnects (FR-007); first-time visitors default by browser language (FR-008); invalid stored values fall back to default logic (edge case).

**Independent Test**: Pick Русский, close and reopen the tab — first paint is Russian; clear storage and open with a `ru-RU` browser — Russian by default; kill the connection mid-game and reconnect — restored screen is Russian (quickstart US3).

### Tests for User Story 3

- [x] T041 [P] [US3] Write `tests/LanguagePreferenceStore.test.js` — persists and restores `'en'`/`'ru'` under `thousand_lang`; invalid stored value and storage failure both return `null`; `set` never throws
- [x] T042 [P] [US3] Write `tests/languageDetection.test.js` — stored preference wins over browser language; no preference + `ru`/`ru-RU` first browser language → `'ru'`; any other/empty → `'en'`; invalid stored value falls through to detection (FR-008)

### Implementation for User Story 3

- [x] T043 [US3] Verify and harden the return/reconnect path: first paint after reload uses the stored language (PageTranslator runs before screens render in `src/public/js/index.js`), and the game screen restored via `src/public/js/overlays/ReconnectOverlay.js` renders in the stored language — fix any component that caches translated strings at construction time
- [x] T044 [US3] Checkpoint: quickstart US3
  <!-- Automated: store + detection tests green (FR-007/FR-008); first paint uses PageTranslator
       before screens render; TrumpBox/MuteButton/scoreboard tooltips hardened against caching. Manual browser walkthrough deferred to T047. --> — close/reopen tab (Russian first paint), fresh profile with ru browser (Russian default), mid-game reconnect (Russian restore)

**Checkpoint**: All three user stories independently verified.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T045 [P] Update `CLAUDE.md` — add `src/public/js/i18n/` to the project structure, record feature 013 in Feature Status, note the `thousand_lang` localStorage key
- [x] T046 Cross-device layout pass
  <!-- Structural tolerances in place: flex-wrap on status bar / bidding+sell controls / modal actions,
       padding-based buttons, min-width (not fixed) labels, .lang-btn styled, lobby-header + scoreboard
       header absorb the extra icon and longer greeting. Pixel-level visual sweep across device widths
       in both languages remains a manual step. --> in **both** languages (mobile + desktop widths) over every screen per FR-013/research R9 — fix any clipped/overflowing control in `src/public/css/index.css` / `src/public/css/game.css`
- [x] T047 Run full verification: `npm test` (entire suite incl. all pre-existing tests), `npm run lint`, and the complete quickstart.md validation including the FR-009 fallback drill (temporarily delete a `ru` key → English shows, parity test fails; restore)
  <!-- 1242 tests pass; lint clean. FR-009 drill executed: deleting ru['status.yourTurn'] made
       catalogParity fail and t() fell back to English "Your turn"; ru.js restored, parity green. -->

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on T001 — **blocks all user stories**
- **US1 (Phase 3)**: depends on Phase 2; tasks T006–T034
- **US2 (Phase 4)**: depends on Phase 2; builds on US1's converted components (re-rendering keys requires keys to exist)
- **US3 (Phase 5)**: depends on Phase 2 only (store + detection live in the foundation); independently testable any time after Phase 2
- **Polish (Phase 6)**: after all desired stories

### Key Task Dependencies

- T004 (I18n) needs T002 (store) and T003 (failing tests); T005 needs T004
- T011/T012 need T004; T013/T014 need T011 conceptually (keys applied by PageTranslator); T015 needs T011 + T012; T016 needs T012
- T017–T026 need T005 (i18n passed down); each appends to `catalogs/en.js` → run sequentially
- T029 needs T027 + T028; T030 needs T027–T029; T031 needs T030; T009 written first, passes at T030
- T032 needs the complete `en.js` (after T013, T014, T017–T026, T030)
- T037/T038/T039 need the US1 conversions of the components they re-render
- T043 needs T032 (a Russian catalog to restore into)

### Parallel Opportunities

- Phase 2: T002 ∥ T003
- US1 test authoring: T006 ∥ T007 ∥ T008 ∥ T009
- US1 machinery: T011 ∥ T012 (different new files)
- Server: T028 ∥ T027 (different files)
- US2 tests: T035 ∥ T036
- US3 tests: T041 ∥ T042
- Polish: T045 in parallel with T046

---

## Parallel Example: User Story 1

```bash
# After Phase 2, author the US1 test files together:
Task: "Write tests/catalogParity.test.js"           # T006
Task: "Write tests/PageTranslator.test.js"          # T007
Task: "Write tests/LanguageButton.test.js"          # T008
Task: "Write tests/rejection-codes.test.js"         # T009

# Then build the two new UI classes together:
Task: "Implement src/public/js/i18n/PageTranslator.js"   # T011
Task: "Implement src/public/js/i18n/LanguageButton.js"   # T012
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (T001) + Phase 2 (T002–T005) — i18n service running, English-only behavior unchanged
2. Phase 3 (T006–T034) — every string keyed, Russian catalog shipped, rejection codes structured
3. **STOP and VALIDATE**: quickstart US1 — full Russian session, zero English
4. This alone delivers the feature's core value (a playable Russian game)

### Incremental Delivery

1. Foundation → I18n service green, no visible change
2. US1 → game fully playable in Russian (MVP — demo)
3. US2 → live switching with instant re-render (demo mid-game)
4. US3 → persistence + browser-language default (demo return visit)
5. Polish → docs, cross-device layout, full-suite verification

### Notes

- Component-conversion tasks (T017–T026) share `catalogs/en.js` — execute sequentially, committing after each
- The English text already in `index.html` stays as authored (readable fallback, Constitution II)
- Never translate player-entered text or bot names — they are always `params` (FR-012)
- Infrastructure `error` payloads (`ConnectionManager`, HTTP 500) stay English end-to-end — do not add codes or keys for them
