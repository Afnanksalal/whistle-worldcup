# Whistle tasklist

Living checklist for Superteam World Cup track + product hardening.

## Now / shipping

- [x] Monorepo scaffold (web, api, shared, Anchor)
- [x] Parimutuel markets + live board + Squads
- [x] Keeper settle + void/refund + live lock
- [x] Unit tests + CI (`npm run check`, cargo check)
- [x] Agent tooling (`AGENTS.md`, Cursor hooks/rules)
- [x] Playground VPS compose + TLS edge (`infra/playground`)
- [x] Playground stack live via Cloudflare quick tunnel
- [x] GitHub secrets for CD (`PLAYGROUND_SSH_KEY`, host, user)
- [ ] Optional: Vercel web (CLI login still needed) — not required; tunnel serves web+api
- [ ] TxLINE live credentials (leave demo mode when ready)
- [ ] Anchor `anchor deploy` on Solana devnet
- [ ] Demo Loom ≤5 min + Superteam submission
- [ ] Named Cloudflare tunnel (stable hostname) instead of trycloudflare.com

## Next product

- [ ] Historical fixture settle path with real `stat_validation_v2` CPI
- [ ] USDC faucet / claim UX for demo wallets
- [ ] Bracket / group-stage views from TxLINE fixtures metadata
- [ ] Observability (structured logs + basic uptime check)

## Ops

- [ ] AWS SG inbound TCP 9444 (if not already open)
- [ ] Renew IP TLS cert if browsers flag expiry
- [ ] Nightly backup of `/opt/whistle` compose data volume
