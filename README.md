# Whistle

Tournament-native World Cup prediction pools. Take a side, watch live scores, get paid at full-time — then roll into the next kickoff.

**Repo:** [github.com/Afnanksalal/whistle-worldcup](https://github.com/Afnanksalal/whistle-worldcup)  
**Deploy:** Playground VPS + Docker + Caddy (+ Cloudflare tunnel). No Vercel.

Powered by [TxLINE](https://txline.txodds.com) sports data on Solana (with free [TheSportsDB](https://www.thesportsdb.com) schedule fallback). Built for the [Superteam World Cup — Prediction Markets & Settlement](https://superteam.fun/earn/listing/prediction-markets-and-settlement/) track.

## Product

- **Markets board** — live schedule with pool sizes
- **Group stage** — standings derived from finished fixtures (`/groups`)
- **News** — keyless RSS (BBC / ESPN / Guardian) at `/news`
- **Parimutuel pools** — 1X2 + O/U 2.5; pool composition sets price
- **Match desk** — scores, stake UI, reference odds when TxLINE SSE is live
- **Squads** — private books, invite codes, leaderboards
- **Positions & claims** — stake book + FT / void refunds
- **Admin** — `/admin` ops console (lock / void / settle) behind `ADMIN_API_KEY`

## Monorepo

```
apps/web          Next.js product UI (VPS only)
apps/api          Ingest, markets, keeper, WS, news, groups, admin API
packages/shared   Shared types + resolution helpers
programs/whistle  Anchor program (USDC escrow + settle/claim)
infra/playground  Docker Compose + Caddy production stack
docs/             TECH, DEPLOY, DEMO, SUBMISSION, TASKS
```

## Quick start

```bash
cp .env.example .env   # includes ADMIN_API_KEY + placeholder TXLINE_API_TOKEN
npm install
npm run build -w @whistle/shared
npm run dev:api        # :4000
npm run dev:web        # :3000
```

Open [http://localhost:3000](http://localhost:3000). Admin: [http://localhost:3000/admin](http://localhost:3000/admin) with `ADMIN_API_KEY` from `.env`.

### Data sources

| Priority | Source | When |
|----------|--------|------|
| 1 | TxLINE REST + SSE | Real `TXLINE_API_TOKEN` (not `txl_…` placeholder) |
| 2 | TheSportsDB (free, no key) | Placeholder token or TxLINE unreachable |
| News | Public RSS | Always — no API key |

There is **no demo mode**. `DEMO_MODE` / `ALLOW_SANDBOX` crash boot if set.

### On-chain program

```bash
anchor build
anchor deploy --provider.cluster devnet
```

Set `WHISTLE_PROGRAM_ID` when the program is live.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:api` | API + ingest + keeper |
| `npm run dev:web` | Next.js UI |
| `npm run check` | Shared build + unit tests + API build |
| `npm run build` | Build shared, api, web |
| `npm run activate-txline -w @whistle/api` | TxLINE activation helper |

## Docs

- [docs/DEPLOY.md](./docs/DEPLOY.md) — VPS production deploy
- [docs/TECH.md](./docs/TECH.md) — architecture
- [docs/TASKS.md](./docs/TASKS.md) — checklist
- [docs/SUBMISSION.md](./docs/SUBMISSION.md) — Superteam package
- [docs/DEMO.md](./docs/DEMO.md) — Loom shot list
- [AGENTS.md](./AGENTS.md) — contributor / agent rules

## Observability

`GET /api/live` · `GET /api/ready` · `GET /api/health` · `GET /api/metrics`
