# Whistle Anchor program

USDC parimutuel escrow for Whistle markets on Solana (devnet/mainnet).

## Instructions

| Instruction | Role |
|-------------|------|
| `initialize` | Create config PDA (authority, USDC mint, fee bps) |
| `create_market` | Open market PDA + vault (`market_type`: 0=1X2, 1=goals, 2=corners) |
| `deposit` | Stake USDC into an outcome before kickoff |
| `settle` | Authority settles with scores **and** a hard TxLINE `validate_stat_v2` CPI (`proof_ix_data` + remaining accounts). Empty proofs are rejected; CPI must return `true`. |
| `claim` | Winner (or refund on void) withdraws USDC minus fee |
| `void_market` | Authority voids for refunds |

## TxLINE verification

- Off-chain keeper fetches `/api/scores/stat-validation-v2`, confirms the `daily_scores_roots` PDA on-chain, encodes `validate_stat_v2` bytes that bind proven home/away goal stats to the settle scores, and persists a settlement receipt for the UI.
- On-chain settle always CPIs into TxLINE with those bytes; soft/empty authority settles are not accepted.

## Build

```bash
cargo check -p whistle
anchor build   # when Anchor toolchain is available
```
