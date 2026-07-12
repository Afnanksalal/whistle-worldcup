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

## Remaining

- [ ] Replace placeholder `txl_…` with real `TXLINE_API_TOKEN` when activated
- [ ] Named Cloudflare tunnel (stable hostname)
- [ ] Anchor `anchor deploy` + `WHISTLE_PROGRAM_ID`
- [ ] Demo Loom ≤5 min + Superteam submission

## Ops

- [ ] AWS SG inbound TCP 9444 (if using IP TLS)
- [ ] Renew IP TLS cert if needed
- [ ] Nightly backup of `whistle_api_data` volume
- [ ] Rotate `ADMIN_API_KEY` for long-lived production
