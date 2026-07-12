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
