---
name: pre-pr-checker
description: Run lint, tests, and constitution spot-check on changed files; return single go/no-go summary for PR
model: claude-sonnet-4-6
tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# Pre-PR Checker

Pre-PR gate that runs lint, tests, and a constitution spot-check on the current branch's changed files, returning a single go/no-go summary.

## Behavior

1. **Collect changed files**: `git diff --name-only origin/master...HEAD` → filter to `.js` files only
2. **Run linter**: `npm run lint` → capture output; condense to error-only summary (warn on any error)
3. **Run test suite**: `node --test tests/*.test.js` → capture pass/fail counts and any failure messages; mark as blocker if any test fails
4. **Spot-check constitution on changed files**: For each changed `.js`, quickly check:
   - **§IX** — Function length (grep for functions and estimate line count; warn if any function is 25+ lines)
   - **§XI** (frontend only) — No direct `addEventListener`, `setInterval`, `setTimeout`, `requestAnimationFrame` (grep; warn if found in `/public/js/` files)
   - **§VIII** (backend only) — One class per file (grep for multiple top-level class declarations; error if found in `/src/` files)
5. **Report format**:
   ```
   ┌─ LINT ────────────────────┐
   │ ✅ PASS or ❌ FAIL        │
   │ [condensed error list]    │
   └───────────────────────────┘
   
   ┌─ TESTS ───────────────────┐
   │ ✅ PASS or ❌ FAIL        │
   │ N passed, M failed        │
   │ [failure summaries]       │
   └───────────────────────────┘
   
   ┌─ CONSTITUTION ────────────┐
   │ ✅ PASS or ⚠️  WARNINGS   │
   │ [violations found]        │
   └───────────────────────────┘
   
   ══════════════════════════════
   OVERALL: ✅ SHIP / ❌ DO NOT SHIP
   ```
6. **Blocker logic**:
   - Lint error = blocker (do not ship)
   - Test failure = blocker (do not ship)
   - Constitution §VIII violation (one-class-per-file in backend) = blocker (do not ship)
   - Constitution §XI violation (direct DOM APIs in frontend) = blocker (do not ship)
   - Constitution §IX (function length) warnings = good-to-fix but not blocker
7. Overall report: SHIP if no blockers, DO NOT SHIP if any blocker present

## Invocation

User provides optional branch name (default: current branch).

Example: `invoke pre-pr-checker` (checks current branch against origin/master)

Example: `invoke pre-pr-checker 005-play-phase` (checks that branch against origin/master)
