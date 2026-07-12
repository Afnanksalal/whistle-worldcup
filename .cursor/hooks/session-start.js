#!/usr/bin/env node
/**
 * Injects Whistle context at session start for agents.
 * Reads JSON from stdin (Cursor hook protocol) and prints follow-up context.
 */
const fs = require("fs");
const path = require("path");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

readStdin()
  .then((raw) => {
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }

    const agentsPath = path.join(process.cwd(), "AGENTS.md");
    const hasAgents = fs.existsSync(agentsPath);
    const out = {
      continue: true,
      additionalContext: hasAgents
        ? "Whistle monorepo: read AGENTS.md before large changes. Product-first World Cup pools; TxLINE primary; npm run check before PR."
        : "Whistle repo — keep product UX fan-first; no hardcoded match resolution.",
    };
    process.stdout.write(JSON.stringify(out));
  })
  .catch(() => {
    process.stdout.write(JSON.stringify({ continue: true }));
  });
