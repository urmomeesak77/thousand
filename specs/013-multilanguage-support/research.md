# Research: Multilanguage Support (English + Russian)

**Feature**: 013-multilanguage-support | **Date**: 2026-06-11
**Status**: All Technical Context unknowns resolved — no NEEDS CLARIFICATION remain.

## R1. Translation catalog format and delivery

- **Decision**: One static ES module per language (`src/public/js/i18n/catalogs/en.js`, `ru.js`), each exporting a flat object of `key → string | pluralObject`. Both catalogs are imported synchronously at boot; English is the source of truth and runtime fallback.
- **Rationale**: Constitution I/V forbid build steps and bundlers — message-extraction pipelines and `.po`/ICU toolchains are out. A plain ES module loads synchronously with the rest of the app (no fetch race on first paint), is directly testable by the Node test runner, and "adding a language = adding one file" satisfies FR-014/SC-005. Two catalogs at ~250–400 keys are trivially small; lazy loading would be speculative complexity (Constitution III).
- **Alternatives considered**: (a) JSON files fetched at runtime — adds an async boot dependency and a flash-of-untranslated-content risk for zero benefit at this size; (b) per-component string maps — scatters the catalog across 30 files, breaking FR-014 ("supply a new set of translated text" must be one deliverable); (c) an i18n library (i18next etc.) — violates Constitution I/III.

## R2. Russian pluralization and dynamic message composition

- **Decision**: Catalog values that depend on a count are objects keyed by CLDR plural category (`{ one, few, many, other }` for ru; `{ one, other }` for en). `I18n.t(key, params)` resolves the category with the built-in `Intl.PluralRules(lang).select(params.count)` and then interpolates `{name}`-style placeholders by simple token replacement.
- **Rationale**: Russian counted nouns need three forms (1 взятка / 2 взятки / 5 взяток — FR-010, edge case "counts of tricks/points"). `Intl.PluralRules` is built into every target browser and Node 18+, encodes the CLDR rules correctly (including 11–14 exceptions), and costs zero dependencies. Token replacement (`{name}`, `{count}`) is the simplest interpolation that works; full ICU MessageFormat is unneeded.
- **Alternatives considered**: (a) hand-rolled `n % 10 / n % 100` rules — reinvents what the platform ships and is easy to get subtly wrong; (b) avoiding plural-sensitive phrasing ("Tricks: 5") everywhere — would force stilted Russian in the history panel and round stats, conflicting with FR-010's "grammatically correctly".

## R3. Localizing server-sent gameplay text (rejection reasons)

- **Decision**: Every server payload that carries *gameplay* prose a player can trigger in normal use — `action_rejected.reason` and `game_join_failed.reason` — additionally carries a stable `code` (e.g. `reject.notYourTurn`, `reject.bidBelowMin`) plus a `params` object for interpolated values (e.g. `{ min: 110 }`). The client words the message as `i18n.t(code, params)`; if the code is missing from the catalog (or absent entirely, e.g. an old payload), it falls back to the English `reason` text per FR-009. The server's English text is unchanged. **Infrastructure/exception messages** (`error` payloads from `ConnectionManager` — invalid JSON, unrecognized message type, server error — and HTTP 500 bodies) are exempt by the 2026-06-11 clarification: they are diagnostic, unreachable through normal play, and stay English with no code added.
- **Rationale**: The spec's model is "game events are delivered as structured facts and worded on each player's screen" — snapshots and history entries already work this way (e.g. `historyEntryText.js`), and rejections/errors are the only remaining prose over the wire. Making the *server* translate would require it to know each player's language, contradicting the clarified per-browser preference and FR-006, and fattening the thin server (Constitution IV). Keeping the English text in the payload preserves backward compatibility, gives FR-009 its fallback for free, and keeps server logs/tests readable.
- **Alternatives considered**: (a) client-side reverse map from exact English strings to Russian — zero server change but silently breaks on any server rewording, and interpolated reasons (`Bid must be at least ${smallest}`) would need fragile pattern matching; (b) server-side translation keyed by a language sent on connect — couples the server to presentation and to a preference the spec says lives in the browser; (c) leaving rejections English-only — violates FR-002 (gameplay errors are explicitly in scope); (d) translating infrastructure errors too — rejected in clarification: no user value, and it would drag protocol plumbing into the catalog.

## R4. First-visit language detection and persistence

- **Decision**: `LanguagePreferenceStore` mirrors the existing `MutePreferenceStore` pattern: best-effort `localStorage` under key `thousand_lang`, values `'en' | 'ru'`; any other/unreadable value is treated as absent. With no stored value, detect via `navigator.languages?.[0] ?? navigator.language`: a tag whose primary subtag is `ru` (e.g. `ru`, `ru-RU`) → Russian, anything else → English (FR-008). The store is written only on explicit user choice, so detection keeps tracking the browser until the player picks.
- **Rationale**: Identical proven pattern (try/catch around storage, default on failure) already in the codebase; primary-subtag matching handles regional variants without a locale table. Storing only on explicit choice keeps the "invalid preference → default logic" edge case trivially correct.
- **Alternatives considered**: (a) tying preference to server-side player identity — explicitly rejected in the clarification session; (b) `Accept-Language` on the server — server-rendered language contradicts the client-only design and SSR-free stack.

## R5. Translating static HTML (lobby, waiting room, rules modal)

- **Decision**: Annotate every static text node in `index.html` with `data-i18n="key"` (and `data-i18n-attr` for the few translatable attributes: `placeholder`, `title`, `aria-label`). A `PageTranslator` class walks `[data-i18n]` once at boot and again on every `language:changed`, writing `i18n.t(key)` into the element. The English text remains in the HTML as authored, doubling as the visible fallback if a key is ever missing. Rules prose (≈15 headings + paragraphs/lists in the modal) gets one key per block.
- **Rationale**: Keeps `index.html` the single entry file with readable English in place (Constitution II), needs no templating, and makes on-the-fly switching of static regions a single re-walk. Per-block rules keys keep catalog entries reviewable and let Russian restructure sentences freely within a block (clarified: rules fully translated in v1).
- **Alternatives considered**: (a) duplicate `lang="en"` / `lang="ru"` DOM sections toggled by class — doubles the markup and drifts; (b) building all static screens from JS — large rewrite of working markup for no functional gain (Constitution III).

## R6. On-the-fly switch and re-render strategy

- **Decision**: The language control emits via Antlion; `I18n.setLanguage()` persists the choice and `Antlion.emit('language:changed', { language })`. Subscribers re-render synchronously from state they already retain: `PageTranslator` re-walks static text; `GameScreen` re-renders status bar/controls/scoreboard/trump box from `_lastGameStatus` and the history panel from the snapshot's `actionHistory` (so past entries re-word, FR-011); lobby screens re-render their lists from current app state. Transient elements (toasts, prompts) are not retro-translated — the next occurrence appears in the new language (allowed by the spec edge case).
- **Rationale**: Every screen already has a render-from-retained-state path (e.g. `GameScreen._renderStatus(this._lastGameStatus)` is invoked exactly this way for scoreboard updates), so the switch costs one event and reuses proven code — comfortably inside SC-002's 1-second budget with no game-state interaction (FR-005). History re-wording falls out for free because entries are structured facts formatted at render time.
- **Alternatives considered**: (a) `location.reload()` — explicitly forbidden (FR-005); (b) fine-grained per-label subscriptions — a reactive binding layer is exactly the abstraction Constitution III prohibits when a coarse re-render is already cheap.

## R7. Language control UI

- **Decision**: A `LanguageButton` mirroring `MuteButton`: every element with class `.lang-btn` (one in the lobby header, one in the `ScoreboardPanel` icon row next to the mute and rules buttons) toggles `en ↔ ru`. The button face shows the *target* language's self-name abbreviation with full self-referential names in `title`/`aria-label` ("Русский" / "English"), satisfying the Key Entities note and FR-004's discoverability from both lobby and game.
- **Rationale**: With exactly two launch languages a one-tap toggle is the most discoverable and the least code; it reuses the established multi-instance-button pattern. When a third language arrives, only this control becomes a small menu — a localized component swap, not per-screen rework, so SC-005 is preserved.
- **Alternatives considered**: (a) a `<select>` dropdown now — more chrome and styling for a binary choice, speculative for FR-014; (b) flag icons — flags conflate language with country and are poor accessibility practice.

## R8. Producing the Russian catalog (FR-003)

- **Decision**: The Russian catalog is authored during implementation by automatically translating the English catalog (development-time, shipped statically — no runtime service), using the established Тысяча vocabulary fixed in the spec assumptions: марьяж (marriage), бочка (barrel), прикуп (talon), роспись-family terms for crawl, взятка (trick), заказ/контракт (bid/contract). A `catalogParity.test.js` guards that every English key has a non-empty Russian entry so SC-001 regressions are caught mechanically.
- **Rationale**: Matches the clarified meaning of "autotranslate" in the spec; the domain-vocabulary constraint prevents the classic literal-translation failure for card terms. The parity test turns "100% coverage" from a manual audit into CI.
- **Alternatives considered**: runtime translation API — explicitly excluded by FR-003 (cost, latency, nondeterminism, offline-breaking).

## R9. Layout tolerance for longer Russian text (FR-013)

- **Decision**: Audit the fixed-width surfaces during implementation — bidding/sell controls, declarer-decision buttons, status bar, scoreboard/history panel headers, modal buttons — and replace English-length assumptions with `min-width` + wrap/ellipsis-tolerant rules in the existing `index.css`/`game.css`. Verification is the User Story 1 full-session walkthrough in Russian on mobile + desktop widths.
- **Rationale**: Russian runs 10–30% longer (spec edge case); the codebase already uses responsive relative units (Constitution VI), so this is targeted adjustment, not redesign.
- **Alternatives considered**: global font-size reduction for Russian — degrades readability and touch targets (Constitution VI) instead of fixing the actual constraint.
