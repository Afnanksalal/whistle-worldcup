#!/usr/bin/env node
/**
 * Prints a submission summary for Superteam Earn.
 * Run: node scripts/submission-checklist.js
 */
const fs = require("fs");
const path = require("path");

const checks = [
  ["README.md", "Product readme"],
  ["docs/TECH.md", "Technical documentation"],
  ["docs/DEMO.md", "Demo video outline"],
  ["docs/DEPLOY.md", "Deploy guide"],
  ["programs/whistle/src/lib.rs", "Anchor settlement program"],
  ["apps/api/src/index.ts", "API + TxLINE ingest"],
  ["apps/web/src/app/page.tsx", "Product UI"],
];

console.log("Whistle — Superteam submission readiness\n");
for (const [file, label] of checks) {
  const ok = fs.existsSync(path.join(__dirname, "..", file));
  console.log(`${ok ? "OK" : "MISSING"}  ${label} (${file})`);
}
console.log(`
Remaining manual steps:
1. Push public GitHub repo — DONE (https://github.com/Afnanksalal/whistle-worldcup)
2. Deploy API + web to production hosts (see docs/DEPLOY.md) — local demo running; Vercel needs login
3. Record Loom/YouTube demo ≤5 min (docs/DEMO.md)
4. Submit on Superteam Earn with TxLINE feedback (docs/SUBMISSION.md)
`);
