# Demo video outline (≤5 min)

1. **Problem (30s)** — World Cup fans want to stake with friends/public and get paid at FT so they can roll into the next match. Sportsbooks are opaque; group Venmo pools end in arguments; slow market resolution kills the tournament rhythm.

2. **Product walkthrough (2.5 min)**
   - Landing: Whistle hero + markets board
   - Group stage tables (`/groups`)
   - News wire (`/news`)
   - Open a match, stake on 1X2 / totals; show pool % updating
   - Create a Squad, invite code, squad market, leaderboard
   - Positions page + claim after settle
   - Admin console (`/admin`) lock / settle (ops, optional 15s)

3. **Data + settlement (1 min)**
   - `/api/health` — `fixtureSource` txline or thesportsdb, news rss
   - Live score / FT settle path; Settled · claim
   - Mention TxLINE as primary oracle path when token is live

4. **Close (30s)** — Repo, VPS URL, stake→settle→claim for judges.
