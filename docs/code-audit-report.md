# Code Audit Report — 2026-05-13

Source-of-truth conventions: [`docs/CODING_CONVENTIONS.md`](./CODING_CONVENTIONS.md). This report enumerates every violation found in a manual cross-check of `src/` against that document. Each entry cites `file:line` with a one-line fix suggestion.

## Summary

- **ESLint**: clean (`npm run lint` exits 0 with no output)
- **Files audited**: 47 JS + 1 HTML + 2 CSS
- **Most pervasive violation**: single-line `if (...) statement;` without braces — explicitly forbidden by the conventions doc but found in nearly every file. Recommend enabling `curly: ['error', 'all']` in ESLint to enforce mechanically.
- **Second most pervasive**: boolean fields/parameters missing the `is`/`has`/`should` prefix (`_running`, `_enabled`, `_visible`, `_dirty`, `_disconnected`, `_stopped`, `done`, `aborted`, `ok`, `validShape`, etc.).
- **DRY hot spots**:
  - `BidControls.js` and `SellBidControls.js` are ~95% identical (~120 duplicated lines).
  - `RoundActionHandler.js` repeats the same 5-line prelude (rate-limit → game lookup → seat → dispatch → reject-check) across every handler.
  - `_btn(text, className)` helper duplicated verbatim in 4 control files.
  - `SUIT_LETTER` constant defined three times across `CardSprite.js`, `HandView.js`, `TalonView.js`.
  - `const $ = (id) => document.getElementById(id)` defined locally in `NewGameModal.js` and `Toast.js` despite `utils/HtmlUtil.js` existing.
- **Function-length violations** (>50 lines): `GameController.handleCreateGame` (66), `Round.getViewModelFor` (58), `Round.getSnapshotFor` (69), `ThousandApp._bindLeaveGame` (52), `GameScreen.constructor` (~51), `GameScreen.initFromSnapshot` (~56), `GameScreen._mountControlsForPhase` (~55), `StatusBar.render` (66).

---

## Backend (controllers/, services/, utils/, server.js)

### src/controllers/GameController.js
- **L3-L6**: Import order missing blank line between built-in (`crypto`) and local modules. Insert a blank line after the `crypto` require.
- **L102**: Line is 130 chars (exceeds 120-char hard limit). Break the error message string across two lines or move it to a constant.
- **L122-L187**: `handleCreateGame` is 66 lines — exceeds 50-line limit. Extract `parseCreateGameBody`/`validateCreateGameInput`/`buildGameRecord` helpers.
- **L139, L201, L240**: 130-char lines, all carrying the same nickname-validation message. Extract to a shared constant.

### src/controllers/RoundActionHandler.js
- **L27-L197**: Every handler (`handleBid`, `handlePass`, `handleSellStart`, `handleSellSelect`, `handleSellCancel`, `handleSellBid`, `handleSellPass`, `handleStartGame`) repeats the same 5-line prelude plus a near-identical broadcast loop. Extract a `_runRoundAction(playerId, fn, broadcast)` helper.
- **L30, L32, L35, L48, L50, L53, L61, L72, L76, L88, L92, L111, L115, L126, L130, L153, L157, L172, L183, L187, L188**: Single-line `if (...) return ...;` without braces.

### src/controllers/RequestHandler.js
- **L11**: Magic number `60` (rate-limit max). Extract a module-level constant alongside the `60000` window.
- **L29, L47, L55, L61, L68, L75**: Single-line `if (...) ...;` without braces.

### src/controllers/validators.js
- **L4, L6, L10, L12, L14, L16, L18**: Single-line `if (...) return false;` without braces.
- **L7-L19**: `validateNickname` uses a chain of single-line ifs with magic Unicode literals. Consider extracting a `FORBIDDEN_CHAR_RANGES` constant.

### src/services/Round.js
- **L6**: 124-char line (exceeds 120). Break the multi-name destructure across lines.
- **L32**: `this.pausedByDisconnect` — boolean without `is`/`has`/`should` prefix. Rename to `isPausedByDisconnect`.
- **L86, L93-L100, L116-L118, L126, L203, L208, L234, L289-L291, L298-L302, L309-L310, L317-L319, L350-L358, L375-L378**: Single-line `if (...) ...;` without braces (pervasive).
- **L92-L112 vs L349-L371**: `submitBid` and `submitSellBid` share an identical 7-line amount-validation block. Extract `_validateBidAmount(amount, currentHighBid)`.
- **L141-L198**: `getViewModelFor` is 58 lines — exceeds 50-line limit. Extract `_phaseLabel()`, `_activePlayerInfo()`, `_passedPlayersFor()`, `_sellAttemptFor()` helpers.
- **L142-L150**: `phaseLabel` lookup rebuilt per call. Lift to module-level `PHASE_LABELS`.
- **L167-L171**: Nested ternary for `passedSeats` — rewrite as if/else if/else.
- **L211**: Parameter `_abortedByNickname` accepted but unused. Remove (YAGNI).
- **L217-L285**: `getSnapshotFor` is 69 lines — exceeds 50-line limit. Extract `_buildDealSequenceFor`, `_buildExposedSellPayload`, `_buildBaseSnapshot`.
- **L301, L440**: 121- and 122-char lines (exceed 120). Wrap.
- **L98/L356, L99/L126/L357, L302, L320**: Magic numbers `300`, `100`, `5`, `3`. Extract `MIN_BID`, `MAX_BID`, `BID_STEP`, `MAX_SELL_ATTEMPTS`, `SELL_SELECTION_SIZE`.

### src/services/ThousandStore.js
- **L3-L4**: Import order missing blank line between built-in (`crypto`) and local module (`Round`).
- **L23, L37, L49**: Lines 134/121/121 chars (exceed 120). Spread the literals.
- **L33**: `validShape` — boolean without `is`/`has`/`should` prefix. Rename to `isValidShape`.
- **L53, L57, L63, L140, L154, L171, L185, L189, L191, L197, L288, L299, L306, L309, L324, L327**: Single-line `if (...) ...;` without braces.
- **L120-L150** (`handlePlayerDisconnect`): 4 levels of nesting; early returns on `!player.gameId` / `!round` would flatten.
- **L183-L207** and **L235-L260**: `_purgePlayer` and `_resolveGameAfterExit` duplicate the abort + broadcast block. Extract `_abortRoundAndNotify(...)`.
- **L132**: `setTimeout(..., this._gracePeriodMs)` — timer handle is not `.unref()`'d unlike sibling timers; test-hang risk.
- **L262-L272 vs L304-L320**: `_deleteGame` and `_cleanupRound` share a near-identical cleanup body. Consolidate.

### src/services/ConnectionManager.js
- **L11-L20** (`ACTION_DISPATCH`): Vertically-aligned colons will rot on renames; prefer single-space colons.
- **L144, L159**: 207- and 240-char lines (exceed 120). Spread the `connected` and `game_joined` payloads.
- **L163**: 131-char comment line. Wrap.
- **L93, L94, L136, L153, L157, L166**: Single-line `if (...) ...;` without braces.
- **L42-L44**: `ws.isAlive` custom property — add a brief comment explaining the ws-library convention (the *why*).

### src/utils/HttpUtil.js
- **L7, L30, L41, L47**: Single-line `if (...) return ...;` without braces.
- **L28**: `let aborted = false;` — rename to `isAborted`.
- **L43-L44**: Single-line `try { resolve(...); } catch { reject(...); }` — statements should be on their own lines inside braces.

### src/utils/StaticServer.js
- **L7-L22**: `MIME` is a static getter returning a fresh literal per call. Move to a module-level `const MIME = { ... };`.
- **L26**: `let urlPath;` only assigned once. Restructure to allow `const`.
- **L39**: `... || filePath === path.join(publicDir, 'index.html')` — the second clause is dead code (always covered by `startsWith(publicDirWithSep)`). Remove or document.

### src/services/DealSequencer.js
- **L9-L11, L15-L16**: Five consecutive single-line `if (pos === N) return 'seatX';` without braces.
- **L24-L31**: `hands[Number(to[4])].push(i)` parses the digit out of the string `'seat0'`/`'seat1'`/`'seat2'`. Fragile coupling — extract a `SEAT_KEYS` array or return numeric seats from `stepDest`.

### Cross-cutting observations (backend)
- **Single-line `if` without braces** affects every backend file except `server.js`, `Deck.js`, `RoundPhases.js`, `RateLimiter.js`. ESLint should be enforcing this — currently isn't.
- **Magic bid/sell numbers** (`100`, `300`, `5`, `3`) are inlined in `Round.js`; promote to `UPPER_SNAKE_CASE` constants.
- **Duplicated nickname-validation message** appears verbatim 4× in `GameController.js`. Extract a shared constant; keeping it in sync with `validators.js` rules prevents drift.
- **`{ rejected: true, reason: '...' }` return shape** repeated ~25× in `Round.js`. Extract a `reject(reason)` helper.
- **Boolean naming**: violations on return objects (`rejected`, `resolved`, `noop`, `restored`) and locals (`aborted`, `validShape`, `pausedByDisconnect`). Renaming will ripple through `RoundActionHandler.js` and `ConnectionManager.js`.

---

## Antlion Engine + Plumbing (antlion/, core/, network/, storage/, utils/, index.js)

### src/public/js/antlion/Antlion.js
- **L14, L75, L78, L85, L102**: Boolean field `_running` lacks `is`/`has`/`should` prefix. Rename to `_isRunning`.

### src/public/js/antlion/Behaviour.js
- **L4, L7, L8**: Boolean field `_enabled` lacks prefix. Rename to `_isEnabled`.
- **L12**: `update(_dt) {}` empty stub — add `// override in subclasses` so the no-op is intentional.

### src/public/js/antlion/GameObject.js
- **L6, L16, L24-26, L30**: Boolean field `_enabled` lacks prefix. Rename to `_isEnabled`.
- **L7, L27-29, L31**: Boolean field `_visible` lacks prefix. Rename to `_isVisible`.
- **L26, L29**: Parameter `bool` is uninformative. Rename to `enabled`/`visible` (or `isEnabled`/`isVisible`).
- **L24-31**: Eight one-line method bodies — convention requires braces with body on its own line.

### src/public/js/antlion/HtmlContainer.js
- **L9, L43, L44**: One-line getter/method bodies. Split body onto its own line.

### src/public/js/antlion/HtmlGameObject.js
- **L7, L19, L34, L36**: Boolean field `_dirty` lacks prefix. Rename to `_isDirty`.
- **L13**: `obj._visible = ...` reaches into a sibling class's private field; consider a protected setter.
- **L17, L19**: One-line getter/method bodies. Split.
- **L21**: `renderContent() {}` empty stub — add `// override in subclasses` comment.

### src/public/js/antlion/Scene.js
- **L8, L13, L19, L23**: Boolean field `_running` lacks prefix. Rename to `_isRunning`.

### src/public/js/core/ThousandApp.js
- **L23, L26, L31, L38, L40, L42**: Lines 127-191 chars (exceed 120). Break each validator across lines.
- **L57**: `_roundEnded` — borderline; consider `_hasRoundEnded` for strict adherence.
- **L74-L95**: `_messageHandlers` uses whitespace-padded column alignment that's fragile to edits.
- **L77, L78, L80, L90, L91**: 144-156-char one-line arrows with two statements crammed in. Extract named handlers (`_onPlayerJoined`, `_onPlayerLeft`, `_onPlayerDisconnected`, `_onPlayerReconnected`).
- **L141-L160**: `_showScreen` and `_showGameSubscreen` use magic strings (`'lobby-screen'`, `'waiting'`). Extract screen-name constants.
- **L163**: Single-line `if (...) return;` without braces.
- **L355-L407**: `_bindLeaveGame()` is 52 lines — over 50-line limit. Extract keydown and confirm handlers.
- **L379-L392**: Triple `else if` chain — extract `_handleEscapeKey()`.

### src/public/js/network/ThousandSocket.js
- **L18, L23, L37, L64**: Boolean field `_stopped` lacks prefix. Rename to `_isStopped`.
- **L23, L64**: Single-line `if (...) return;` without braces.
- **L31, L42**: Magic numbers `1` (OPEN), `2` (CLOSING), `3` (CLOSED) with inline comments. Replace with `WebSocket.OPEN`/`CLOSING`/`CLOSED`.
- **L47-L78**: `_attachHandlers` is dense (32 lines with nested onclose + reconnect math). Extract `_scheduleReconnect()`.

### src/public/js/network/GameApi.js
- **L15-L89**: Five `try/catch` blocks repeat the same shape. Extract `_request(url, body, { onErrorReturn, defaultErrorMsg })`.
- **L92**: Header names `'Content-Type'`/`'Authorization'` could be hoisted to constants.
- **L108**: `text.slice(0, 200)` magic number. Extract `MAX_ERROR_SNIPPET_LENGTH = 200`.

### src/public/js/storage/IdentityStore.js
- **L4, L16, L31**: Magic string `'thousand_identity'` repeated 3×. Extract `const STORAGE_KEY = 'thousand_identity';`.
- **L22, L23**: Single-line `if (...) out.xxx = ...;` without braces.

### src/public/js/utils/HtmlUtil.js
- **L11, L15-16**: Single-letter locals `m`/`s` and abbreviated param `secs`. Rename to `minutes`/`seconds`/`seconds`.

### Cross-cutting observations (engine + plumbing)
- Same single-line-if and boolean-prefix issues as backend — coordinated codemod recommended.
- Long lines (>120) concentrated in `ThousandApp.js` validators (six lines exceeding limit).
- Magic strings (`'thousand_identity'`, screen names, WebSocket readyState codes) should become named constants.
- `GameApi`'s five HTTP methods are near-identical; one parametric `_request` helper would shrink the file ~40%.

---

## Game UI (thousand/)

### src/public/js/thousand/GameScreen.js
- **L20-72**: `constructor` is ~51 lines — at the 50-line limit. Extract `_buildDom()`.
- **L26**: `_controlsLocked` boolean field. Rename to `_isControlsLocked` (with corresponding getter/setter rename).
- **L79-81, L86-89, L94, L127-128, L160-161, L220, L260, L312, L325, L332, L379, L389-390, L400, L410, L485, L499, L515, L564, L579, L584, L592, L595, L610, L622, L624**: Single-line `if`/`for` without braces (pervasive).
- **L137-194**: `initFromSnapshot` ~56 lines — over 50-line limit. Extract `_seedCardsFromSnapshot`, `_renderSnapshotTalon`, `_initSellSubPhase`.
- **L328-384**: `_mountControlsForPhase` ~55 lines — over 50-line limit. Split per phase.
- **L343-344, L436, L527, L593**: 101-108 char lines — over the 100-char aim.
- **L457-458**: Multiple statements on a single line; one statement per line.
- **L480-507**: `_applySellResolved` has 3-4 levels of nesting. Use early returns.
- **L603-604**: `OFFSET` and `ANIM_MS` recreated on every `_animateSprites` call. Promote to module-level constants.

### src/public/js/thousand/CardSprite.js
- **L5**: `SUIT_LETTER` duplicated in `HandView.js` L8 and `TalonView.js` L5. Extract to shared `cardSymbols.js`.
- **L11**: `_face` is stringly-typed (`'back' | 'up'`). Consider a `FACE` constant set.
- **L38, L47, L68**: Single-line `if (...) return;` without braces.

### src/public/js/thousand/CardTable.js
- **L40-L41, L46, L47, L50, L51-L52, L54**: Magic numbers `120`, `24`, `40`, `56`, `88`, `0.05`, `1.4`. Extract named constants (e.g. `SELF_BOTTOM_OFFSET_PX`).

### src/public/js/thousand/HandView.js
- **L8**: Duplicates `SUIT_LETTER`.
- **L22, L24**: Single-line `if (...) return;` without braces.
- **L55**: `setSelectionMode(enabled)` — boolean param should be `isEnabled`.
- **L76**: 102-char template — over 100-char aim.

### src/public/js/thousand/OpponentView.js
- **L11**: `_disconnected` — rename to `_isDisconnected`.
- **L26**: `setDisconnected(disconnected)` — param to `isDisconnected`.
- **L36-79**: `_render` performs 4 sub-renders in one function. Split into `_renderStack()`, `_renderLastAction()`, `_renderDisconnected()`.
- **L46**: Magic `OFFSET = 14` local. Move to module-level constant.

### src/public/js/thousand/TalonView.js
- **L5**: Third copy of `SUIT_LETTER`.

### src/public/js/thousand/StatusBar.js
- **L12-79**: `render` is 66 lines — over 50-line limit. Extract per-section helpers.
- **L37, L41**: Magic `100` (default smallest bid). Use shared bid constants.

### src/public/js/thousand/BidControls.js
- **L9, L20, L35, L37, L63, L68, L77, L87, L96**: Magic numbers `100`, `5`, `300`. Extract `MIN_BID`, `BID_STEP`, `MAX_BID`.
- **L10, L37, L49, L55, L63, L84, L93, L102, L108, L115**: Stringly-typed state `_state = 'hidden'`. Extract `BID_STATE` constant object.
- **L84, L93, L102, L115**: Single-line `if (...) return;` without braces.
- **L120-L125**: `_btn` helper duplicated in `DeclarerDecisionControls.js`, `SellBidControls.js`, `SellSelectionControls.js`. Extract to `HtmlUtil.js`.
- **Whole file**: ~95% duplicates `SellBidControls.js`. Extract a shared `BiddingControls` (parameterized by `{ inputPrefix, minBid, onSubmit, onPass }`).

### src/public/js/thousand/DeclarerDecisionControls.js
- **L9**: Stringly-typed `_mode`. Extract a constant object.
- **L52, L58**: Single-line `if (...) return;` without braces.
- **L63-L68**: `_btn` duplication.

### src/public/js/thousand/SellBidControls.js
- **L9, L20, L34**: Magic `105`, `5`, `300`. Extract constants.
- **L10**: Same stringly-typed state issue as BidControls.
- **L85, L94, L103, L115**: Single-line `if (...) return;` without braces.
- **L120-L125**: `_btn` duplication.
- **Whole file**: Near-duplicate of `BidControls.js`.

### src/public/js/thousand/SellSelectionControls.js
- **L11, L31, L37, L49, L55, L61**: `_visible` boolean. Rename to `_isVisible`.
- **L42, L55**: Magic `3` (target selection count). Extract `REQUIRED_SELECTION_COUNT`.
- **L48, L55, L61**: Single-line `if (...) return;` without braces.
- **L66-L71**: `_btn` duplication.

### src/public/js/thousand/DealAnimation.js
- **L26**: `_running` boolean (with `isRunning` getter). Rename backing field to `_isRunning`.
- **L42, L76, L92**: Single-line `if (...) return ...;` without braces.
- **L93**: Magic prefix `'seat'` parsed from string id. Pass seat index instead.

### src/public/js/thousand/RoundActionDispatcher.js
- **Whole file**: Every wire-message `type:` (`'bid'`, `'pass'`, `'sell_start'`, etc.) is hardcoded. Extract a `MSG` constant map shared with the server contract.

### Cross-cutting observations (thousand UI)
- Brace-less single-line `if`/`for`: 40+ instances across 8 files.
- Boolean fields/params missing `is`/`has`/`should`: `_controlsLocked`, `_disconnected`, `_visible`, `_running`, `enabled`, `disconnected`.
- `SUIT_LETTER` defined 3×.
- `_btn(text, className)` helper duplicated 4×.
- `BidControls.js` and `SellBidControls.js` are ~95% identical — most significant DRY hit.
- Stringly-typed state machines in `BidControls._state`, `SellBidControls._state`, `DeclarerDecisionControls._mode`.
- Bidding magic numbers `100`, `5`, `300` recur in BidControls, SellBidControls, StatusBar.
- Wire-message `type` strings hardcoded with no shared constants.

---

## Screens, Overlays, HTML/CSS

### src/public/js/screens/NicknameScreen.js
- **L30**: Boolean `ok` should be prefixed. Rename to `isOk` (or better, `claimSucceeded`).

### src/public/js/screens/GameList.js
- **L37-39**: `let li` is reassigned; consider hoisting `querySelector` and using `const li = existing ?? createNewLi()`.
- **L45-50**: Multi-line template literal injects HTML per render; extract a helper.

### src/public/js/screens/WaitingRoom.js
- **L30**: `const el = (id) => document.getElementById(id);` — cryptic single-char alias. Rename to `byId` or inline.
- **L31, L33, L35, L36**: No null-check on the result of `el(...)` before `.textContent`. If the element is missing, throws.

### src/public/js/overlays/NewGameModal.js
- **L1**: `const $ = (id) => document.getElementById(id);` duplicates `Toast.js` L1. Move to `HtmlUtil`.
- **L29**: Global keydown listener added on every `bind()` call and never removed — leak risk.
- **L57, L63**: Mixes inline `style.display` with the `.hidden` class. Toggle the class only.

### src/public/js/overlays/PlayerTooltip.js
- **L6**: Class assignment in constructor before `onCreate`. Move to `onCreate`.
- **L53, L57**: `let top`/`let left` could be `const`-with-ternary.

### src/public/js/overlays/Toast.js
- **L1**: Duplicates the `$` alias from `NewGameModal.js`. Move to `HtmlUtil`.
- **L6**: Comment `Toast — owns toast timer state (T043)` describes *what* and references a task ID. Replace with *why* or delete.
- **L20**: Magic number `4000`. Extract `TOAST_DURATION_MS`.

### src/public/js/overlays/ReconnectOverlay.js
- **L1**: Uses named `export class` while sibling overlays use `export default`. Inconsistent module style.
- **Whole file**: No header comment; siblings have headers.

### src/public/index.html
- **L17**: `<div id="reconnect-overlay">` is a status overlay. Add `role="status"` and `aria-live="polite"`.
- **L52, L61**: SVG opening tag and `<path d="...">` exceed 120 chars. Break onto multiple lines.
- **L73, L82, L84, L94, L99, L105, L139, L153, L154, L162**: Attribute order — `id` before `class`. Convention is `class, id, data-*, aria-*`.

### src/public/css/index.css
- **L45**: `display: none !important;` on `.hidden` — `!important` violation.
- **L1104, L1111**: `width: var(--card-width) !important;`, `left: 0 !important;` — `!important` violations.
- **L213, L219, L227, L279-282, L306, L316, L328, L332, L336, L392, L460, L575**: ID-based styling (`#nickname-form`, `#lobby-screen`, `#game-list`, `#game-screen`, `#leave-game-btn`, `#reconnect-overlay`, `#join-selected-btn`, `#new-game-btn`). Convention reserves IDs for JS hooks; convert to classes.
- **L316 vs L328**: Duplicate `#game-list li { cursor: pointer; }` block. Merge.
- **L132, L165**: Hardcoded `#fff`. Promote to `--color-on-primary` / `--color-text-inverse`.
- **L477**: `rgba(0, 0, 0, 0.7)` modal scrim — promote to `--color-overlay-scrim`.
- **L578**: `rgba(13, 20, 16, 0.88)` matches `--color-bg`. Use the variable.
- **L706**: `min-height: 300px;` magic px. Convert to `rem`.
- **L826, L942, L947**: Hardcoded shadow color repeated 3×. Promote to a shadow token.
- **L832, L834**: Hardcoded `#f0ede8`, `#bbb`. Promote to `--card-face-bg`, `--card-face-border`.
- **L838-843 vs L882-887**: Same gradient (`linear-gradient(135deg, ...)`) duplicated verbatim. Promote to `--gradient-card-back`.
- **L841, L884**: Hardcoded `#1e3828` (matches `--color-border`). Use the variable.
- **L51-58** (`.screen`): `min-height` before `display` — property order should be layout → sizing → spacing.
- **L63-71** (`.card`): `background` (color) appears before `border`/`padding`/`width`. Sizing/spacing should come before color/effects.
- **L188-198** (`input[type="text"]`): `background` before `border` — order mixed.

### src/public/css/cards.css
- **L11-14**: 32 individual `.card--XX` selectors share the same background block. Acceptable (CSS lacks inheritance) — noted, not a violation.

### Cross-cutting observations (screens/overlays/HTML/CSS)
- `const $ = (id) => document.getElementById(id);` defined locally in both `NewGameModal.js` (L1) and `Toast.js` (L1). `HtmlUtil.js` exists — add `byId` there.
- Attribute order on `<button>` and `<input>` elements throughout `index.html` consistently places `id` before `class` — fix as a single pass.
- `index.css` styles many layout regions via `#id` selectors (`#nickname-form`, `#lobby-screen`, `#game-list`, `#game-screen`, `#leave-game-btn`, `#reconnect-overlay`, `#join-selected-btn`, `#new-game-btn`). The convention reserves IDs for JS hooks.
- The dark surface gradient is duplicated at L838-843 and L882-887. Promote to a CSS custom property.
- Several `box-shadow` and `rgba(0, 0, 0, ...)` values are hardcoded in multiple places. Define shadow tokens in `:root`.
- Comments referencing internal task IDs (`Toast.js` L6 `(T043)`, `index.css` L589 `(T043 / T045)`, L1050 `(FR-019, FR-021)`) describe *what task added the code*, not *why*. Drop — version control covers provenance.

---

## Repository-wide recommendations

1. **Add `curly: ['error', 'all']` to ESLint** — would mechanically catch the single largest violation category (~100+ instances across the codebase).
2. **Run a boolean-naming codemod** — `_running` → `_isRunning`, `_enabled` → `_isEnabled`, `_visible` → `_isVisible`, `_dirty` → `_isDirty`, `_stopped` → `_isStopped`, `_disconnected` → `_isDisconnected`, `aborted` → `isAborted`, `validShape` → `isValidShape`, `pausedByDisconnect` → `isPausedByDisconnect`. Touch corresponding param/getter names where they cross module boundaries.
3. **Create `src/public/js/thousand/constants.js`** holding `MIN_BID = 100`, `BID_STEP = 5`, `MAX_BID = 300`, `MIN_SELL_BID = 105`, `SELL_SELECTION_SIZE = 3`, `MAX_SELL_ATTEMPTS = 3`, `SUIT_LETTER`, phase labels, screen names. Share where possible with the backend `Round.js` (constants module at `src/shared/` or duplicate-and-document).
4. **Extract `BiddingControls` base** — `BidControls.js` and `SellBidControls.js` collapse to one factory call each, ~120 lines of dup gone.
5. **Extract `RoundActionHandler._runRoundAction`** — collapses 8 handlers from 5-line preludes plus broadcast loops to ~1-line dispatches.
6. **Move `$`/`byId` to `HtmlUtil.js`** — single import everywhere.
7. **Define CSS tokens** for the duplicated gradient, shadow values, hardcoded whites, and the modal scrim.

---

## How to verify this report

1. Skim the summary at top to gauge severity.
2. Spot-check 2-3 random entries by opening the cited `file:line` and confirming the issue exists as described.
3. Re-run `npm run lint` to confirm ESLint baseline is still clean — this audit was read-only and made no code changes.
