#!/usr/bin/env node
/**
 * Soft-guard: warn if the user prompt looks like it asks to commit secrets.
 */
async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

readStdin()
  .then((raw) => {
    let prompt = "";
    try {
      const data = JSON.parse(raw || "{}");
      prompt = String(data.prompt || data.text || JSON.stringify(data));
    } catch {
      prompt = raw || "";
    }

    const lower = prompt.toLowerCase();
    const risky =
      lower.includes("commit .env") ||
      lower.includes("commit the wallet") ||
      lower.includes("push api token") ||
      lower.includes("commit wallet.json");

    if (risky) {
      process.stdout.write(
        JSON.stringify({
          continue: true,
          additionalContext:
            "SECURITY: Do not commit .env, wallet.json, or TxLINE API tokens. Use .env.example only.",
        })
      );
      return;
    }

    process.stdout.write(JSON.stringify({ continue: true }));
  })
  .catch(() => {
    process.stdout.write(JSON.stringify({ continue: true }));
  });
