#!/usr/bin/env node
// scripts/container-browser-probe.mjs — runs INSIDE the container lane
// (mounted at /work with the lane's node_modules; browsers at
// /ms-playwright). Launches each requested engine headlessly and closes it,
// printing one JSON verdict per line that scripts/doctor.mjs relays. Launch
// problems are classified exactly like the host lane (doctor-core), so a
// launch-blocked engine is never mistaken for an application/test failure.
import { classifyBrowserFailure } from "./lib/doctor-core.mjs";

let playwright;
try {
  playwright = await import("@playwright/test");
} catch (err) {
  console.log(
    JSON.stringify({
      engine: "*",
      ok: false,
      kind: "not-installed",
      reason: `playwright not importable in the container lane: ${String(err).slice(0, 160)}`,
      fix: "rebuild the lane dependencies: node scripts/container-test.mjs --rebuild-deps",
    }),
  );
  process.exit(1);
}

const engines = (process.argv[2] ?? "chromium,firefox,webkit")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

let allReady = true;
for (const engine of engines) {
  const browserType = playwright[engine];
  if (!browserType) {
    allReady = false;
    console.log(
      JSON.stringify({
        engine,
        ok: false,
        kind: "unknown-engine",
        reason: `no browser type "${engine}"`,
        fix: "use chromium, firefox, or webkit",
      }),
    );
    continue;
  }
  try {
    const browser = await browserType.launch({ headless: true, timeout: 20_000 });
    await browser.close();
    console.log(JSON.stringify({ engine, ok: true, kind: "ready" }));
  } catch (err) {
    allReady = false;
    const classified = classifyBrowserFailure(String(err?.message ?? err));
    console.log(JSON.stringify({ engine, ok: false, ...classified }));
  }
}

process.exit(allReady ? 0 : 1);
