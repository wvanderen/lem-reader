---
status: resolved
trigger: "Build complete and I can get to the prod site now! injestion isn't working though. Hitting 500's. Pasting is throwing 400's even with valid content"
created: 2026-08-21
updated: 2026-08-21
---

# Debug Session: vercel-ingest-500

## Symptoms

- **Expected behavior:** Vercel prod deploy (quick task 260821-k6z, commits cf2a6a3/934853f) serves /api/ingest; URL ingest returns 200 with article; paste ingest returns 200 with article.
- **Actual behavior:** URL ingest hits 500s. Paste ingest appears as 400s in the browser (client calm-error handling around the failing endpoint — likely same root cause).
- **Error messages:** (from `npx vercel logs https://lem-reader-4gwregffs-william-van-derens-projects.vercel.app`, 9 identical entries 16:51–17:09):
  ```
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/server/ingestAdapter'
    imported from /var/task/api/ingest.js
  { code: 'ERR_MODULE_NOT_FOUND', url: 'file:///var/task/server/ingestAdapter' }
  Node.js process exited with exit status: 1.
  ```
- **Timeline:** Started with the first prod deploy (2h old). Never worked in prod. Dev (Vite Node middleware) works fine — 1248 unit tests green including the 4-case api/ingest contract spec.
- **Reproduction:** `curl -X POST https://lem-reader.vercel.app/api/ingest -H "Content-Type: application/json" -d "{bad"` → 500. Any POST to /api/ingest → 500 (function crashes at cold start).

## Environment facts (verified)

- Prod alias `https://lem-reader.vercel.app` is PUBLIC (curl reaches the function: 500, not 401). Only the raw deployment URL is SSO-protected (Vercel Standard deployment protection). No protection changes needed.
- Repo is `"type": "module"` (package.json).
- `api/ingest.ts` imports `"../../server/ingestAdapter"` (extensionless, TS) — mirrors functions/api/ingest.ts which targets the Pages builder (different pipeline, never prod-deployed).
- Vercel builder behavior (empirical): @vercel/node transpiles each traced TS file individually — the extensionless relative specifier survives into `/var/task/api/ingest.js`, and Node ESM resolution cannot load it (ESM requires explicit extensions; it does not probe). The function crashes at module load on cold start → all requests 500.

## Current Focus

- hypothesis: CONFIRMED — @vercel/node transpiles each traced TS file individually (no cross-file bundling); the extensionless relative specifier survived verbatim into /var/task/api/ingest.js; under `"type": "module"` Node ESM does not probe extensions → cold-start ERR_MODULE_NOT_FOUND → process exit before handler logic → 500 on every request. (Note: actual import was `../server/ingestAdapter`, one level — this file's earlier `../../` notation was off; mechanism identical.)
- test: APPLIED — pre-bundle entry with esbuild in buildCommand. Source moved `api/ingest.ts` → `api-src/ingest.ts`; `npm run build:api` bundles to `api/ingest.js` (gitignored output) with `--bundle --platform=node --format=esm --target=node22 --packages=external`; chained first in `build`. Variant (a) (--packages=external + nft tracing) worked — no fallback to (b) needed.
- expecting: MET — see Resolution.verification.
- next_action: USER deploys via `npm run deploy:vercel` (locked decision 4 reserves prod deploy for the user), then curls the prod alias to confirm end-to-end.
- reasoning_checkpoint: resolved

## Evidence

- timestamp: 2026-08-21T19:5x — `npx vercel logs` (production): 9× identical ERR_MODULE_NOT_FOUND `/var/task/server/ingestAdapter` from `/var/task/api/ingest.js`; process exit 1; every POST /api/ingest affected.
- timestamp: 2026-08-21T19:5x — `curl -X POST https://lem-reader.vercel.app/api/ingest` (malformed body) → HTTP 500 (public alias, function reachable, crashes at load).
- timestamp: 2026-08-21T19:4x — `curl` against raw deployment URL `lem-reader-4gwregffs-...vercel.app` → HTTP 401 "Protected deployment" (SSO; explains why only the prod alias should be used for testing/verification).
- timestamp: 2026-08-21 — Repo facts: package.json `"type": "module"`; api/ingest.ts imports `../server/ingestAdapter` extensionless; dev path (Vite Node middleware) runs the identical adapter in Node natively and passes 1248 unit tests.
- timestamp: 2026-08-21T17:16 — Fix applied. `npm run build:api` → api/ingest.js (106KB): grep-verified ZERO relative specifiers remain (all of server/ inlined); 18 bare imports (node builtins + jsdom/isomorphic-dompurify/@mozilla/readability/zod/ip-address/unified/remark-*/yaml/fast-xml-parser/fflate).
- timestamp: 2026-08-21T17:16 — Node 22 smoke on the bundle: module LOADS (the exact prod crash point); malformed JSON → 400 {ok:false,reason:"server-error"}; technical-post.html paste → 200 {ok:true} 63 blocks, confidence=confident (real jsdom+DOMPurify+Readability pipeline through bare-import resolution). Deterministic id paste-23004d76a40f.
- timestamp: 2026-08-21T17:17 — Contract spec (import updated to api-src/): 4/4 green. Full unit suite: 1248 passed | 13 skipped — no regressions.
- timestamp: 2026-08-21T17:17 — `npx vercel pull && npx vercel build` (real pipeline, no deploy): function collected from api/ingest.js via @vercel/node (builds.json), runtime nodejs24.x/arm64; .vercel/output/functions/api/ingest.func/ contains our byte-identical bundle + nft-traced node_modules (jsdom, isomorphic-dompurify, @mozilla, ip-address, css-tree, …).
- timestamp: 2026-08-21T17:18 — Node smoke on the PACKAGED func entry (.vercel/output/.../ingest.func/api/ingest.js, resolving against the func's traced node_modules): all 3 checks PASS again, same deterministic article id — offline-equivalent of the Lambda cold start.

## Eliminated

- Bundling regression hypothesis for the paste-400 symptom: smoke test initially got 400 `round-trip-anchor-failed` on synthetic repetitive HTML — confirmed fixture-specific (TextQuoteSelector ambiguity gate, SC#1), NOT a bundling artifact; real fixture extracts confidently.
- Variant (b) (bundle node_modules, --external:canvas): not needed — nft traced all packages incl. jsdom optional-dep graph correctly.

## Resolution

- root_cause: @vercel/node transpiles each traced TS file individually without bundling relative imports; the extensionless `../server/ingestAdapter` specifier survived into /var/task/api/ingest.js, and under `"type": "module"` Node ESM requires explicit extensions on relative imports (no CJS probing) → ERR_MODULE_NOT_FOUND at cold start → every /api/ingest request 500'd regardless of body (paste-400s in the browser were the client's calm-error mapping over the same crashed endpoint).
- fix: Pre-bundle the function entry with esbuild in the Vercel buildCommand. Source moved api/ingest.ts → api-src/ingest.ts (header corrected: the old "Vercel bundles api/ functions at deploy time" claim was wrong); new `build:api` script (esbuild --bundle --platform=node --format=esm --target=node22 --packages=external) emits gitignored api/ingest.js with ALL relative imports inlined; chained first in `build` so a bundling failure fails the deploy build. esbuild 0.28.1 added as exact devDep. Contract spec import updated; eslint ignores generated `api/` + `.vercel/`. server/, src/, functions/, wrangler.toml untouched (D7-05 constraint respected).
- verification: (1) bundle grep: zero relative specifiers, 18 bare imports; (2) Node smoke on bundle: loads + malformed→400 + real-HTML paste→200 confident; (3) contract spec 4/4; (4) full unit suite 1248 green; (5) `vercel build` real pipeline: function collected, nft-traced deps packaged, runtime nodejs24.x; (6) Node smoke on the PACKAGED func entry: all pass, same deterministic article id. PENDING (user-run, locked decision 4): `npm run deploy:vercel`, then `curl -X POST https://lem-reader.vercel.app/api/ingest -H 'Content-Type: application/json' -d '{bad'` → expect 400 (not 500), and a real URL/paste ingest → 200.
- files_changed: api/ingest.ts → api-src/ingest.ts (moved + header rewrite), package.json (build chain + build:api + esbuild devDep), package-lock.json, .gitignore (/api/), eslint.config.js (ignores), tests/unit/server/vercel-ingest-endpoint.spec.ts (import path).

## Notes

- Constraints from quick task 260821-k6z remain: functions/**, wrangler.toml, server/** business logic, src/** must stay untouched (the esbuild entry may live beside the existing adapter; do not fork ingest logic — the D7-05 adapter boundary).
- `vercel build` + `vercel dev` run the real @vercel/node pipeline locally — use for iteration instead of deploy-per-attempt. `npx vercel deploy` (preview) is permitted for final verification; the CLI is authenticated on this machine (user deployed earlier). Finish with `--prod` ONLY via the existing `npm run deploy:vercel` script or explicit user request.
- Vercel CLI 59.3.0, Node 22.22.3, org william-van-derens-projects, project prj_29ySZSNV24R3j4EY1E7EegodnA8t (lem-reader).
- esbuild is NOT currently a devDep (check node_modules — vite 8 bundles Rolldown; esbuild may exist transitively but must be added explicitly as devDep for a stable CLI path). → RESOLVED: added as exact devDep 0.28.1 (matched the transitively-present version; lockfile delta = 1 line).
- Follow-up candidate (pre-existing, out of scope): `npm run lint` reports 3 errors in src/portability/zipSlip.ts (no-control-regex on deliberate \x1f path-safety regexes + one no-useless-escape). Present before this session; the regexes look intentional — either disable the rules inline with a comment or restructure, in a separate task.
- Runtime note: packaged func runs nodejs24.x (project default) — bundle targets node22, forward-compatible; no action needed.
