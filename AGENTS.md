# Agent guide — Whistle

This repo is a World Cup prediction product for the TxLINE / Superteam track.
Agents should optimize for a shippable fan product, not crypto-theater UIs.

## Product rules

- **Primary story:** schedule → stake → live → settle at FT → next kickoff
- **Do not** lead UX with Merkle proofs, oracle jargon, or wallet-only dashboards
- TxLINE is the **primary** data source; no hardcoded match results for resolution
- Settlement may use `validate_stat_v2` under the hood; users see Settled / Paid / Refund
- Parimutuel pools only (no AMM/orderbook unless explicitly requested)

## Monorepo map

| Path | Own |
|------|-----|
| `apps/web` | Next.js product UI |
| `apps/api` | TxLINE ingest, markets, keeper, WS |
| `packages/shared` | Types + deterministic resolution helpers |
| `programs/whistle` | Anchor escrow + settle/claim |
| `docs/` | TECH, DEMO, DEPLOY, SUBMISSION |

## Commands

```bash
npm install
npm run check          # shared build + tests + api build
npm run dev:api        # :4000
npm run dev:web        # :3000
cargo check -p whistle # on-chain program
```

Demo mode does **not** exist. Boot requires `TXLINE_API_TOKEN` + `ADMIN_API_KEY`.
Placeholder `txl_…` tokens load the free TheSportsDB schedule so the product stays alive
until a real TxLINE token is configured.

## Agent workflow preferences

1. Prefer small, reviewable PRs over giant dumps
2. Keep resolution logic in `@whistle/shared` — API and Anchor must stay aligned
3. When adding market types, update shared resolvers + tests + keeper mapping
4. Never commit `.env`, wallets, or API tokens
5. After feature work: update `docs/TECH.md` if endpoints/architecture change

## Hackathon constraints

- Deadline context: Superteam World Cup track submission needs working build, public repo, demo video, TxLINE as primary source
- Max team size 3; AI agents OK if submission owned by a real person

## Cursor Cloud specific instructions

The startup update script already runs `npm install` + `npm run build:shared`. Beyond that:

- **The API will not boot without an env file.** Create one once per fresh checkout: `cp .env.example .env`. The committed `.env.example` is boot-ready as-is — its placeholder `txl_…` token makes the API fall back to the free TheSportsDB schedule, and its `ADMIN_API_KEY` is already ≥16 chars. `.env` is gitignored; never commit it.
- **For live TxLINE (primary source), set a real `TXLINE_API_TOKEN`.** Provide it via the `TXLINE_API_TOKEN` secret (not committed). To mint one, run `npm run activate-txline -w @whistle/api` — it generates/uses the wallet at `SOLANA_KEYPAIR_PATH` (`./wallet.json`, gitignored), subscribes on-chain to the devnet World Cup free tier, and prints an API token. Free-tier devnet subscriptions last ~4 weeks; re-run to rotate. With a real token, `/api/health` reports `fixtureSource: txline`; with the placeholder it reports `thesportsdb`. Devnet SOL airdrops from the default RPC are often rate-limited — the script falls back to other faucets automatically.
- **`@whistle/shared` must be built before running the API or web** (both import from `@whistle/shared/dist`). The update script covers this, but if you edit `packages/shared`, rebuild with `npm run build:shared` — the API's `tsx watch` does not rebuild the shared package.
- **Run order for a full local product:** `npm run dev:api` (:4000, includes keeper + WS at `/ws` + ingest) then `npm run dev:web` (:3000). Health at `GET /api/{live,ready,health}`. See README/`docs/DEPLOY.md` for the canonical commands.
- **`.env.example` sets `REQUIRE_WALLET_AUTH=false` for dev**, so stakes can be placed against the API without a real signature (`POST /api/markets/:id/deposit` with `{outcome, amount, owner}`; `owner` must be a valid base58 Solana address, 32 bytes). In the web UI, the "Confirm" stake button still requires a connected browser Solana wallet (Phantom/Solflare/etc.), which is not installed in the cloud VM — to exercise staking headlessly, hit the API directly and the UI pool will reflect it on reload.
- **`cargo check -p whistle` (optional on-chain program) needs Rust ≥1.85** (a transitive dep requires edition2024). The VM default toolchain may be older; install/use stable via `rustup toolchain install stable` and `rustup run stable cargo check -p whistle`. Not required for the fan product.
