# Quickstart: Multilanguage Support (English + Russian)

**Feature**: 013-multilanguage-support

## Run it

```bash
npm start            # http://localhost:3000
```

1. Open the lobby. With a Russian-language browser (or `navigator.language = 'ru-RU'`) the UI opens in Russian; otherwise English (FR-008).
2. Click the language button (lobby header, or the scoreboard icon row in-game, next to mute/rules) — every visible label switches instantly, no reload (FR-004/FR-005).
3. Reload the page — the chosen language sticks (`localStorage['thousand_lang']`, FR-007).

## Verify the user stories

**US1 — full Russian session (P1)**: select Русский, then walk nickname → lobby → new game → waiting room (add bots) → bidding → selling/exchange → trick play (declare a marriage) → round summary → final results → rules modal. No English string should appear anywhere, including toasts and rejection messages (force one: bid out of turn from a second tab).

**US2 — switch mid-game (P2)**: join a game in English, switch to Русский during bidding or trick play. Controls, status bar, scoreboard, trump box, and *existing* history-panel entries re-render in Russian immediately; hand/bids/turn are untouched. A second player in another browser stays in their own language (FR-006).

**US3 — preference remembered (P3)**: pick Русский, close the tab, reopen — first paint is Russian. Kill the server connection mid-game and reconnect — the restored game screen is Russian.

**Plural forms (FR-010)**: in Russian check the per-seat round stats and history for correct forms — 1 взятка / 2 взятки / 5 взяток, and the same pattern for points.

**Fallback (FR-009)**: temporarily delete a key from `catalogs/ru.js` — the English text must appear in its place (never a blank or the raw key). Restore it; `catalogParity.test.js` fails while it is missing.

## Tests

```bash
npm test                                  # full suite
node --test tests/I18n.test.js            # lookup, params, fallback, ru plurals
node --test tests/catalogParity.test.js   # every en key has a non-empty ru entry
node --test tests/rejection-codes.test.js # server codes exist in the en catalog
npm run lint
```

## Where things live

| Concern | Location |
|---------|----------|
| i18n service, store, button, page translator | `src/public/js/i18n/` |
| Catalogs (en = source of truth) | `src/public/js/i18n/catalogs/en.js`, `ru.js` |
| Static text keys | `data-i18n` attributes in `src/public/index.html` |
| Server message codes | `code`/`params` beside existing `reason`/`message` (see `contracts/ws-rejection-codes.md`) |
| Adding language N+1 | new `catalogs/<id>.js` + one `SUPPORTED_LANGUAGES` entry + grow the toggle into a menu (FR-014) |
