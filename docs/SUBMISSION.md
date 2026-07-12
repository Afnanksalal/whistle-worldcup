# Submission package

## Links

| Item | URL |
|------|-----|
| Public repo | https://github.com/Afnanksalal/whistle-worldcup |
| Playground (live) | Cloudflare tunnel — see `docker logs playground-tunnel-1` on VPS |
| API health | `{tunnel}/api/health` |
| Admin | `{tunnel}/admin` |
| Local web | http://localhost:3000 |
| Local API | http://localhost:4000 |
| Track | https://superteam.fun/earn/listing/prediction-markets-and-settlement/ |
| Tasklist | [TASKS.md](./TASKS.md) |

## TxLINE + data

See [TECH.md](./TECH.md). Primary: TxLINE. Fallback schedule: TheSportsDB. News: public RSS (no key).

## Demo video

Follow [DEMO.md](./DEMO.md). Record Loom/YouTube ≤5 min:

1. Problem (slow / opaque settlement during World Cup)
2. Product walkthrough (markets → groups → news → stake → settle → claim + Squads)
3. How data + keeper settlement work

## Deploy notes

- **VPS only** (Docker + Caddy + tunnel). No Vercel.
- Requires `TXLINE_API_TOKEN` + `ADMIN_API_KEY` on the host `.env`
- Runbook: [DEPLOY.md](./DEPLOY.md)
- Anchor: `cargo check -p whistle`; deploy when ready

## Feedback (paste into Superteam form)

**Liked:** Free World Cup tier, SSE streams, and `validate_stat_v2` as a settlement primitive.

**Friction:** Guest JWT + on-chain subscribe + activate ceremony is heavy for a hackathon weekend; endpoint path variants need fallbacks; easy to mismatch devnet/mainnet hosts.
