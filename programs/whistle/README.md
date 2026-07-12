# Whistle Anchor program

Parimutuel World Cup markets with USDC escrow PDAs.

## Instructions

| Ix | Purpose |
|----|---------|
| `initialize` | Config PDA + USDC mint |
| `create_market` | Market PDA + token vault |
| `deposit` | Stake USDC into an outcome; upsert position PDA |
| `settle` | Authority settles with final scores (keeper attaches TxLINE validation accounts for CPI when available) |
| `claim` | Winners withdraw pro-rata pool share |
| `void_market` | Refund path for abandoned matches |

## Build

Requires Solana CLI + Anchor 0.30.x:

```bash
anchor build
anchor deploy --provider.cluster devnet
```

Program id placeholder in `declare_id!` / `Anchor.toml` must be updated after first `anchor keys list`.
