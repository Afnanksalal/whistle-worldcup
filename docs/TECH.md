# Whistle — Technical Overview

## Idea

Whistle is a fan-facing World Cup prediction product: public and squad parimutuel pools that settle when a match reaches full-time. UX is schedule → stake → live → paid. Settlement uses deterministic score→outcome mapping; when configured, the keeper can submit an on-chain settle that CPIs into TxLINE `validate_stat_v2`.

## Highlights

- **Parimutuel, not AMM** — stakes form outcome pools; implied odds = pool shares
- **Live data board** — TxLINE primary; TheSportsDB free public schedule as fallback
- **Keeper settlement** — FT / `game_finalised` / `statusId=100` settles open|locked markets
- **Squads** — invite-code private tables + PnL leaderboard
- **Admin API** — settle / void / lock behind `ADMIN_API_KEY`
- **News** — keyless RSS aggregation
- **Groups** — standings from finished fixtures with `group` metadata
- **Anchor program** — escrow + settle/claim/void (optional until deployed)

## Architecture

```
Browser → Next.js (VPS) → Caddy → Whistle API
                                  ├─ TxLINE REST/SSE  (when real token)
                                  ├─ TheSportsDB      (fallback schedule)
                                  ├─ RSS news
                                  ├─ JSON state + WS fanout
                                  └─ Keeper → optional Whistle program CPI
```

## Boot requirements

| Env | Rule |
|-----|------|
| `TXLINE_API_TOKEN` | Required. Real token → TxLINE. `txl_…` placeholder → TheSportsDB board |
| `ADMIN_API_KEY` | Required, ≥16 chars |
| `DEMO_MODE` / `ALLOW_SANDBOX` | **Forbidden** — process exits |

## TxLINE endpoints (when live)

| Endpoint | Use |
|----------|-----|
| `POST /auth/guest/start` | Guest JWT |
| `POST /api/token/activate` | API token after on-chain subscribe |
| `GET /api/fixtures` (+ snapshot fallbacks) | Schedule |
| `GET /api/scores` / snapshot | Score bootstrap |
| `GET /api/scores/historical?fixtureId=` | Final records for settle |
| `GET /api/scores/stat-validation-v2` | On-chain settle payload |
| `GET /api/scores/stream` (SSE) | Live scores |
| `GET /api/odds/stream` (SSE) | Reference odds |

Networks: **devnet** `https://txline-dev.txodds.com` or **mainnet** free tiers.

## Public product API (Whistle)

| Endpoint | Notes |
|----------|-------|
| `GET /api/health` `/ready` `/live` `/metrics` | Health + Prometheus |
| `GET /api/fixtures` `/groups` `/news` `/meta` | Product data |
| `GET /api/admin/overview` | Admin key required |
| `POST /api/markets/:id/settle\|void\|lock` | Admin key required |
| `POST /api/markets/:id/deposit` | Wallet identity |

## Resolution logic

- **Match result:** home / draw / away from final scores
- **Totals:** `home + away > line` → over, else under (default 2.5)
- **Live lock:** fixture `live` → markets `locked`
- **Void / refund:** cancelled/postponed → void open|locked; claim refunds stake
- Shared helpers in `@whistle/shared`

## Market lifecycle

```
open → (kickoff/live) locked → (FT) settled → claim
open|locked → (cancel/postpone) void → refund claim
```

## Feedback (TxLINE)

**Liked:** Free World Cup tier, SSE, `validate_stat_v2` as a settlement primitive.

**Friction:** Guest JWT + subscribe + activate is heavy for a short hack; path name variants need fallbacks; easy to mismatch devnet/mainnet hosts.
