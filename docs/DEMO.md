# Demo video outline (≤5 min)

## 1. Problem (30s)

World Cup fans want to stake with friends and get paid at full-time so they can roll into the next match. Sportsbooks are opaque; informal group pools end in arguments; slow resolution kills the tournament rhythm. **Whistle** is a parimutuel prediction pool with a TxLINE-verified keeper and optional Solana escrow.

---

## 2. Product walkthrough (2.5 min)

- **Landing** — Whistle hero + live markets board (live pool totals, kickoff countdowns)
- **Group stage tables** (`/groups`) — standings, goal diff, fixtures
- **News wire** (`/news`) — live RSS headlines from BBC Sport / The Guardian
- **Open a match** — stake on 1X2 / totals; show pool % updating in real-time
- **Connect Phantom wallet** — select devnet, show USDC balance
- **Place a stake** — Phantom popup appears with the deposit transaction → confirm → signature shown
- **Positions page** (`/positions`) — shows active stake, estimated payout
- **Admin settle** — `/admin` console → lock market → settle with score
- **Claim winnings** — Claim button → Phantom popup → confirmed → USDC lands in wallet
- **Platform fee** — show vault balance drops by payout + fee; admin ATA receives the 2.5% fee

---

## 3. On-chain settlement (1 min)

- Open Solana Explorer and show the market PDA account
- Show the deposit transaction — discriminator, outcome byte, amount, position PDA
- Show the claim transaction — two transfers: user ATA + admin ATA (fee)
- `/api/health` — `settlementRail: onchain`, `stakeAsset: USDC`, `onchainSettlementEnabled: true`
- Mention **TxLINE** as primary result oracle when token is live; TheSportsDB as free fallback

---

## 4. Architecture (30s)

```
Fan → Phantom → deposit tx → Solana Anchor escrow PDA
Keeper (API) → TxLINE validate_stat_v2 → settle tx
Fan → Phantom → claim tx → user ATA (net payout) + admin ATA (configured fee)
```

---

## 5. Close (30s)

- Repo link, public VPS URL
- "Stake → TxLINE-verified settlement → claim — built for the rhythm of the World Cup."
- Judges can try the live devnet deployment themselves

---

## Recording checklist

- [ ] Wallet connected (Phantom devnet)
- [ ] Stake transaction visible in Explorer
- [ ] Settle via admin console
- [ ] Claim transaction shows two token transfers (user + fee)
- [ ] `GET /api/health` JSON on screen showing `onchainSettlementEnabled: true`
- [ ] Mention TxLINE as primary oracle
