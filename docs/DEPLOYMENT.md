# Deployment — games.online-trash.com/thousand

Production runs as a Docker container on a **zone.ee VPS (virtuaalserver)** behind
**nginx, which itself runs as a Docker container** (shared infra at `/web/` on the
host: `web` = nginx, `certbot` = TLS issuance; config in `/web/nginx/conf.d/`).
nginx terminates TLS and proxies the `/thousand` subpath to the app container.
WebSockets require a real reverse proxy with HTTP upgrade — zone.ee *web hosting*
cannot do this, which is why we use a VPS with root.

## How the subpath works

nginx strips the `/thousand` prefix before forwarding, so the Node app keeps
serving from the root (`/`, `/css/...`, `/api/...`, `/ws`) and its routing is
unchanged. The client is made subpath-aware at runtime:

- The server injects `<base href="/thousand/">` into `index.html` (from `BASE_PATH`;
  see `src/utils/StaticServer.js`). Relative asset URLs resolve against it.
- `src/public/js/utils/basePath.js` derives `BASE_PATH` from that `<base>` tag;
  `GameApi.js` and `ThousandSocket.js` prefix their REST/WS URLs with it.

With `BASE_PATH` unset the app serves from `/` exactly as in local dev.

## Networking (containerized nginx → app)

Because nginx is a **container**, it reaches the app over the Docker **host-gateway**,
not the host loopback. Two requirements:

1. The app container publishes on a **bridge-reachable** port. The shipped
   `docker-compose.yml` uses `ports: ["3000:3000"]` (all interfaces). A loopback-only
   bind (`127.0.0.1:3000`) is **not** reachable from the nginx container — do not use it.
2. **Firewall port 3000** so it is not publicly reachable; nginx `:443` is the only
   public entry point. Apply via the zone.ee firewall or `ufw`:
   ```bash
   ufw deny 3000/tcp        # block public 3000 (Docker's own bridge still reaches it)
   ```
   (Stricter alternative: bind to the bridge gateway IP instead of all interfaces,
   e.g. `"172.17.0.1:3000:3000"` — find it via `docker network inspect bridge`; more
   private but fragile if the bridge IP changes.)

The nginx service needs `extra_hosts: ["host.docker.internal:host-gateway"]` (already
set in the infra `temp/docker-compose.yml`) and proxies to
`http://host.docker.internal:3000/`.

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

1. **Host tooling** (already present for the shared nginx stack): Docker Engine +
   compose plugin. `systemctl enable --now docker`.
2. **DNS:** in the zone.ee panel, add an `A` (and `AAAA`) record for
   `games.online-trash.com` → the VPS IP.
3. **Start the app (pull from GHCR + run — no compose file or clone on the VPS):**
   the server just downloads the prebuilt image and runs it. `docker-compose.yml`
   lives in the repo only as the **dev-machine** build/push tool.

   On your **dev machine** — build and push the image (one-time login first):
   ```powershell
   # Windows PowerShell — set a write:packages PAT, then log in:
   $env:GHCR_PAT = "ghp_your_token"
   $env:GHCR_PAT | docker login ghcr.io -u urmomeesak77 --password-stdin
   docker compose build
   docker compose push
   ```
   The GHCR package is **public**, so the VPS pulls without any login.

   On the **VPS** — one command (auto-pulls the image on first run):
   ```bash
   docker run -d --name thousand --restart unless-stopped \
     -p 3000:3000 \
     -e NODE_ENV=production \
     -e BASE_PATH=/thousand \
     -e ALLOWED_ORIGINS=https://games.online-trash.com \
     ghcr.io/urmomeesak77/thousand:latest        # firewall :3000 — see above
   ```
4. **nginx config** — edit the containerized nginx config at
   `/web/nginx/conf.d/default.conf` (see `deploy/nginx-thousand.conf` for the snippet):
   - add the `map $http_upgrade $connection_upgrade { ... }` block (http context);
   - add the `/thousand` `location` blocks inside the `games.online-trash.com`
     `server { listen 443 ssl; }` block, before `location /`.
   Ensure the nginx service has `extra_hosts: ["host.docker.internal:host-gateway"]`,
   then recreate + reload:
   ```bash
   cd /web && docker compose up -d                       # picks up extra_hosts
   docker compose exec web nginx -t
   docker compose exec web nginx -s reload
   ```
5. **TLS:** the `games.online-trash.com` server block must use a cert that **covers
   that hostname**. The acme-challenge `location` is already wired. If the existing
   `online-trash.com` cert is not a SAN/wildcard covering the subdomain, issue one:
   ```bash
   cd /web && docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
     -d games.online-trash.com
   ```
   then point `ssl_certificate` / `ssl_certificate_key` in the games block at the
   correct `/etc/letsencrypt/live/...` path and reload nginx.
6. **Verify:** open `https://games.online-trash.com/thousand/` and play through
   nickname → lobby → bidding → trick play (confirms the WebSocket path works).
   Confirm `https://games.online-trash.com:3000` is **not** reachable publicly.

## Redeploys

**Manual (Phase 1):** rebuild + push from your dev machine, then pull + replace on the VPS:
```bash
# dev machine
docker compose build && docker compose push
# VPS — pull the new :latest, drop the old container, run the new one
docker pull ghcr.io/urmomeesak77/thousand:latest
docker rm -f thousand
docker run -d --name thousand --restart unless-stopped -p 3000:3000 \
  -e NODE_ENV=production -e BASE_PATH=/thousand \
  -e ALLOWED_ORIGINS=https://games.online-trash.com \
  ghcr.io/urmomeesak77/thousand:latest
docker image prune -f
```

**CI/CD (Phase 2 — GHCR + SSH):** pushing to `master` (after CI passes) builds and
pushes `ghcr.io/urmomeesak77/thousand` to GHCR, then SSHes to the VPS to pull and
restart — see `.github/workflows/deploy.yml` (same `docker pull` → `rm -f` → `docker run`).
Required GitHub repo secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (and, if the GHCR
package is private, a `GHCR_TOKEN` the VPS uses for `docker login ghcr.io`).

## Operational notes

- **State is in-memory** (`ThousandStore`): a restart/redeploy drops all active
  games and sessions. Deploy when no game is mid-round.
- Logs: `docker logs -f thousand`. Status: `docker ps`.
