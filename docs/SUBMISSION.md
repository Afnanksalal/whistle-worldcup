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
- `GET /api/fixtures` (+ snapshot fallbacks)
- `GET /api/scores` / historical / stream
- `GET /api/odds/stream`
- `GET /api/scores/stat-validation-v2` (Merkle proof payload)

See [TECH.md](./TECH.md).

## Core idea

Whistle is a World Cup fan prediction product: auto 1X2, O/U goals, first-scorer, corners, and tournament-winner pools; squads; live event tape; Poisson forecast kept separate from the crowd. Settlement waits on TxLINE finals + validation proofs; receipts expose seq / Merkle summary / daily roots PDA; unverified results refund. Solana USDC escrow + validate_stat_v2 CPI hook are implemented; live demo may run the verified ledger rail.

## Demo video

Follow [DEMO.md](./DEMO.md). Loom/YouTube ≤5 min required for screening.

## Feedback (paste into Superteam form)

**Liked:** Free World Cup tier, SSE streams, and `validate_stat_v2` / Merkle roots as a settlement primitive.

**Friction:** Guest JWT + on-chain subscribe + activate ceremony is heavy for a hackathon weekend; endpoint path variants need fallbacks; free-tier fixture count is far below a full 104-match board; soccer event schemas vary by record shape.
