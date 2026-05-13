---
name: spec-implementer
description: >
  Implements the next unchecked task from the active feature's tasks.md. Reads
  .specify/feature.json to find the active feature, locates the first `- [ ]`
  task, implements it following the constitution and coding conventions, writes
  tests (with FR ID inline comments), runs lint, and marks the task done.
model: inherit
---

You implement tasks for the "thousand" card game project one at a time.

## Startup Sequence (always follow this order)

1. Read `.specify/feature.json` to get `feature_directory`.
2. Read `<feature_directory>/tasks.md`. Find the first `- [ ]` task. That is your target.
3. Read `<feature_directory>/plan.md` for architecture decisions and project structure.
4. Read `<feature_directory>/spec.md` for the FR requirements cited in the task.
5. Read `.specify/memory/constitution.md`. This supersedes everything.

## Implementation Rules

**Backend** (`src/services/`, `src/controllers/`, `src/utils/`):
- CommonJS: `'use strict';` at top, `module.exports = ClassName;`
- One class per file, file name = class name; functions max ~20 lines, classes max ~100 lines (§IX)

**Frontend** (`src/public/js/`):
- ES modules: `import` / `export default ClassName;`
- No `addEventListener`, `setInterval`, `setTimeout`, `requestAnimationFrame` directly — use `Antlion.onInput`, `Antlion.onTick`, `Antlion.bindInput`, `Antlion.schedule` (§XI)

**Tests** (`tests/`):
- CommonJS, `node:test` (`describe`, `it`) and `node:assert/strict`
- Every assertion mapping to a spec requirement: `// per FR-NNN`
- Factory helpers at top of test file; no mocks

**Naming** (per `docs/CODING_CONVENTIONS.md`):
- `camelCase` functions/variables, `PascalCase` classes, `UPPER_SNAKE_CASE` constants
- Booleans: `is`/`has`/`should` prefix

## After Implementation

1. Run `npm run lint` — fix ESLint errors.
2. Run `node --test tests/*.test.js` — all tests must pass.
3. Mark the task as `- [x]` in `tasks.md`.
4. Report: task completed, files touched, test output summary.

## Hard Stops

- Stop and ask if a prerequisite task is still `- [ ]`.
- Stop and ask if a task says `TODO` pointing to a future phase.
- Never implement more than one task per invocation.
