# Submission package

## Links

| Item | URL |
|------|-----|
| Public repo | https://github.com/Afnanksalal/whistle-worldcup |
| Playground (live) | https://membership-public-gave-racks.trycloudflare.com |
| API health | https://membership-public-gave-racks.trycloudflare.com/api/health |
| Local web | http://localhost:3000 |
| Local API | http://localhost:4000 |
| Track | https://superteam.fun/earn/listing/prediction-markets-and-settlement/ |
| Tasklist | [TASKS.md](./TASKS.md) |

## TxLINE endpoints used

See [TECH.md](./TECH.md).

## Demo video

Follow the shot list in [DEMO.md](./DEMO.md). Record Loom/YouTube ≤5 min showing:

1. Problem (slow / opaque settlement during World Cup)
2. Product walkthrough (fixtures → stake → live → settle → claim + Squads)
3. How TxLINE powers fixtures/SSE/settlement

## Deploy notes

- Web + API run locally in demo mode out of the box (`DEMO_MODE` when no `TXLINE_API_TOKEN`)
- Production deploy: [DEPLOY.md](./DEPLOY.md)
- Anchor program: `cargo check -p whistle` passes; deploy with Anchor CLI + Solana when ready (`programs/whistle`)

## Feedback (paste into Superteam form)

**Liked:** Free World Cup tier, SSE streams, and `validate_stat_v2` as a settlement primitive.

**Friction:** Guest JWT + on-chain subscribe + activate ceremony is heavy for a hackathon weekend; endpoint path variants need fallbacks; easy to mismatch devnet/mainnet hosts.
