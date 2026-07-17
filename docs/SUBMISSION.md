# Submission package

## Links

| Item | URL |
|------|-----|
| Public repo | https://github.com/Afnanksalal/whistle-worldcup |
| Playground (live) | Cloudflare tunnel — see `docker logs playground-tunnel-1` on VPS (set named tunnel for stable host) |
| API health | `{tunnel}/api/health` |
| Markets board | `{tunnel}/markets` |
| Admin | `{tunnel}/admin` |
| Track | https://superteam.fun/earn/listing/prediction-markets-and-settlement/ |
| Tasklist | [TASKS.md](./TASKS.md) |

## TxLINE endpoints used

- `POST /auth/guest/start`
- `POST /api/token/activate` (activation script)
- `GET /api/fixtures/snapshot?startEpochDay=&competitionId=` (WC board + lookback)
- `GET /api/scores/snapshot/{fixtureId}` (historical score tape / finals)
- `GET /api/scores/stream` + `GET /api/odds/stream` (SSE)
- `GET /api/scores/stat-validation` / v2 shapes (Merkle proof payload)

See [TECH.md](./TECH.md).

## Core idea

Whistle is a World Cup fan prediction product: auto 1X2, O/U goals, first-scorer, corners, and tournament-winner pools; squads; live event tape; Poisson forecast kept separate from the crowd. Settlement waits on TxLINE finals + validation proofs; receipts expose seq / Merkle summary / daily roots PDA; unverified results refund. Solana USDC escrow + `validate_stat_v2` CPI hook are deployed on **devnet** (`WHISTLE_PROGRAM_ID=3YtgbTqz6nUyXa3LtjbxeZhbTuLJLUJPzMMNziM535DX`); playground can run the on-chain USDC rail via `docker-compose.onchain.yml`.

## Demo video

Follow [DEMO.md](./DEMO.md). Loom/YouTube ≤5 min required for screening.

## Feedback (paste into Superteam form)

**Liked:** Free World Cup tier, SSE streams, and `validate_stat_v2` / Merkle roots as a settlement primitive.

**Friction:** Guest JWT + on-chain subscribe + activate ceremony is heavy for a hackathon weekend; endpoint path variants need fallbacks; bare `/fixtures/snapshot` only returns the current window (~8) unless you page with `startEpochDay` + `competitionId=72` (Whistle now does — ~106 WC fixtures / ~104 finished); soccer event schemas vary by record shape; some early fixtures lack score tapes so score backfill is partial.
