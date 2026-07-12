# Whistle — production VPS only (no Vercel, no demo mode)

## Stack

| Piece | Detail |
|-------|--------|
| Host | XPipe **Playground** EC2 (`ec2-18-61-174-6.ap-south-2.compute.amazonaws.com`) |
| Path | `/opt/whistle` |
| Compose | [`infra/playground/docker-compose.yml`](../infra/playground/docker-compose.yml) |
| Edge | Caddy same-origin `/api` + `/ws` + Next.js |
| Public | Cloudflare tunnel (or TLS `:9444` when SG/cert ready) |

## Required secrets (VPS `.env`)

```bash
TXLINE_API_TOKEN=...          # mandatory — API will not boot without it
ADMIN_API_KEY=...             # ≥16 chars — settle/void/admin console
API_CORS_ORIGIN=same-origin   # behind Caddy; or explicit https://your.host
NEWS_API_KEY=...              # optional; RSS fallback if unset
WHISTLE_PROGRAM_ID=...        # optional until Anchor deploy
REQUIRE_WALLET_AUTH=true
```

`DEMO_MODE` / `ALLOW_SANDBOX` are **removed**. Setting them crashes boot.

## Deploy

```bash
cd /opt/whistle && git fetch origin && git reset --hard origin/master
cd infra/playground
# edit .env — must include TXLINE_API_TOKEN + ADMIN_API_KEY
docker compose up -d --build
docker compose --profile tunnel up -d tunnel
curl -sf http://127.0.0.1:8088/api/health
docker logs playground-tunnel-1 2>&1 | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1
```

## Observability

| Endpoint | Purpose |
|----------|---------|
| `GET /api/live` | Liveness |
| `GET /api/ready` | Readiness (fixtures loaded) |
| `GET /api/health` | JSON health + counters |
| `GET /api/metrics` | Prometheus text |

Structured JSON logs via pino. Request IDs on `x-request-id`.

## Admin

Open `/admin` on the site, paste `ADMIN_API_KEY` (stored in browser localStorage only).

## CI/CD

| Workflow | Action |
|----------|--------|
| `ci.yml` | check + build |
| `deploy-playground.yml` | SSH → pull → compose rebuild |

Secrets: `PLAYGROUND_SSH_KEY`, `PLAYGROUND_HOST`, `PLAYGROUND_USER`.

## Local (still live-only)

```bash
cp .env.example .env   # set TXLINE_API_TOKEN + ADMIN_API_KEY
npm install
npm run build -w @whistle/shared
npm run dev:api
npm run dev:web
```
