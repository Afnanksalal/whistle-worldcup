# Whistle — Technical Overview

## Idea

Whistle is a fan-facing World Cup prediction product: public and squad parimutuel pools that move through schedule → stake → live → settled/paid or refund → next kickoff. The current deployment is an authenticated play-unit ledger. Real-value/on-chain mode fails closed until the Anchor client and TxLINE CPI path are complete.

## Highlights

- **Parimutuel, not AMM** — stakes form outcome pools; implied odds = pool shares
- **Live data board** — TxLINE primary; TheSportsDB free public schedule as fallback
- **Keeper settlement** — only a canonical TxLINE final record with a sequence and non-empty validation payload may settle a market
- **Squads** — invite-code private tables + PnL leaderboard
- **Admin API** — settle / void / lock behind `ADMIN_API_KEY`
- **News** — parallel, timed RSS aggregation with image extraction and stale-cache recovery
- **Match intelligence** — evidence-gated deterministic signals plus an optional cached LLM summary
- **Groups** — standings from finished fixtures with `group` metadata
- **Anchor program** — escrow + settle/claim/void (optional until deployed)

## Architecture

```
Browser → Next.js (VPS) → Caddy → Whistle API
                                  ├─ TxLINE REST/SSE  (when real token)
                                  ├─ TheSportsDB      (fallback schedule)
                                  ├─ RSS news
                                  ├─ Atomic single-process JSON state + WS fanout
                                  └─ TxLINE-verified keeper → play-unit settlement
```

## Boot requirements

| Env | Rule |
|-----|------|
| `TXLINE_API_TOKEN` | Required. Real token → TxLINE. `txl_…` placeholder → TheSportsDB board |
| `ADMIN_API_KEY` | Required, ≥16 chars |
| `NEXT_PUBLIC_SITE_URL` | Required by the production image; public HTTPS origin for canonical and discovery URLs |
| `INTERNAL_API_URL` | Web-to-API container URL used for server-rendered match metadata and sitemap fixtures |
| `DEMO_MODE` / `ALLOW_SANDBOX` | **Forbidden** — process exits |
| Node.js | `>=22.12`; production images use Node 22 |
| `SETTLEMENT_RAIL` / `STAKE_ASSET` | Must remain `ledger` / `units`; unsupported real-value settings fail boot |

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

## Search, social, and agent discovery

| Surface | Purpose |
|---------|---------|
| `/sitemap.xml` | Public product and match URL inventory; excludes wallet/private/admin routes |
| `/robots.txt` | Allows search/retrieval crawlers, blocks training crawlers, and excludes operational paths |
| `/llms.txt` `/llms-full.txt` | Plain-text product, provenance, settlement, news, AI, and policy context |
| `/opengraph-image` `/twitter-image` | Branded 1200×630 share cards |
| `/manifest.webmanifest` | Install metadata with 192px, 512px, and maskable app icons |
| JSON-LD | `WebSite`, `SoftwareApplication`, and per-match `SportsEvent` structured data |

Page metadata is route-specific. Public editorial/product pages are indexable;
wallet positions, the admin console, and private squad details emit `noindex`.
Canonical URLs come only from `NEXT_PUBLIC_SITE_URL`, so production does not
silently publish localhost or query-string canonicals.

## Resolution logic

- **Match result:** home / draw / away from final scores
- **Totals:** `home + away > line` → over, else under (default 2.5)
- **Cutoff lock:** a one-second scheduler locks every open market at kickoff even when provider status is late
- **Void / refund:** cancelled/postponed → void open|locked; claim refunds stake
- **Fallback result:** a non-TxLINE final can never settle; affected open/locked pools void and refund
- **Uniqueness:** deterministic market identity covers fixture, type, line, and squad across every lifecycle status
- Shared helpers in `@whistle/shared`

## Market lifecycle

```
open → (kickoff/live) locked → (FT) settled → claim
open|locked → (cancel/postpone) void → refund claim
```

## Current production boundary

Boot reconciliation removes only empty duplicate/orphan pools and preserves every pool with a position or liquidity. Financial mutations use durable atomic writes; background snapshots coalesce and unchanged chart samples are skipped. This is safer for the competition deployment, but it is intentionally single-process and is not suitable for horizontal replicas or real money. The next scaling step is PostgreSQL transactions plus a complete generated Anchor client, not additional JSON-ledger complexity.

## Feedback (TxLINE)

**Liked:** Free World Cup tier, SSE, `validate_stat_v2` as a settlement primitive.

**Friction:** Guest JWT + subscribe + activate is heavy for a short hack; path name variants need fallbacks; easy to mismatch devnet/mainnet hosts.
