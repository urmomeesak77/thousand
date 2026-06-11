# Data Model: Multilanguage Support (English + Russian)

**Feature**: 013-multilanguage-support | **Date**: 2026-06-11

## Entities

### Language

A supported display language. Static, code-defined — not stored server-side.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `'en' \| 'ru'` | Stable identifier; catalog file name, storage value, `Intl.PluralRules` locale. |
| `selfName` | string | Self-referential display name for the control: `"English"`, `"Русский"` (Key Entities, spec). |

Defined once in `I18n.js` as `SUPPORTED_LANGUAGES`. Adding a language = new catalog file + one entry here (FR-014).

### Translation Catalog

One ES module per language: `src/public/js/i18n/catalogs/<id>.js`, default-exporting a flat object.

| Aspect | Rule |
|--------|------|
| Key | Dot-namespaced string, stable across languages: `lobby.openGames`, `status.yourTurn`, `history.bid`, `reject.notYourTurn`, `rules.goal.body`. |
| Simple value | Display string, optionally with `{param}` placeholders: `"Waiting for {name}"` / `"Ожидание {name}"`. |
| Plural value | Object keyed by CLDR category, selected by `params.count`: en `{ one, other }`, ru `{ one, few, many }` (+ optional `other`): `tricks: { one: "{count} взятка", few: "{count} взятки", many: "{count} взяток" }`. |
| Source of truth | `en.js` defines the complete key set; `ru.js` must mirror it (enforced by `catalogParity.test.js`). |
| Fallback | Key missing/empty in the active catalog → resolve from `en.js`; missing there too → return the key's English literal caller-side fallback text where provided, never a blank or the raw key alone (FR-009). |

**Validation rules**: keys are non-empty strings; values are non-empty strings or plural objects whose every present category value is a non-empty string; `{param}` tokens used in `ru` must be a subset of those in the `en` value (parity test).

### Language Preference

Per-browser record, mirroring the mute preference (clarified in spec).

| Field | Type | Notes |
|-------|------|-------|
| storage key | `'thousand_lang'` | `localStorage`, best-effort try/catch (Safari private mode safe). |
| value | `'en' \| 'ru'` | Any other value (or read failure) ⇒ treated as **absent** → default logic (edge case, FR-008). |
| written when | user explicitly picks a language | Never written by auto-detection, so undecided browsers keep tracking `navigator.language`. |

### I18n (runtime service — frontend only)

| State | Type | Notes |
|-------|------|-------|
| `language` | `'en' \| 'ru'` | Resolved at boot: stored preference → else browser detection (`ru*` → `ru`, else `en`). |
| `_catalogs` | `{ en, ru }` | Both imported statically. |
| `_plural` | `Intl.PluralRules` | Re-created on language change. |

**Behaviour**: `t(key, params?)` → resolve value in active catalog (plural-select if object and `params.count` present) → fallback to `en` → interpolate `{param}` tokens. `setLanguage(id)` → validate, persist via store, swap plural rules, `Antlion.emit('language:changed', { language: id })`.

### Structured Server Message Code (extension of existing payloads)

Not a new message type — new fields on existing gameplay-prose payloads (`action_rejected`, `game_join_failed`; see `contracts/ws-rejection-codes.md`). Infrastructure `error` payloads are exempt and unchanged (clarified 2026-06-11).

| Field | Type | Notes |
|-------|------|-------|
| `code` | string | Stable catalog key, `reject.*` namespace. |
| `params` | object? | Interpolation values, all primitives (e.g. `{ min: 110 }`, `{ step: 10 }`). |
| `reason` | string | Unchanged English prose — the universal fallback (FR-009) and log/test text. |

## State Transitions

```
boot:
  stored 'en'|'ru'              → language = stored value          (FR-007, US3)
  absent/invalid + browser ru*  → language = 'ru'                  (FR-008)
  absent/invalid otherwise      → language = 'en'                  (FR-008)

user toggles language control:
  setLanguage(other)
    → persist 'thousand_lang'                                      (FR-007)
    → emit language:changed
        → PageTranslator re-walks [data-i18n]                      (static text)
        → GameScreen re-renders from _lastGameStatus/_lastSnapshot (controls, status, scoreboard)
        → HistoryPanel re-renders from actionHistory               (FR-011)
        → lobby screens re-render from app state
  game state, sockets, other players: untouched                    (FR-005, FR-006)
```

## Relationships

- `index.js` constructs `I18n` (with `LanguagePreferenceStore`) **before** any screen renders, passes it down via `ThousandApp` exactly like `Toast`/`GameApi`.
- Pure formatters (`statusText`, `historyEntryText`, `roundStatsText`) receive a translate function (or the `I18n` instance) as an argument — they stay pure and unit-testable in both languages.
- Player-entered text (nicknames, game names) and bot names are `params`, never keys — interpolated verbatim in every language (FR-012).
