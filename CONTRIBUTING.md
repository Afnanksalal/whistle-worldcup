# Contributing

## Setup

```bash
cp .env.example .env
npm install
npm run build:shared
npm run dev:api
npm run dev:web
```

## Branching

- `master` — stable demo baseline
- `feature/*` — product work; open a PR into `master`

## Checks before PR

```bash
npm run check
npm run build -w @whistle/web
cargo check -p whistle   # if you touched programs/
```

## Style

- Product-first copy (fans, not crypto tourists)
- Deterministic settlement — no fake scores
- Prefer editing existing modules over new abstraction layers

## Docs

| Doc | When to update |
|-----|----------------|
| `docs/TECH.md` | TxLINE endpoints, architecture, resolution |
| `docs/DEMO.md` | Demo script changes |
| `docs/DEPLOY.md` | Hosting / env changes |
| `AGENTS.md` | Agent operating rules |
