# Whistle — Technical Overview

## Idea

Whistle is a fan-facing World Cup prediction product: public and squad parimutuel pools that move through schedule → stake → live → settled/paid or refund → next kickoff. The current deployment is an authenticated play-unit ledger. Real-value/on-chain mode fails closed until the Anchor client and TxLINE CPI path are complete.

## Highlights

- **Match forecast** -- deterministic team-form/Poisson probabilities with confidence, freshness, evidence gaps, and a separate crowd-price snapshot
- **Parimutuel, not AMM** — stakes form outcome pools; implied odds = pool shares
- **Live data board** — TxLINE primary; TheSportsDB free public schedule as fallback
- **Keeper settlement** — only a canonical TxLINE final record with a sequence and non-empty validation payload may settle a market
- **Squads** — invite-code private tables + PnL leaderboard
- **Admin API** — settle / void / lock behind `ADMIN_API_KEY`
- **News** — parallel, timed World Cup-scoped BBC and Guardian RSS with relevance filtering, image extraction, and stale-cache recovery
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
| `GROQ_API_KEY` | Optional, server-only forecast/insight narrative enrichment; deterministic output remains available without it |
| `GROQ_MODEL` | Optional; defaults to `openai/gpt-oss-20b` with low reasoning effort and strict forecast-note JSON |
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
| `GET /api/fixtures/:id/forecast` | Deterministic 1X2 probabilities, evidence/confidence/freshness, optional Groq note, and separate pool-implied crowd snapshot |
| `GET /api/fixtures` `/groups` `/news` `/meta` | Product data |
| `GET /api/admin/overview` | Admin key required |
| `POST /api/markets/:id/settle\|void\|lock` | Admin key required |
| `POST /api/markets/:id/deposit` | Wallet identity |

## Forecast boundary

`GET /api/fixtures/:id/forecast` uses only normalized fixture/result history,
team identity, and an observed live score/minute when those fields genuinely
exist. A smoothed Poisson model produces home/draw/away probabilities that are
normalized to exactly one. Sparse samples stay low-confidence and expose their
neutral-prior, head-to-head, player-availability, and feed-freshness gaps.

The response deliberately has separate `model` and `crowd` objects. Funded
parimutuel pool shares are never an input to the deterministic forecast. Groq,
when `GROQ_API_KEY` is configured, may replace only the short explanatory note
using a strict JSON response; it cannot alter probabilities, evidence, or
confidence. Provider failures and timeouts retain the deterministic note.

Forecasts have no settlement authority. TxLINE data still needs a canonical
final record plus validation payload before settlement, while TheSportsDB
fallback history may inform a forecast but is always marked `not_eligible` for
settlement. In-memory forecasts are fingerprinted, single-flight cached for five
minutes (30 seconds live), and capped at 256 entries. Optional tuning:
`FORECAST_CACHE_TTL_MS`, `FORECAST_LIVE_CACHE_TTL_MS`, and
`FORECAST_AI_TIMEOUT_MS`.

When the active fixture source is the public fallback, a match forecast also
requests each team's recent result feed and a focused head-to-head search on
demand. Those results may span other competitions and inform team form and
past-meeting evidence, while the scoring baseline remains limited to the target
competition. The adapter is single-flight,
cached for six hours, bounded, timeout-protected, and held to at most six calls
per minute. Tune downward with `FORECAST_HISTORY_REQUESTS_PER_MIN` or adjust
`FORECAST_HISTORY_TIMEOUT_MS`. The free feed does not publish a trustworthy
injury/availability contract, so that limitation remains visible instead of
being guessed.

TheSportsDB match-stat calls use a process-wide request budget (18/minute by
default, hard-capped below the provider's 30/minute free limit), timeouts, and
status-aware caches. Tune with `TSDB_STATS_REQUESTS_PER_MIN` and
`TSDB_STATS_TIMEOUT_MS` without exceeding the provider plan.

## Search, social, and agent discovery

| Surface | Purpose |
|---------|---------|
| `/sitemap.xml` | Public product and match URL inventory; excludes wallet/private/admin routes |
| `/robots.txt` | Allows search/retrieval crawlers, blocks training crawlers, and excludes operational paths |
| `/llms.txt` `/llms-full.txt` | Plain-text product, provenance, settlement, news, AI, and policy context |
| `/brand/whistle-social-card.png` | Branded 1200×630 Open Graph and Twitter share card |
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
