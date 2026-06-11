---
name: translating-english-to-russian
description: Use when translating English text into Russian or reviewing Russian translations — UI strings, i18n catalogs (ru.js, .po, .json locale files), docs, error messages, or prose. Also use when adding new keys to an existing Russian catalog or choosing Russian plural forms.
---

# Translating English to Russian

## Overview

Translate **meaning into natural Russian**, then verify against the checklist below. Consistency with the project's established glossary beats your own preference — a "better" word that differs from the existing catalog is a worse translation.

## Process

1. **Find the existing glossary first.** If the project has a Russian catalog (`ru.js`, `.po`, locale JSON), grep it for the same concepts and reuse its exact terms and phrasing patterns. Never re-translate a concept the catalog already names.
2. **Translate the meaning**, then read your Russian aloud — would a native app say this? If it mirrors English word order or includes «пожалуйста» in UI text, rewrite.
3. **Run the checklist** (below) on every string before delivering.
4. **Preserve the original meaning exactly** — same tense, same certainty, same scope. "has left" ≠ «покидает» (is leaving); "eventually" ≠ «постепенно» (gradually); "eventually" → «со временем» / «в конечном счёте».

## Plural Forms (most common error)

Russian counted nouns need three forms. The EXACT rules (CLDR):

| Category | Rule | Examples |
|----------|------|----------|
| one | ends in 1, but NOT 11 | 1, 21, 101 → «1 час», «21 взятка» |
| few | ends in 2–4, but NOT 12–14 | 2, 23, 104 → «2 часа», «23 взятки» |
| many | everything else — incl. 0, 5–20, **11–14, 111–114** | 0, 5, 11, 111 → «111 часов», «0 взяток» |

**The trap:** 11, 111, 211 are NOT "one" (11 часов); 12–14, 112–114 are NOT "few". Apply `n % 100` first.
Verify when unsure: `new Intl.PluralRules('ru').select(n)`. Fractions (1,5) take a fourth form («1,5 часа») — only handle if counts can be fractional.

## Checklist

| Issue | Rule |
|-------|------|
| Address | «вы» (lowercase — «Вы» only in personal letters) unless product voice is explicitly casual/youth → «ты». Pick once, apply everywhere. |
| Buttons/menus | Infinitive or noun: «Сохранить», «Отмена», «Настройки» — never «Сохраните» |
| Instructions to user | Imperative вы-form: «Нажмите кнопку «Сохранить»» |
| "Please" | Drop it in UI text; Russian UI states actions directly |
| Placeholders | Keep `{tokens}` byte-identical. Russian declines nouns — never put `{name}` where a case is required; add a role noun carrying the case: «Контракт продан игроку {name}» |
| Unknown-gender subject | Past-tense verbs are gendered («покинул/покинула»). Restructure («{name} — пас»), or follow project convention (many use masculine default) — just be consistent with the catalog |
| Adjective + substituted noun | «Новый {item}» breaks on feminine nouns; use colon form: «Добавлен новый объект: {item}» |
| Quotes | «ёлочки» outer, „лапки" nested — never straight `"` |
| Dash / ellipsis | Em dash «—» between clauses; en dash in ranges (100–300); the `…` character, never `...` |
| Numbers/dates | 1 234,56 (space thousands, comma decimal); «5 марта 2026 г.»; use `Intl.*Format('ru-RU')` for dynamic values |
| ё | Follow the project's existing policy; if none, write ё consistently («бьёт», «ещё») |
| Length | Russian runs ~20–30% longer; warn if a button/label translation may overflow |

## False Friends (never translate by sound)

accurate ≠ аккуратный (→ точный) · magazine ≠ магазин (→ журнал) · sympathetic ≠ симпатичный (→ сочувствующий) · actually ≠ актуально (→ на самом деле) · data ≠ дата (→ данные) · list ≠ лист (→ список) · intelligent ≠ интеллигентный (→ умный) · cabinet ≠ кабинет (→ шкаф/правительство) · decade ≠ декада (→ десятилетие) · fabric ≠ фабрика (→ ткань)

## Card-Game Terminology (trick-taking games, Тысяча)

trick → взятка (not трюк) · trump → козырь · bid → заказ/ставка · marriage → марьяж (not брак) · talon/widow → прикуп · declarer → разыгрывающий · barrel → бочка · suit → масть · lead → ходить · follow suit → ходить в масть

## Common Mistakes

| Mistake | Reality |
|---------|---------|
| "111 ends in 1 → one-form" | 111 % 100 = 11 → many: «111 часов» |
| Translating without checking the existing catalog | The catalog's term IS the correct term. «покинул игру» established → don't write «покидает игру» |
| Idioms word-for-word ("you're killing it") | Translate intent: «Ты молодец!» |
| `...` because the source had it | Russian typography uses `…` |
| Shifting tense/aspect to smoother Russian | Meaning fidelity first: "has left" = «покинул», not «покидает» |
| Padding with «пожалуйста», «Вы» capitalized | UI Russian is direct; lowercase «вы» |
