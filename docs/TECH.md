# Whistle — Technical Overview

## Idea

Whistle is a fan-facing World Cup prediction product: public and squad parimutuel pools that move through schedule → stake → live → settled/paid or refund → next kickoff. The default deployment is an authenticated play-unit ledger. An optional USDC rail fails closed unless its deployed Anchor program and TxLINE-backed keeper are fully configured and startup-verified.

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
| `SETTLEMENT_RAIL` / `STAKE_ASSET` | Default `ledger` / `units`. USDC requires `onchain` / `USDC` plus `ENABLE_ONCHAIN_SETTLEMENT=true` |
| `WHISTLE_PROGRAM_ID` / `USDC_MINT` | Required in on-chain mode and checked against deployed accounts at boot |
| `WHISTLE_AUTHORITY_KEY` / `SOLANA_KEYPAIR_PATH` | Exactly one usable keeper authority source is required in on-chain mode |
| `PLATFORM_FEE_BPS` | On-chain fee, default 250 and hard-capped at 1000; must match the config PDA |
| `TXLINE_COMPETITION_IDS` | Comma-separated competition ids for snapshot fetch; default `72` (World Cup). Use `*` for all free-tier competitions |
| `TXLINE_FIXTURE_LOOKBACK_DAYS` | Days subtracted from today's UTC epoch day for `startEpochDay` (default `50`) so finished WC matches stay on the board |

### Devnet program (deployed)

| Item | Value |
|------|-------|
| Program ID | `3YtgbTqz6nUyXa3LtjbxeZhbTuLJLUJPzMMNziM535DX` |
| USDC mint (devnet) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| Config PDA | Derived from `[b"whistle_config"]` (see `scripts/init-program.js` output) |
| Authority key | Host file under `secrets/` (gitignored); mounted via `docker-compose.onchain.yml` |

## TxLINE endpoints (when live)

| Endpoint | Use |
|----------|-----|
| `POST /auth/guest/start` | Guest JWT |
| `POST /api/token/activate` | API token after on-chain subscribe |
| `GET /api/fixtures/snapshot?startEpochDay=&competitionId=` | Full WC schedule (lookback + competition filter) |
| `GET /api/scores` / collection snapshot | Live score bootstrap (often empty on free tier) |
| `GET /api/scores/snapshot/{fixtureId}` | Per-fixture score tape; prefer `game_finalised` row |
| `GET /api/scores/historical/{fixtureId}` | Official historical path (window-limited) |
| `GET /api/scores/stat-validation` (+ v2 query shapes) | Merkle proof payload for settle + receipt |
| `GET /api/scores/stream` (SSE) | Live scores + soccer event actions |
| `GET /api/odds/stream` (SSE) | Reference odds |
| `GET /api/fixtures/:id/receipt` | Persisted settlement receipt (seq, Merkle summary, PDA) |
| `GET /api/markets/board` | Global volume / implied-probability board |

Market types auto-created per stakeable fixture: `match_result`, `total_goals` (2.5), `first_scorer`, `total_corners` (9.5), plus a global `tournament_winner` market.

Settlement: keeper requires TxLINE historical final + validation payload, checks `daily_scores_roots` PDA presence on Solana, stores a `SettlementReceipt`, then settles ledger and/or USDC markets. Anchor `settle` accepts optional CPI instruction bytes into TxLINE `validate_stat_v2`.

Networks: **devnet** `https://txline-dev.txodds.com` or **mainnet** free tiers.

### Getting a real token

`npm run activate-txline -w @whistle/api` runs the full World Cup free-tier flow
end to end: it loads/generates the wallet at `SOLANA_KEYPAIR_PATH`, funds it
(devnet airdrop, best effort), sends the on-chain `subscribe(serviceLevelId, weeks)`
transaction (creating the wallet's Token-2022 TxL ATA if needed), then signs
`${txSig}:${leagues}:${jwt}` and calls `POST /api/token/activate`. It prints the
resulting token — put it in `TXLINE_API_TOKEN` (never commit it). When the token
is already set it only smoke-tests `/api/fixtures/snapshot`. Tune with
`TXLINE_SERVICE_LEVEL_ID` (default 1), `TXLINE_DURATION_WEEKS` (default 4), and
`TXLINE_LEAGUES`.

### Fixture normalization

TxLINE fixtures arrive as `Participant1`/`Participant2` with a `Participant1IsHome`
flag; `normalizeFixture` maps these to `home`/`away` (honoring the flag) so live
schedule cards show real team names, falling back to nested `home`/`team1` shapes.

### Full WC board (the “104” matches)

A bare `GET /api/fixtures/snapshot` defaults to the **current UTC day** and only
returns the free-tier live window (often ~8 WC + friendlies). The OpenAPI
`startEpochDay` parameter selects fixtures that start at or within ~30 days after
that epoch day. Whistle pages:

1. `snapshot?startEpochDay={today-lookback}&competitionId=72`
2. `snapshot?competitionId=72` (current window / remaining knockouts)

Kickoffs older than ~2.5h with no live status are marked `finished`. Finished
fixtures without scores are backfilled asynchronously from
`/api/scores/snapshot/{fixtureId}` (preferring `game_finalised`). The Results
tab shows up to 120 finished matches.

## Public product API (Whistle)

| Endpoint | Notes |
|----------|-------|
| `GET /api/health` `/ready` `/live` `/metrics` | Health + Prometheus |
| `GET /api/fixtures/:id/forecast` | Deterministic 1X2 probabilities, evidence/confidence/freshness, optional Groq note, and separate pool-implied crowd snapshot |
| `GET /api/fixtures` `/groups` `/news` `/meta` | Product data; fixture responses include `serverNow` for clock-safe client cutoffs |
| `GET /api/fixtures/:id` | Match, markets, live context, and `serverNow` for the stake UI |
| `GET /api/admin/overview` | Admin key required |
| `POST /api/markets/:id/settle\|void\|lock` | Admin key required |
| `POST /api/markets/:id/deposit` | Wallet identity |
| `POST /api/markets/:id/prepare` | Lazily creates the deterministic market/vault PDAs before an on-chain stake |

Provider kickoffs accept only plausible epoch seconds/milliseconds or zoned ISO
timestamps with real calendar fields. Missing, offset-less, impossible, and
ambiguous values are rejected rather than replaced with a synthetic kickoff.
The web renders UTC deterministically for SSR, then switches to the visitor's
validated IANA time zone; stake availability remains synchronized to API time.

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
- **On-chain cutoff:** the market account stores kickoff and rejects direct deposits at or after kickoff
- **Replay safety:** a transaction signature is idempotent and cannot credit the JSON ledger twice
- Shared helpers in `@whistle/shared`

## Market lifecycle

```
open → (kickoff/live) locked → (FT) settled → claim
open|locked → (cancel/postpone) void → refund claim
```

## Current production boundary

Boot reconciliation removes only empty duplicate/orphan pools and preserves every pool with a position or liquidity. In on-chain mode, funded pools stay locked until settle/void succeeds on-chain; the API never advertises a paid/refunded state first. Financial mutations use durable atomic writes; background snapshots coalesce and unchanged chart samples are skipped. The JSON ledger remains intentionally single-process and is not suitable for horizontal replicas. PostgreSQL transactions are the next scaling step.

## Feedback (TxLINE)

**Liked:** Free World Cup tier, SSE, `validate_stat_v2` as a settlement primitive.

**Friction:** Guest JWT + subscribe + activate is heavy for a short hack; path name variants need fallbacks; easy to mismatch devnet/mainnet hosts.
