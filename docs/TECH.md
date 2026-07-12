# Whistle — Technical Overview

## Idea

Whistle is a fan-facing World Cup prediction product: public and squad parimutuel pools that settle automatically when TxLINE reports full-time. The UX is schedule → stake → live → paid. Settlement uses deterministic score→outcome mapping; when configured, the keeper submits an on-chain settle that can CPI into TxLINE `validate_stat_v2`.

## Business / technical highlights

- **Parimutuel, not AMM** — stakes form outcome pools; implied odds = pool shares
- **TxLINE-primary data** — fixtures, live scores, odds; no hardcoded match results
- **Keeper settlement** — detects `game_finalised` / `statusId=100` and settles open markets
- **Squads** — invite-code private tables + PnL leaderboard
- **Anchor program** — `initialize`, `create_market`, `deposit`, `settle`, `claim`, `void_market` with USDC vault PDAs

## Architecture

```
Browser → Next.js → Whistle API → TxLINE REST/SSE
                         ↓
                    JSON state + WS fanout
                         ↓
                    Settlement keeper → (optional) Whistle program → TxLINE txoracle CPI
```

## TxLINE endpoints used

| Endpoint | Use |
|----------|-----|
| `POST /auth/guest/start` | Guest JWT |
| `POST /api/token/activate` | API token after on-chain subscribe (setup script) |
| `GET /api/fixtures` (+ snapshot fallbacks) | Tournament schedule |
| `GET /api/scores` / snapshot | Score bootstrap |
| `GET /api/scores/historical?fixtureId=` | Final score records for settle |
| `GET /api/scores/stat-validation-v2` | Merkle/stat validation payload for on-chain settle |
| `GET /api/scores/stream` (SSE) | Live score updates |
| `GET /api/odds/stream` (SSE) | Reference odds for match UI |

Networks: **devnet** `https://txline-dev.txodds.com` (program `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`) or **mainnet** free tiers 1 / 12.

## Resolution logic

- **Match result:** home win / draw / away from final scores
- **Totals:** `home + away > line` → over, else under (default line 2.5)
- **Live lock:** when a fixture goes `live`, open markets flip to `locked` (no new stakes)
- **Void / refund:** cancelled or postponed fixtures void open markets; claim returns full stake
- Shared helpers in `@whistle/shared` keep API and Anchor mappings aligned

## Market lifecycle

```
open → (kickoff/live) locked → (FT) settled → claim
open|locked → (cancel/postpone) void → refund claim
```

## Demo mode

If `TXLINE_API_TOKEN` is unset, the API seeds demo World Cup fixtures and simulates live progress on `demo-wc-001` so stake → settle → claim works for demos and judges when matches are quiet.

## Feedback (TxLINE)

**Liked:** Free World Cup tier, normalized JSON, SSE streams, and on-chain `validate_stat_v2` as a real settlement primitive — rare for sports data.

**Friction:** Guest JWT + on-chain subscribe + activate ceremony is heavy for a 7-day hack; OpenAPI path names vary (`stat-validation` vs `v2`); need robust fallbacks. Devnet/mainnet host mismatch is easy to get wrong.
