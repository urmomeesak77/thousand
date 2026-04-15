# Quickstart: Card Game 1000 — Lobby

## Prerequisites

- Node.js v18 or higher
- npm

## Setup

```bash
npm install
```

This installs the single dependency: `ws` (WebSocket server).

## Run

```bash
node src/server.js
```

Server starts on `http://localhost:3000`.

## Play

Open `http://localhost:3000` in one or more browser tabs.

- Enter a nickname to enter the lobby
- **Join a game**: click Join on any listed game
- **Create a public game**: click "New Game" → Public
- **Create a private game**: click "New Game" → Private → share the invite code
- **Join via invite code**: click "Join with Code" → enter the code

## File Layout

```
package.json                   — declares ws dependency
src/
├── server.js                  — HTTP + WebSocket server entry point
├── services/ThousandStore.js  — in-memory state + WebSocket handling
├── controllers/RequestHandler.js — HTTP routing and endpoint logic
└── utils/                     — HttpUtil, StaticServer helpers
src/public/
├── index.html                 — lobby page shell
├── css/index.css              — lobby styles
└── js/
    ├── index.js               — entry point
    ├── ThousandApp.js         — lobby coordinator
    ├── ThousandRenderer.js    — DOM rendering
    ├── ThousandSocket.js      — WebSocket wrapper
    ├── Toast.js / GameApi.js / ModalController.js
    └── antlion/               — engine layer
tests/                         — backend test files
```

## Port

Default port is `3000`. Override with the `PORT` environment variable:

```bash
PORT=8080 node src/server.js
```
