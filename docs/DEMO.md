# Demo video outline (≤5 min)

Record against the **live playground rail** (`/api/health`). Expect
`fixtureSource: txline`, ~106 World Cup fixtures (~104 in Results), and — when
the on-chain overlay is up — `settlementRail: onchain`, `stakeAsset: USDC`,
`whistleProgramId: C2vCTGZDJYvcd8jdgvFF57FnfdDsUqQy7qogjP2SmDcU`.

## 1. Problem (30s)

World Cup fans want to stake with friends and get paid at full-time. Sportsbooks are opaque; group chats argue; slow resolution kills rhythm. **Whistle** is a fan prediction desk with TxLINE-verified settlement receipts and optional Solana USDC escrow.

## 2. Product walkthrough (2.5 min)

- **Landing** — live board, TxLINE badge, kickoff countdowns
- **Results** — open the Results filter and scroll the ~104 finished WC matches (lookback board)
- **Markets board** (`/markets`) — volume, implied probs, reference odds
- **Tournament** (`/groups`) + **News** (`/news`)
- **Open a knockout** — show **To advance** (no Draw); forecast redistributes regulation-draw mass; stake goals / first scorer / corners separately
- **Live tape** — score pulse + TxLINE event feed during a live match (or show finished match events)
- **Connect wallet** — Whistle Demo (playground) or Phantom → **Get demo USDC** (signed) → stake USDC on-chain
- **Positions** (`/positions`) — active / claimable
- **Settlement receipt** — on a finished match show seq, Merkle summary, PDA, proof detail
- **Squads** — create / join invite

## 3. Verification story (1 min)

- `/api/health` → `fixtureSource: txline`, `resultVerification: txline`
- Receipt panel: validation OK + on-chain `daily_scores_roots` check
- Architecture:

```
TxLINE SSE scores/odds → Whistle board
FT → historical seq → stat-validation-v2 proof
→ daily_scores_roots PDA check → SettlementReceipt
→ settle markets (ledger and/or USDC Anchor settle + optional validate_stat_v2 CPI)
```

## 4. Close (30s)

- Repo + public URL
- "Stake → TxLINE-verified settle → claim — built for World Cup rhythm."

## Checklist before record

- [ ] Stable public URL
- [ ] Seeded liquidity on at least one match
- [ ] One finished match with a receipt (or admin-triggered settle after FT)
- [ ] `/api/health` matches the story you tell
