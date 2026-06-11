# Contract: Frontend i18n API

**Feature**: 013-multilanguage-support
**Consumers**: every frontend module that displays text. **Provider**: `src/public/js/i18n/`.

## I18n class (`src/public/js/i18n/I18n.js`)

```js
const i18n = new I18n({ preferenceStore, navigatorLanguages });
```

| Member | Signature | Contract |
|--------|-----------|----------|
| `language` | `'en' \| 'ru'` (getter) | Currently active language. Resolved at construction: store value if valid, else `'ru'` when the first browser language's primary subtag is `ru`, else `'en'` (FR-007/FR-008). |
| `t` | `t(key: string, params?: object): string` | Resolution order: active catalog → English catalog → `params.fallback` if provided → the key itself only as a last resort dev aid. A returned string is **never** empty (FR-009). If the resolved value is a plural object, `params.count` selects the CLDR category via `Intl.PluralRules(this.language)`; a missing category falls back within the value (`many`→`other`→`few`→`one`) before falling back to English. All `{name}` tokens are replaced from `params`; unknown tokens are left literal (visible bug, not a crash). |
| `setLanguage` | `setLanguage(id: 'en' \| 'ru'): void` | Ignores unsupported ids. Persists via the preference store, refreshes plural rules, then emits the engine event below. Idempotent calls with the current language do not emit. |
| `SUPPORTED_LANGUAGES` | static `[{ id, selfName }]` | `[{ id: 'en', selfName: 'English' }, { id: 'ru', selfName: 'Русский' }]`. The language control renders from this list only (FR-014). |

## Engine event

| Event | Payload | Emitter | Subscribers' obligation |
|-------|---------|---------|------------------------|
| `language:changed` | `{ language: 'en' \| 'ru' }` | `I18n.setLanguage` via `Antlion.emit` | Re-render all currently visible text synchronously from retained state; MUST NOT touch game state, sockets, or storage other than reading (FR-005). |

## Catalog module shape (`catalogs/en.js`, `catalogs/ru.js`)

```js
export default {
  'lobby.openGames': 'Open Games',
  'status.waitingFor': 'Waiting for {name}',
  'stats.tricks': { one: '{count} trick', other: '{count} tricks' },   // ru: { one, few, many }
  // ...
};
```

- Flat object; dot-namespaced keys; no nesting, no functions.
- `en.js` is the complete key set; `ru.js` must contain every `en` key with a non-empty value and a `{token}` set ⊆ the English value's tokens (CI: `catalogParity.test.js`).
- Namespaces in use: `lobby.*`, `nickname.*`, `waiting.*`, `game.*`, `status.*`, `controls.*`, `history.*`, `summary.*`, `results.*`, `scoreboard.*`, `rules.*`, `toast.*`, `reject.*`, `suit.*`, `stats.*`, `lang.*`. (No `error.*` namespace — infrastructure error messages are exempt from translation.)

## Static HTML contract (`data-i18n`)

| Attribute | Meaning |
|-----------|---------|
| `data-i18n="key"` | `PageTranslator` sets the element's `textContent` to `i18n.t(key)` at boot and on every `language:changed`. The authored English text stays in the HTML as readable fallback. |
| `data-i18n-attr="placeholder:key"` (comma-separable) | Translates attribute values (`placeholder`, `title`, `aria-label`) instead of/in addition to text. |

Elements without these attributes are presentation-only (icons, numbers, player-entered content) and MUST NOT contain translatable prose.

## LanguagePreferenceStore (`src/public/js/i18n/LanguagePreferenceStore.js`)

| Member | Contract |
|--------|----------|
| `get(): 'en' \| 'ru' \| null` | Reads `localStorage['thousand_lang']`; any other value, or storage failure, returns `null` (→ default logic). |
| `set(id): void` | Best-effort write; storage failure is swallowed (mirror of `MutePreferenceStore`). |

## LanguageButton (`src/public/js/i18n/LanguageButton.js`)

- Binds every `.lang-btn` element via `antlion.bindInput(el, 'click', 'language-toggle')`; the single `onInput` handler calls `i18n.setLanguage(<other language>)`.
- Reflects state on every `language:changed`: button face shows the target language's abbreviation, `title`/`aria-label` carry the full `selfName`s.
- Present in both the lobby header and the in-game `ScoreboardPanel` icon row (FR-004).

## Formatter convention

Pure text formatters take the translate function as their first argument and stay side-effect free:

```js
computeStatusText(t, gameStatus, ctx)      // statusText.js
historyEntryText(t, entry, seats)          // historyEntryText.js
formatRoundStats(t, stats)                 // roundStatsText.js
```

Player names, game names, and bot names are always passed through as params, never translated (FR-012).
