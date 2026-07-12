# Deployment

## Local (demo)

```bash
npm install
npm run build -w @whistle/shared
npm run dev:api   # :4000
npm run dev:web   # :3000
```

## API (Railway / Fly / Render)

- Root directory: `apps/api` or monorepo with `npm run start -w @whistle/api`
- Build: `npm install && npm run build -w @whistle/shared && npm run build -w @whistle/api`
- Start: `npm run start -w @whistle/api`
- Env: copy from `.env.example` — set `TXLINE_*` for live data, `API_CORS_ORIGIN` to your web URL

## Web (Vercel)

- Project root: repo root or `apps/web`
- Framework: Next.js
- Env: `NEXT_PUBLIC_API_URL=https://<your-api>`
- Build includes workspace `@whistle/shared`

## Solana program (devnet)

```bash
# Install Solana CLI + Anchor 0.30.x, then:
solana-keygen new -o wallet.json
solana airdrop 2 --url devnet
anchor build
anchor deploy --provider.cluster devnet
```

Put the deployed program id into `WHISTLE_PROGRAM_ID` / `NEXT_PUBLIC_WHISTLE_PROGRAM_ID`.

## Superteam submission checklist

- [ ] Public GitHub repo
- [ ] Deployed web URL + API URL
- [ ] Demo video ≤5 min (see [DEMO.md](./DEMO.md))
- [ ] Tech doc (this folder’s [TECH.md](./TECH.md))
- [ ] TxLINE endpoints list + feedback note
- [ ] Owned by eligible person/team for payout
