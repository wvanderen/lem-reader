// scripts/deploy-vercel.mjs — deploy /api/ingest to Vercel prod.
//
// Runs the Vercel CLI with a raised V8 stack. Debug session
// vercel-ingest-500 (fix 2): api/ingest.js is a fully self-contained
// ~16MB esbuild bundle, and @vercel/node's dependency analysis recurses
// proportionally to the bundle — Node's default ~984KB stack overflows
// ("Maximum call stack size exceeded") during the CLI's local function
// collection (empirical: 16MB needs ~4MB stack; 8.9MB minified still
// >984KB). `--stack-size` cannot travel via NODE_OPTIONS (blocked flag),
// so the CLI is spawned directly with the flag. The CLI itself is pinned
// as an exact devDependency for deterministic deploys.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

function resolveVercelCliEntry() {
  const pkgJsonPath = require.resolve("vercel/package.json");
  const pkg = require("vercel/package.json");
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.vercel;
  if (!bin) throw new Error("vercel package exposes no bin");
  return path.join(path.dirname(pkgJsonPath), bin);
}

const cliEntry = resolveVercelCliEntry();
const result = spawnSync(
  process.execPath,
  ["--stack-size=8000", cliEntry, "deploy", "--prod", "--yes", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status ?? (result.signal ? 1 : 0));
