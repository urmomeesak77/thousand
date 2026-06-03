# Deployment — games.online-trash.com/thousand

Production runs as a Docker container on a **zone.ee VPS (virtuaalserver)** behind
the host's **nginx**, which terminates TLS and proxies the `/thousand` subpath to
the container. WebSockets require a real reverse proxy with HTTP upgrade — zone.ee
*web hosting* cannot do this, which is why we use a VPS with root.

## How the subpath works

nginx strips the `/thousand` prefix before forwarding, so the Node app keeps
serving from the root (`/`, `/css/...`, `/api/...`, `/ws`) and its routing is
unchanged. The client is made subpath-aware at runtime:

- The server injects `<base href="/thousand/">` into `index.html` (from `BASE_PATH`;
  see `src/utils/StaticServer.js`). Relative asset URLs resolve against it.
- `src/public/js/utils/basePath.js` derives `BASE_PATH` from that `<base>` tag;
  `GameApi.js` and `ThousandSocket.js` prefix their REST/WS URLs with it.

With `BASE_PATH` unset the app serves from `/` exactly as in local dev.

## Configuration (env vars)

| Var | Production value | Notes |
|-----|------------------|-------|
| `PORT` | `3000` | Container listen port. |
| `BASE_PATH` | `/thousand` | Subpath prefix injected into HTML / used by the client. |
| `ALLOWED_ORIGINS` | `https://games.online-trash.com` | Exact-match allowlist for the WS `Origin`. |
| `NODE_ENV` | `production` | |
| `GRACE_PERIOD_MS` | (default `3000`) | Reconnect grace window. |

All are set in `docker-compose.yml`.

## First-time bring-up on the VPS

1. **Install host tooling:** Docker Engine + compose plugin, nginx, certbot (`python3-certbot-nginx`).
   Enable Docker on boot: `systemctl enable --now docker`.
2. **DNS:** in the zone.ee panel, add an `A` (and `AAAA`) record for
   `games.online-trash.com` → the VPS IP.
3. **Start the app:**
   ```bash
   git clone <repo> thousand && cd thousand
   docker compose up -d --build
   ```
   The container now listens on `127.0.0.1:3000` only.
4. **nginx + TLS:**
   ```bash
   cp deploy/nginx-thousand.conf /etc/nginx/sites-available/games.online-trash.com
   ln -s /etc/nginx/sites-available/games.online-trash.com /etc/nginx/sites-enabled/
   certbot --nginx -d games.online-trash.com   # adds the cert + :80→:443 redirect
   nginx -t && systemctl reload nginx
   ```
   (The `map $http_upgrade $connection_upgrade` block must live in an `http {}`
   context — if your nginx splits configs, move it to `conf.d/` rather than the
   server block.)
5. **Verify:** open `https://games.online-trash.com/thousand/` and play through
   nickname → lobby → bidding → trick play (confirms the WebSocket path works).

## Redeploys

```bash
git pull && docker compose up -d --build
```

## Operational notes

- **State is in-memory** (`ThousandStore`): a restart/redeploy drops all active
  games and sessions. Deploy when no game is mid-round.
- Logs: `docker compose logs -f thousand`.
