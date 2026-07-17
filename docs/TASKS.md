# Whistle tasklist

Living checklist for Superteam World Cup track + production ops.

## Shipped

- [x] Monorepo (web, api, shared, Anchor)
- [x] Parimutuel markets + live board + Squads
- [x] Keeper settle + void/refund + live lock
- [x] Live-only boot (no demo/sandbox)
- [x] TheSportsDB free schedule fallback + RSS news (no key)
- [x] Admin console (`/admin`) + admin API key
- [x] Observability (`/live`, `/ready`, `/health`, `/metrics`, pino)
- [x] Group stage tables (`/groups`)
- [x] VPS Docker + Caddy deploy (no Vercel)
- [x] CI + CD to Playground VPS
- [x] Prediction graphs (pool implied-price history)
- [x] Live match stats + TxLINE event tape parsing
- [x] AI insights desk (quantitative engine + optional LLM)
- [x] Settlement receipts (seq, Merkle summary, PDA, proof JSON)
- [x] On-chain daily_scores_roots verification + Anchor CPI hook for validate_stat_v2
- [x] Auto markets: 1X2, O/U goals, first scorer, corners, tournament winner
- [x] Global `/markets` liquidity board
- [x] Live match UX: event tape, score pulse, WS refresh, honest source badges
- [x] TxLINE `startEpochDay` + `competitionId=72` lookback (~106 WC / ~104 finished)
- [x] Historical score tape backfill for finished fixtures
- [x] Devnet Whistle program deploy + config init + playground on-chain USDC overlay

## Remaining (human / ops)

- [ ] Named Cloudflare tunnel (stable hostname) — needs `CLOUDFLARE_TUNNEL_TOKEN`
- [ ] Demo Loom ≤5 min + Superteam submission form
- [ ] Seed demo liquidity (devnet USDC) before recording
- [ ] Optional: fill remaining unscored early WC tapes if TxLINE publishes them

## Ops

- [ ] AWS SG inbound TCP 9444 (if using IP TLS)
- [ ] Renew IP TLS cert if needed
- [ ] Nightly backup of `whistle_api_data` volume
- [ ] Rotate `ADMIN_API_KEY` for long-lived production
