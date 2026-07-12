# Whistle

Tournament-native World Cup prediction pools. Take a side, watch live scores, get paid at full-time — then roll into the next kickoff.

**Repo:** [github.com/Afnanksalal/whistle-worldcup](https://github.com/Afnanksalal/whistle-worldcup)

Powered by [TxLINE](https://txline.txodds.com) sports data on Solana. Built for the [Superteam World Cup — Prediction Markets & Settlement](https://superteam.fun/earn/listing/prediction-markets-and-settlement/) track.

## Product

- **Fixtures board** — World Cup / friendlies schedule with live status
- **Parimutuel pools** — Match result (1X2) and totals (O/U 2.5); pool composition sets price
- **Live match page** — Scores + reference odds from TxLINE feeds
- **Instant settlement** — Keeper settles open markets when a match reaches full-time
- **Squads** — Private rooms with invite codes and leaderboards
- **Positions & claims** — Track stakes and claim winnings after settle

## Monorepo

```
apps/web          Next.js product UI
apps/api          TxLINE ingest, markets API, keeper, WebSocket fanout
packages/shared   Shared types + resolution helpers
programs/whistle  Anchor program (USDC escrow + settle/claim)
docs/TECH.md      Architecture + TxLINE endpoints
```

## Quick start

```bash
# from repo root
cp .env.example .env
npm install
npm run build -w @whistle/shared

# terminal 1 — API (demo mode if no TXLINE_API_TOKEN)
npm run dev:api

# terminal 2 — web
npm run dev:web
```

Open [http://localhost:3000](http://localhost:3000).

### TxLINE credentials (optional for live data)

1. Follow [World Cup Free Tier](https://txline.txodds.com/documentation/worldcup) on **devnet**
2. Set `TXLINE_GUEST_JWT` and `TXLINE_API_TOKEN` in `.env`
3. Restart the API — fixtures/SSE switch from demo to live

Without credentials the API seeds demo fixtures and advances `demo-wc-001` toward full-time so you can demo stake → settle → claim.

### On-chain program

```bash
# requires Solana + Anchor CLI
anchor build
anchor deploy --provider.cluster devnet
```

Set `WHISTLE_PROGRAM_ID` and `SOLANA_KEYPAIR_PATH` for the keeper’s optional on-chain settle path.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:api` | API + ingest + keeper |
| `npm run dev:web` | Next.js UI |
| `npm run build` | Build shared, api, web |
| `npm run activate-txline -w @whistle/api` | TxLINE activation helper |

## License

MIT
