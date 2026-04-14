# Thousand Constitution

## Core Principles

### I. Stack
Frontend: Vanilla JS, HTML, CSS — no frameworks, no build tools. Backend: Node.js — no TypeScript, no transpilation. Open files directly or serve via Node's built-in `http` module.

### II. Single-File Frontend
Each game page is a single `.html` file. No inline CSS or JS. No bundlers, no imports, no CDN dependencies.

### III. Simplicity First
Write the least code that works. No abstractions for future requirements. No utility libraries unless a feature genuinely needs them.

### IV. Backend as Thin Server
Node.js backend.

### V. No Build Step
What ships is what you wrote. No compilation, no minification, no transpilation in the hot path.

### VI. Responsive Design
Every page must be usable on mobile, tablet, and desktop. Use CSS media queries and relative units — no fixed-width layouts. Touch targets must be large enough for finger use.

## Tech Stack

- **Frontend**: HTML5, CSS3 (inline), Vanilla JS (ES6+)
- **Backend**: Node.js (CommonJS), raw `http` module
- **Data**: In-memory or flat JSON files — no database unless explicitly added
- **Testing**: Both frontend and backend, minimum 90% coverage

## Development Workflow

- Edit files directly; refresh browser to test frontend
- Run `node server.js` (or equivalent) to start backend
- No linting, no CI, no pre-commit hooks unless added

## Governance

This constitution supersedes CLAUDE.md for architectural decisions. Keep it minimal — only amend when a new constraint is truly project-wide.

**Version**: 1.1.0 | **Ratified**: 2026-04-14 | **Last Amended**: 2026-04-14
