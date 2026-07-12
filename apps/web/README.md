# Whistle web

Next.js 15 product UI. Deployed on the VPS behind Caddy (same-origin with the API). **Not** deployed to Vercel.

```bash
npm run dev -w @whistle/web
```

Set `NEXT_PUBLIC_API_URL=http://localhost:4000` for local. Production compose leaves it empty (same-origin).
