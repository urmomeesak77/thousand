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
node server.js
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
package.json        — declares ws dependency
server.js           — HTTP + WebSocket server, all game state
public/
├── lobby.html      — lobby page shell
├── lobby.css       — lobby styles
└── lobby.js        — lobby client logic
```

## Port

Default port is `3000`. Override with the `PORT` environment variable:

```bash
PORT=8080 node server.js
```
