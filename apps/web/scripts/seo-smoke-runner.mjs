import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, "..");
const rootDir = path.resolve(webDir, "..", "..");
const nextBin = path.join(rootDir, "node_modules", "next", "dist", "bin", "next");
const expectedOrigin = "https://whistle.example";

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function runNode(args, options = {}) {
  return spawn(process.execPath, args, {
    cwd: rootDir,
    stdio: "inherit",
    ...options,
  });
}

function waitForExit(child, label) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with ${code ?? signal}`));
    });
  });
}

async function waitForUrl(url, child, label, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited before ${url} became ready`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not become ready within ${timeoutMs}ms`);
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

const fixturePort = await availablePort();
let webPort = await availablePort();
while (webPort === fixturePort) webPort = await availablePort();
const fixtureUrl = `http://127.0.0.1:${fixturePort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const env = {
  ...process.env,
  SEO_FIXTURE_PORT: String(fixturePort),
  INTERNAL_API_URL: fixtureUrl,
  NEXT_PUBLIC_API_URL: fixtureUrl,
  NEXT_PUBLIC_SITE_URL: expectedOrigin,
};

let fixture;
let web;
try {
  fixture = runNode([path.join(scriptDir, "seo-smoke-fixture-server.mjs")], { env });
  await waitForUrl(`${fixtureUrl}/health`, fixture, "SEO fixture API");

  const build = runNode([nextBin, "build"], { cwd: webDir, env });
  await waitForExit(build, "Next.js SEO build");

  web = runNode([nextBin, "start", "--port", String(webPort)], {
    cwd: webDir,
    env,
  });
  await waitForUrl(webUrl, web, "Next.js SEO server");

  const smoke = runNode([path.join(scriptDir, "seo-smoke.mjs")], {
    env: {
      ...env,
      SEO_BASE_URL: webUrl,
      SEO_EXPECTED_ORIGIN: expectedOrigin,
    },
  });
  await waitForExit(smoke, "SEO smoke test");
} finally {
  await stop(web);
  await stop(fixture);
}
