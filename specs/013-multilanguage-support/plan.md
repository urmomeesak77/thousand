# Implementation Plan: Multilanguage Support (English + Russian)

**Branch**: `013-multilanguage-support` | **Date**: 2026-06-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/013-multilanguage-support/spec.md`

## Summary

Add a client-side internationalization layer so every piece of user-facing text can render in English or Russian, switchable on the fly. A new `I18n` service (`src/public/js/i18n/`) holds the current language and resolves message keys against static per-language catalogs (`en.js` as source of truth and fallback, `ru.js` auto-translated at development time using established Тысяча terminology). Static HTML (lobby, waiting room, rules modal) is translated via `data-i18n` attributes applied by a `PageTranslator`; dynamic JS strings (~30 component files, plus the pure formatters `statusText.js`, `historyEntryText.js`, `roundStatsText.js`) move from string literals to `i18n.t(key, params)` calls, with `Intl.PluralRules` driving correct Russian word forms for counted quantities (FR-010). Language choice is per-browser (`LanguagePreferenceStore`, mirroring `MutePreferenceStore`), defaulting to the browser language on first visit (FR-008). Switching emits a `language:changed` Antlion event; screens re-render from already-retained state (`GameScreen._lastGameStatus` / `_lastSnapshot`, the snapshot's `actionHistory`) so the whole visible UI — including past history entries — updates instantly without touching game state (FR-005/FR-011). Server-sent gameplay text (action-rejection `reason`s, `game_join_failed`) gains structured `code` + `params` fields so the client can word it in the viewer's language, keeping the existing English text as the FR-009 fallback — the server stays language-agnostic and per-player language choices never cross the wire (FR-006). Infrastructure/exception messages (invalid JSON, unrecognized message type, internal server errors) are out of scope and remain English per the 2026-06-11 clarification.

## Technical Context

**Language/Version**: Node.js v18+ (CommonJS backend); Vanilla JS ES6+ ES modules (frontend)
**Primary Dependencies**: `ws` (WebSocket) — no new dependencies; `Intl.PluralRules` (built into all target browsers) for Russian plural categories
**Storage**: Browser `localStorage` for the language preference (`thousand_lang`); translation catalogs shipped as static ES modules (no fetch, no runtime translation service per FR-003)
**Testing**: Node.js built-in test runner (`node --test`), `jsdom` for DOM-facing units
**Target Platform**: Modern browsers (desktop/tablet/mobile) + Node server
**Project Type**: Web application (single backend + vanilla-JS frontend), existing structure
**Performance Goals**: Full visible-text re-render on language switch < 1s, no page reload, game state untouched (SC-002); zero English strings visible with Russian selected (SC-001)
**Constraints**: No frameworks, no build step, no i18n library (Constitution I/III/V); all frontend events via Antlion (XI); layouts must absorb 10–30% longer Russian text in both orientations (Constitution VI, FR-013); English fallback for any missing key — never a blank or key code (FR-009)
**Scale/Scope**: 2 launch languages; an estimated 250–400 message keys across ~30 frontend files + `index.html` (incl. full rules prose, FR-002); ~80 action-rejection sites gain structured codes (infrastructure `error` payloads exempt, stay English); adding language N+1 = one new catalog file (FR-014/SC-005)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Stack (vanilla JS / Node, no frameworks) | PASS | Hand-rolled i18n service; `Intl.PluralRules` is a browser built-in, not a dependency. |
| II. Single-File Frontend (CSS/JS separate, ES modules) | PASS | Catalogs are plain ES modules under `src/public/js/i18n/catalogs/`; no inline script/CSS added. |
| III. Simplicity First | PASS | Flat key→string catalogs, one `t(key, params)` function, a toggle button. No ICU parser, no lazy loading, no library. |
| IV/V. Thin server / No build step | PASS | Server only adds `code`/`params` fields next to existing text; catalogs ship as written — nothing compiled or extracted. |
| VI. Responsive Design | PASS | FR-013 explicitly budgets for longer Russian text; affected fixed-width controls get min-width/wrap adjustments in existing CSS files. |
| VII. Classes Over Functions | PASS | `I18n`, `LanguagePreferenceStore`, `LanguageButton`, `PageTranslator` are classes; catalogs are pure data modules (like `constants.js`); formatters stay pure functions. |
| VIII. One Class Per File | PASS | One new file per class under `src/public/js/i18n/`. |
| IX. Small Units | PASS | `I18n` is lookup + plural + fallback (~60 lines); catalogs are data, exempt from the class-size signal. |
| X. Logical Cohesion | PASS | All i18n machinery lives in one feature directory; per-component strings become keys resolved where they were previously hard-coded. |
| XI. All Frontend Logic Through Antlion | PASS | Language button wired via `bindInput`/`onInput`; switch broadcast as `language:changed` via `Antlion.emit`; re-renders are synchronous, no timers. |
| XII. Built-in Tools Over Shell | PASS | No new CLI tools; Russian catalog is authored directly (development-time translation, FR-003). |

**Result**: PASS — no violations, Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/013-multilanguage-support/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── i18n-api.md      # I18n service API, catalog shape, data-i18n + language:changed contracts
│   └── ws-rejection-codes.md  # structured code/params extension to action_rejected / game_join_failed
├── checklists/
│   └── requirements.md  # spec quality checklist (already present)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/public/js/i18n/
  I18n.js                   # NEW — current language, t(key, params), plural via Intl.PluralRules, en fallback
  LanguagePreferenceStore.js # NEW — localStorage mirror (thousand_lang), invalid value → null (default logic)
  LanguageButton.js         # NEW — binds every .lang-btn, toggles en↔ru, reflects state (mirrors MuteButton)
  PageTranslator.js         # NEW — applies catalog to all [data-i18n] static HTML; re-applies on switch
  catalogs/
    en.js                   # NEW — English catalog (source of truth; every key defined here)
    ru.js                   # NEW — Russian catalog (auto-translated, Тысяча terminology)

src/public/
  index.html                # MODIFY — data-i18n keys on all static text (lobby, waiting room, rules modal); .lang-btn controls
  css/index.css             # MODIFY — .lang-btn styling; lobby widths that assumed English lengths
  css/game.css              # MODIFY — control/panel widths that assumed English lengths (FR-013)

src/public/js/
  index.js                  # MODIFY — construct I18n + stores before app boot; wire LanguageButton/PageTranslator
  core/ThousandApp.js       # MODIFY — own/pass the I18n instance; re-render lobby state on language:changed
  core/ThousandMessageRouter.js # MODIFY — word rejection toasts from code+params via i18n (English text fallback); infrastructure error toasts keep server text
  core/LobbyBinder.js       # MODIFY — toast literals → i18n keys
  screens/ + overlays/      # MODIFY — NicknameScreen, GameList, WaitingRoom, NewGameModal, PlayerTooltip,
                            #          ReconnectOverlay: literals → i18n.t; re-render on language:changed
  thousand/statusText.js    # MODIFY — pure formatter takes i18n (or t) and returns localized status
  thousand/historyEntryText.js # MODIFY — entry kinds + suit names via i18n keys; plural-aware (FR-010/FR-011)
  thousand/roundStatsText.js # MODIFY — localized "Tricks N, Points M" with Russian plural forms
  thousand/GameScreen.js    # MODIFY — subscribe language:changed → re-render from _lastGameStatus/_lastSnapshot
  thousand/ (remaining string-bearing components)  # MODIFY — BidControls, SellBidControls, DeclarerDecision-,
                            # SellSelection-, CrawlControls, FourNinesPrompt, MarriageDeclarationPrompt,
                            # MarriageNotice, RoundReadyScreen, RoundSummaryScreen, FinalResultsScreen,
                            # ScoreboardPanel, HistoryPanel, StatusBar, GameStatusBox, TrumpBox, TalonView,
                            # CardExchangeView, TrickPlayView, OpponentView, CollectedTricksStack: literals → keys

src/ (backend)
  services/Round.js         # MODIFY — rejection returns gain { code, params } beside existing reason text
  services/TrickPlay.js     # MODIFY — same
  controllers/RoundActionHandler.js     # MODIFY — pass code/params through to action_rejected
  controllers/TrickPlayActionHandler.js # MODIFY — same
  controllers/GameController.js         # MODIFY — game_join_failed gains code
  # NOTE: ConnectionManager/server.js error payloads (invalid JSON, internal error) are
  # infrastructure messages — exempt from translation, untouched (clarified 2026-06-11)

tests/
  I18n.test.js                  # NEW — lookup, params, en fallback (FR-009), ru plural categories (FR-010)
  LanguagePreferenceStore.test.js # NEW — persist/restore, invalid value → null (edge case)
  languageDetection.test.js     # NEW — ru browser → ru, anything else → en (FR-008)
  catalogParity.test.js         # NEW — every en key has a ru entry (SC-001 guard); no empty values
  PageTranslator.test.js        # NEW — data-i18n application + re-application on switch (jsdom)
  LanguageButton.test.js        # NEW — toggle, persistence call, language:changed emitted (jsdom)
  statusText / historyEntryText / roundStatsText tests # MODIFY — assert localized output both languages
  rejection-codes.test.js       # NEW — rejection sites return stable code/params; reason text unchanged
```

**Structure Decision**: Extend the existing web-app structure in place. All i18n machinery is a single new frontend feature directory (`src/public/js/i18n/`) so language support stays orthogonal to game logic — components ask `i18n.t()` for words exactly where they previously hard-coded them, and no screen needs structural rework for a future language (FR-014). The language preference is deliberately browser-local (mirroring the proven `MutePreferenceStore`/`MuteButton` pattern, per the clarified spec) and is never sent to the server: the server keeps emitting structured facts, and the one place it currently emits gameplay *prose* (action-rejection reasons, join failures) is upgraded to facts (`code` + `params`) while retaining its English text as the universal fallback — satisfying FR-002/FR-009 without making the thin server language-aware. Infrastructure/exception messages are exempt by clarification and stay English end-to-end. On-the-fly switching reuses state every screen already retains for re-rendering (snapshots, action history, lobby lists), so a `language:changed` Antlion event plus existing render paths delivers FR-005/FR-011 with no new state.

## Complexity Tracking

> No constitution violations — section intentionally empty.
