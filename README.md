# Whistle

Tournament-native World Cup prediction pools. Take a side, watch live scores, get paid at full-time — then roll into the next kickoff.

**Repo:** [github.com/Afnanksalal/whistle-worldcup](https://github.com/Afnanksalal/whistle-worldcup)
**Live:** [Whistle on Playground](https://membership-public-gave-racks.trycloudflare.com)
**Deploy:** Playground VPS + Docker + Caddy (+ Cloudflare tunnel). No Vercel.

Powered by [TxLINE](https://txline.txodds.com) sports data on Solana (with free [TheSportsDB](https://www.thesportsdb.com) schedule fallback). Built for the [Superteam World Cup — Prediction Markets & Settlement](https://superteam.fun/earn/listing/prediction-markets-and-settlement/) track.

## Product

- **Markets board** — live schedule with pool sizes
- **Group stage** — standings derived from finished fixtures (`/groups`)
- **News** — keyless, World Cup-scoped BBC and Guardian RSS at `/news`
- **Parimutuel pools** — group 1X2 / knockout to-advance + O/U; pool composition sets price
- **Match desk** — scores, stake UI, step pool tape, reference odds when TxLINE SSE is live
- **Squads** — private books, invite codes, leaderboards
- **Positions & claims** — stake book + FT / void refunds
- **Admin** — `/admin` ops console (lock / void / settle) behind `ADMIN_API_KEY`

## Monorepo

```
apps/web          Next.js product UI (VPS only)
apps/api          Ingest, markets, keeper, WS, news, groups, admin API
packages/shared   Shared types + resolution helpers
programs/whistle  Guarded Anchor escrow + settle/claim/refund rail
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
| News | World Cup-scoped BBC + Guardian RSS | Always — no API key |

There is **no demo mode**. `DEMO_MODE` / `ALLOW_SANDBOX` crash boot if set.

### On-chain program

Play-unit ledger mode is the default. USDC mode is an explicit deployment option
and requires a real TxLINE token, a deployed and initialized program, and an
authority keypair. The API verifies that the deployed program, config PDA,
authority, mint, and fee all agree before it starts.

```bash
anchor build
anchor deploy --provider.cluster devnet
npm run init:program -- --fee-bps 250
```

Set `ENABLE_ONCHAIN_SETTLEMENT=true`, `SETTLEMENT_RAIL=onchain`,
`STAKE_ASSET=USDC`, `WHISTLE_PROGRAM_ID`, `USDC_MINT`, and the mounted authority
keypair only after deployment. Browser clients receive the public program and
mint addresses from `/api/meta`.

Devnet program currently deployed for the playground:

`WHISTLE_PROGRAM_ID=C2vCTGZDJYvcd8jdgvFF57FnfdDsUqQy7qogjP2SmDcU`

For the full World Cup board (including ~104 finished matches), set
`TXLINE_COMPETITION_IDS=72` and `TXLINE_FIXTURE_LOOKBACK_DAYS=50` (defaults in
Compose). Bare TxLINE snapshots only return the current live window.

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

## Discovery

`/sitemap.xml` · `/robots.txt` · `/llms.txt` · `/llms-full.txt` · `/manifest.webmanifest`
