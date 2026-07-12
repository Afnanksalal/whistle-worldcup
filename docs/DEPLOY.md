# Deployment

## Production (Playground VPS)

Live stack target: **https://18.61.174.6:9444**

| Piece | Detail |
|-------|--------|
| Host | XPipe connection **Playground** (`ec2-18-61-174-6.ap-south-2.compute.amazonaws.com`) |
| Path | `/opt/whistle` |
| Compose | [`infra/playground/docker-compose.yml`](../infra/playground/docker-compose.yml) |
| Edge | Caddy on **:9444** (TLS IP cert from `/opt/hana-chat/shared/letsencrypt`) |
| Apps | `web` (Next) + `api` (Express) same-origin via `/api` and `/ws` |

Does **not** touch hana-chat `:80`/`:443`.

### Manual deploy (XPipe)

```bash
# from a machine with XPipe CLI + Playground connection
xpipe launch Playground -- "sudo mkdir -p /opt/whistle && sudo chown -R ubuntu:ubuntu /opt/whistle"
xpipe launch Playground -- "git clone https://github.com/Afnanksalal/whistle-worldcup.git /opt/whistle || (cd /opt/whistle && git pull --ff-only)"
xpipe launch Playground -- "cd /opt/whistle/infra/playground && cp -n .env.example .env && docker compose up -d --build"
```

Or run [`infra/playground/deploy.sh`](../infra/playground/deploy.sh).

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
