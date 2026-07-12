# Deployment

## Production (Playground VPS)

| Piece | Detail |
|-------|--------|
| Host | XPipe **Playground** (`ec2-18-61-174-6.ap-south-2.compute.amazonaws.com`) |
| Path | `/opt/whistle` |
| Compose | [`infra/playground/docker-compose.yml`](../infra/playground/docker-compose.yml) |
| Public URL | Cloudflare quick tunnel (see live URL in `docker logs playground-tunnel-1`) |
| Local edge | Caddy `:8088` (HTTP) + `:9444` (TLS IP cert; SG often closed / cert may be expired) |
| Apps | `web` + `api` same-origin via `/api` and `/ws` |

Does **not** touch hana-chat `:80`/`:443`.

### Current live URL

Quick tunnels rotate when the `tunnel` container restarts. Get the active URL:

```bash
ssh playground 'docker logs playground-tunnel-1 2>&1 | grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" | tail -1'
```

Example (may be stale): `https://membership-public-gave-racks.trycloudflare.com`

### Start / update stack

```bash
cd /opt/whistle && git pull --ff-only origin master
cd infra/playground
cp -n .env.example .env
docker compose up -d --build
docker compose --profile tunnel up -d tunnel
```

Or from a machine with XPipe: [`infra/playground/deploy.sh`](../infra/playground/deploy.sh) then enable the tunnel profile.

### CI/CD

| Workflow | Trigger | Action |
|----------|---------|--------|
| `.github/workflows/ci.yml` | PR / push | `npm run check` + web build + `cargo check` |
| `.github/workflows/deploy-playground.yml` | push `master` / manual | SSH → `git pull` → `docker compose up -d --build` |

Required GitHub secrets:

- `PLAYGROUND_SSH_KEY` — private key authorized on the VPS
- `PLAYGROUND_HOST` — EC2 hostname
- `PLAYGROUND_USER` — `ubuntu`

### AWS note

Security group must allow **inbound TCP 9444** from the internet (or your testers).

## Vercel (optional frontend)

Vercel CLI must be authenticated (`npx vercel login`). Then:

```bash
cd apps/web
npx vercel --prod \
  -e NEXT_PUBLIC_API_URL=https://18.61.174.6:9444 \
  -e NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
```

Prefer playground same-origin deploy unless you need a `*.vercel.app` URL for Superteam.

## Local (demo)

```bash
npm install
npm run build -w @whistle/shared
npm run dev:api   # :4000
npm run dev:web   # :3000
```

## Solana program (devnet)

```bash
anchor build
anchor deploy --provider.cluster devnet
```

Set `WHISTLE_PROGRAM_ID` on the API when the program is live.

## Superteam checklist

See [SUBMISSION.md](./SUBMISSION.md) and [TASKS.md](./TASKS.md).
