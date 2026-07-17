# Whistle — Deployment Guide

## Stack

| Piece | Detail |
|-------|--------|
| Host | XPipe **Playground** EC2 (`ec2-18-61-174-6.ap-south-2.compute.amazonaws.com`) |
| Path | `/opt/whistle` |
| Compose | [`infra/playground/docker-compose.yml`](../infra/playground/docker-compose.yml) |
| Edge | Caddy same-origin `/api` + `/ws` + Next.js |
| Public | Cloudflare tunnel (or TLS `:9444` when SG/cert ready) |

---

## Part 1 — Solana / Anchor Setup

### Prerequisites (Windows with WSL)

```powershell
wsl --install -d Ubuntu-24.04
```

Inside Ubuntu install the Solana CLI, Rust 1.79, and Anchor 0.30.1. Anchor 0.30.1
must not be built with the newest Rust compiler because its locked `time` crate
predates a compiler inference change.

```bash
rustup toolchain install 1.79.0 --profile minimal
RUSTUP_TOOLCHAIN=1.79.0 avm install 0.30.1
avm use 0.30.1
```

### Generate and fund authority wallet

```bash
# Generate a new keypair (save this securely — this IS the admin/authority)
solana-keygen new -o wallet.json

# Point CLI at devnet
solana config set --url devnet

# Airdrop SOL for rent + fees (devnet only; the faucet can be rate-limited)
solana airdrop 2 --keypair wallet.json

# Programmatic fallback documented by Solana
cargo install devnet-pow
devnet-pow mine -d 3 --reward 0.02 --no-infer -t 5000000000
```

### Build and deploy the program

```bash
# Generate the deploy keypair, synchronize its public ID, then rebuild
anchor build
anchor keys sync
anchor build

# Deploy to devnet — outputs a new Program ID
anchor deploy --provider.cluster devnet

# Copy the deployed program ID and run `anchor keys sync` if the generated
# keypair does not match `declare_id!` / Anchor.toml before rebuilding.
```

### Update .env with real Program ID

Current playground / competition deploy (devnet):

```bash
WHISTLE_PROGRAM_ID=C2vCTGZDJYvcd8jdgvFF57FnfdDsUqQy7qogjP2SmDcU
SOLANA_KEYPAIR_PATH=/run/secrets/whistle-authority.json
STAKE_ASSET=USDC
SETTLEMENT_RAIL=onchain
ENABLE_ONCHAIN_SETTLEMENT=true
USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU   # devnet USDC
PLATFORM_FEE_BPS=250
TXLINE_COMPETITION_IDS=72
TXLINE_FIXTURE_LOOKBACK_DAYS=50
```

Authority keypair lives at `secrets/whistle-authority.json` on the host (never
commit). Fresh USDC mode needs a clean API ledger volume — leftover play-unit
positions fail the on-chain boot check.

### Initialize the program on-chain (one-time)

```bash
# Creates the whistle_config PDA with 2.5% platform fee
node scripts/init-program.js --fee-bps 250

# Verify it's on-chain:
solana account <config_pda_from_output> --url devnet
```

### Settle a market (admin — after match ends)

```bash
node scripts/settle-market.js \
  --fixture tsdb-429 \
  --type match_result \
  --home 2 --away 1 \
  --validation-confirmed
```

The normal settlement path is the API keeper, which fetches the canonical
TxLINE final record and validation payload. The script is an operator recovery
tool and deliberately requires an explicit validation acknowledgement.

---

## Part 2 — Application Server (VPS)

### Required secrets (VPS `.env`)

```bash
TXLINE_API_TOKEN=...          # mandatory — API will not boot without it
ADMIN_API_KEY=...             # ≥16 chars — settle/void/admin console
NEXT_PUBLIC_SITE_URL=https://your-public-origin.example
API_CORS_ORIGIN=same-origin   # behind Caddy; or explicit https://your.host
GROQ_API_KEY=...              # optional; grounded forecast/insight wording only

# Solana on-chain (devnet program already deployed for playground)
WHISTLE_PROGRAM_ID=C2vCTGZDJYvcd8jdgvFF57FnfdDsUqQy7qogjP2SmDcU
COMPOSE_FILE=docker-compose.yml:docker-compose.onchain.yml
WHISTLE_AUTHORITY_FILE=/opt/whistle/secrets/whistle-authority.json
USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
PLATFORM_FEE_BPS=250
REQUIRE_WALLET_AUTH=true
STAKE_ASSET=USDC
SETTLEMENT_RAIL=onchain
ENABLE_ONCHAIN_SETTLEMENT=true

# Full World Cup board (past + remaining)
TXLINE_COMPETITION_IDS=72
TXLINE_FIXTURE_LOOKBACK_DAYS=50

# Stable Cloudflare hostname; omit only when using the temporary quick tunnel
CLOUDFLARE_TUNNEL_TOKEN=<named_tunnel_token>
```

On-chain mode also requires a real (non-placeholder) TxLINE token. Startup
checks the executable program, config PDA owner, authority, mint, and fee before
the API begins listening. Public program/mint addresses are served by `/api/meta`;
they are not separate frontend build-time settings.

Place the authority key at `/opt/whistle/secrets/whistle-authority.json`, owned
by the deploy user with mode `600`. The on-chain Compose override mounts it
read-only at `/run/secrets/whistle-authority.json`; never put its bytes in `.env`.

`DEMO_MODE` / `ALLOW_SANDBOX` are **removed**. Setting them crashes boot.

### Deploy

```bash
cd /opt/whistle && git fetch origin && git reset --hard origin/master
cd infra/playground
# edit .env — must include TXLINE_API_TOKEN + ADMIN_API_KEY + NEXT_PUBLIC_SITE_URL
docker compose up -d --build
docker compose --profile named-tunnel up -d named-tunnel
curl -sf http://127.0.0.1:8088/api/health

# Temporary fallback when a named tunnel token is not configured:
docker compose --profile tunnel up -d tunnel
docker logs playground-tunnel-1 2>&1 | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true
```

---

## Observability

| Endpoint | Purpose |
|----------|---------|
| `GET /api/live` | Liveness |
| `GET /api/ready` | Readiness (fixtures loaded) |
| `GET /api/health` | JSON health + counters |
| `GET /api/metrics` | Prometheus text |

Structured JSON logs via pino. Request IDs on `x-request-id`.

---

## Admin

Open `/admin` on the site and paste `ADMIN_API_KEY`. It is held in session storage and clears when the browser session ends.

---

## CI/CD

| Workflow | Action |
|----------|--------|
| `ci.yml` | check + build |
| `deploy-playground.yml` | after successful master CI: SSH → pull → compose rebuild |

Secrets: `PLAYGROUND_SSH_KEY`, `PLAYGROUND_HOST`, `PLAYGROUND_USER`.

`NEXT_PUBLIC_SITE_URL` is a build input because canonical URLs, Open Graph tags, the sitemap, and LLM discovery files must agree on one public HTTPS origin.

---

## Local dev (still live-only)

```bash
cp .env.example .env   # set TXLINE_API_TOKEN + ADMIN_API_KEY
npm install
npm run build -w @whistle/shared
npm run dev:api        # :4000
npm run dev:web        # :3000
```
