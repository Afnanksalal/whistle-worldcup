# Whistle Anchor program

USDC parimutuel escrow for Whistle markets on Solana (devnet/mainnet).

## Instructions

| Instruction | Role |
|-------------|------|
| `initialize` | Create config PDA (authority, USDC mint, fee bps) |
| `create_market` | Open market PDA + vault (`market_type`: 0=1X2, 1=goals, 2=corners) |
| `deposit` | Stake USDC into an outcome before kickoff |
| `settle` | Authority settles with scores; optional CPI into TxLINE `validate_stat_v2` when `proof_ix_data` + remaining accounts (`txoracle`, `daily_scores_roots`) are provided |
| `claim` | Winner (or refund on void) withdraws USDC minus fee |
| `void_market` | Authority voids for refunds |

## TxLINE verification

- Off-chain keeper fetches `/api/scores/stat-validation-v2`, checks the `daily_scores_roots` PDA on-chain, and persists a settlement receipt for the UI.
- On-chain settle accepts pre-built `validate_stat_v2` instruction bytes for CPI when the keeper attaches remaining accounts.

## Build

```bash
cargo check -p whistle
anchor build   # when Anchor toolchain is available
```
