---
status: resolved
trigger: "Build complete and I can get to the prod site now! injestion isn't working though. Hitting 500's. Pasting is throwing 400's even with valid content"
created: 2026-08-21
updated: 2026-08-21
---

# Debug Session: vercel-ingest-500 (REOPENED — fix 1 regressed in prod)

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

- hypothesis: CONFIRMED (both layers). Layer 1: @vercel/node transpiles each traced TS file individually; extensionless relative specifier survives into ESM output → ERR_MODULE_NOT_FOUND cold start. Layer 2 (reopen): `--packages=external` left bare imports to RUNTIME resolution against nft's traced node_modules subset, where CJS `html-encoding-sniffer` require()s ESM-only `@exodus/bytes/encoding-lite.js` → ERR_REQUIRE_ESM cold start. Full bundling eliminates runtime module resolution entirely (plus three further load-time traps found by isolated verification: esbuild `__require` shim is inert under pure ESM, jsdom reads default-stylesheet.css via `__dirname` at module load, css-tree loads its JSON datasets via `createRequire` at runtime, jsdom eagerly `require.resolve`s its sync-XHR worker).
- test: APPLIED (fix 2) — scripts/build-api.mjs: full esbuild bundle (node_modules IN, `--external:canvas`, createRequire banner), 3 plugin transforms (jsdom stylesheet inline, css-tree JSON inline, sync-XHR worker stub), post-build self-containment assertions (zero non-builtin/non-canvas runtime requires, zero require.resolve, zero __dirname), ISOLATED smoke (no reachable node_modules).
- expecting: MET — all gates green; see Resolution.verification.
- next_action: none — prod verified live. Monitor for regressions; candidate follow-ups in Notes.
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
- timestamp: 2026-08-21T17:18 — Node smoke on the PACKAGED func entry (.vercel/output/.../ingest.func/api/ingest.js, resolving against the func's traced node_modules): all 3 checks PASS again, same deterministic article id — offline-equivalent of the Lambda cold start. (REOPEN NOTE: this smoke was INVALID — repo node_modules was reachable from the func path; the isolated rerun below is the authoritative one.)
- timestamp: 2026-08-21T~21:3x (fix 2) — Isolated cold-start smoke (temp dir, verified ZERO node_modules above it) on the full bundle exposed and killed four sequential load-time crashes: (1) banner `createRequire` import name-collided with esbuild's own generated import → SyntaxError at parse (aliased to `__nodeRequireFactory`); (2) jsdom computed-style.js reads default-stylesheet.css at module load via `__dirname` (undefined in ESM) → inlined as a string literal via plugin; (3) css-tree loads patch.json + 3 mdn-data JSONs + its package.json at runtime via `createRequire` (invisible to esbuild static analysis) → MODULE_NOT_FOUND → inlined as JSON.parse literals via plugin; (4) jsdom XMLHttpRequest-impl eagerly `require.resolve`s ./xhr-sync-worker.js (spawned only for sync XHR — unused by ingest) → stubbed with a marker string via plugin.
- timestamp: 2026-08-21T~21:3x — Isolated smoke on final bundle: 5/5 PASS (cold start, malformed→400 server-error, technical-post.html paste→200 id=paste-23004d76a40f 63 blocks confident — byte-identical output to fix-1's pipeline, thin URL example.com→400 extraction-unsupported (honest ING-06 refusal — proves safeFetch/SSRF/parse/Readability all ran), Wikipedia/Lem URL→200 confident). fflate's root-anchored require of builtin worker_threads verified safe (try/catch).
- timestamp: 2026-08-21T~21:3x — Regression gates: contract spec 4/4; full unit suite 1248 passed | 13 skipped (identical to baseline); lint clean except 3 pre-existing zipSlip errors (documented out of scope).
- timestamp: 2026-08-21T~21:3x — `vercel build` with default stack fails "Maximum call stack size exceeded" inside @vercel/node 5.10.2 building the bundle (empirical: 16MB unminified needs ~4MB stack; 8.9MB minified still >984KB default — recursion scales with bundle size, so minification/content reduction cannot fix it; @vercel/nft standalone traces the same file fine). Resolution: vercel@59.3.0 pinned as exact devDep + scripts/deploy-vercel.mjs launcher spawning the CLI with --stack-size=8000 (NODE_OPTIONS cannot carry --stack-size — blocked flag).
- timestamp: 2026-08-21T~21:4x — Packaged func via vercel build (raised stack): .vercel/output/functions/api/ingest.func contains exactly ONE file — api/ingest.js, cmp-verified byte-identical to the isolated-smoked artifact; no node_modules traced (nothing external to trace); runtime nodejs24.x/arm64.
- timestamp: 2026-08-21T~21:5x — DEPLOYED (user-authorized) via npm run deploy:vercel → production lem-reader-ff0in0u56, aliased https://lem-reader.vercel.app. LIVE CONTRACT: malformed JSON → 400 {"ok":false,"reason":"server-error"} (was 500); thin URL example.com → 400 {"ok":false,"reason":"extraction-unsupported"} (honest refusal, URL pipeline alive); technical-post.html paste → 200 ok:true id=paste-23004d76a40f 63 blocks confident (id matches local isolated smoke exactly); https://en.wikipedia.org/wiki/Stanisław_Lem → 200 ok:true 63 blocks confident. PROD INGEST WORKING.

## Eliminated

- Bundling regression hypothesis for the paste-400 symptom: smoke test initially got 400 `round-trip-anchor-failed` on synthetic repetitive HTML — confirmed fixture-specific (TextQuoteSelector ambiguity gate, SC#1), NOT a bundling artifact; real fixture extracts confidently.
- Variant (b) as merely hypothesized: it BECAME fix 2 after variant (a) regressed in prod — nft's traced subset proved semantically different from the full tree (CJS→ESM-only-subpath require).
- Minification/content reduction as a fix for the @vercel/node stack overflow: recursion scales with bundle size and even the 8.9MB minified bundle exceeds the default ~984KB stack — only a raised stack (launcher) works.
- "example.com URL ingest → 200" expectation from the reopen brief: example.com is thin content (one h1 + one paragraph) — the ING-06 honest gate correctly refuses `extraction-unsupported` (identical in dev and bundle; verified against server/ingest.ts L558-564). The 200 happy path needs a real article (Wikipedia verified 200 confident, locally isolated AND live in prod).

## Resolution

- root_cause: TWO layers. (1) Original: @vercel/node transpiles each traced TS file individually; the extensionless `../server/ingestAdapter` specifier survived into ESM output where Node does not probe extensions → ERR_MODULE_NOT_FOUND cold start → every /api/ingest request 500'd. (2) Reopen (fix-1 regression): with `--packages=external`, bare imports resolved at RUNTIME against @vercel/nft's traced node_modules SUBSET, where CJS `html-encoding-sniffer` (jsdom dep) require()s `@exodus/bytes/encoding-lite.js` — an ESM-only subpath (package `"type": "module"`, no `require` export condition) → ERR_REQUIRE_ESM cold start. Additionally, full bundling surfaced four more load-time traps that runtime-resolution masking had hidden: esbuild's `__require` shim is inert under pure ESM (no `require` global), jsdom reads default-stylesheet.css at module load via `__dirname`, css-tree loads its JSON datasets via `createRequire` at runtime, and jsdom eagerly resolves its sync-XHR worker path. Local verification missed layer 2 because the packaged-func smoke ran with the repo's full node_modules reachable (resolution masked the traced-subset divergence).
- fix: scripts/build-api.mjs replaces the esbuild CLI one-liner — full bundle (node_modules IN, `--external:canvas` only), createRequire banner (aliased import; makes all 130+ dynamic `__require` calls behave like real Node; canvas fails cleanly inside jsdom's try/catch), three targeted plugin transforms (jsdom default-stylesheet.css inlined as string, css-tree's four runtime JSON requires inlined as JSON.parse literals, jsdom's eager sync-XHR-worker require.resolve stubbed), and post-build SELF-CONTAINMENT ASSERTIONS that fail the build on any surviving non-builtin/non-canvas runtime require, require.resolve, or __dirname reference. @vercel/node's builder stack-overflows on the ~16MB bundle (size-proportional recursion, default stack insufficient, not fixable by minification) → vercel@59.3.0 pinned as exact devDep + scripts/deploy-vercel.mjs launcher spawning the CLI with --stack-size=8000; `deploy:vercel` now runs the launcher. `npm run build` chains build:api first so bundling failures fail the deploy.
- verification: (1) build assertions pass; (2) ISOLATED smoke (verified no node_modules above the run dir) 5/5: cold start, malformed→400 server-error, paste→200 id=paste-23004d76a40f/63 blocks/confident (byte-identical to fix-1 evidence), thin URL→400 extraction-unsupported (honest ING-06), Wikipedia URL→200 confident; (3) contract spec 4/4; (4) full unit suite 1248 passed | 13 skipped; (5) vercel build (raised stack) → func dir = ONE file, cmp-identical to smoked artifact, no traced node_modules; (6) LIVE on prod alias lem-reader.vercel.app (deployment lem-reader-ff0in0u56, user-authorized deploy): malformed→400 server-error, example.com→400 extraction-unsupported, paste→200 id=paste-23004d76a40f, Wikipedia/Lem→200 confident.
- files_changed: scripts/build-api.mjs (new), scripts/deploy-vercel.mjs (new), package.json (build:api → build script, deploy:vercel → launcher, vercel 59.3.0 exact devDep), package-lock.json, api-src/ingest.ts (header documents fix 2 + deploy authorization note), eslint.config.js (files glob +mjs — .mjs scripts previously fell through to bare recommended config without node globals). server/, src/, functions/, tests/, wrangler.toml untouched (D7-05 + quick-task constraints respected; the contract spec needed no change — fix 1 already pointed it at api-src/).

## Notes

- Constraints from quick task 260821-k6z remain: functions/**, wrangler.toml, server/** business logic, src/** must stay untouched (the esbuild entry may live beside the existing adapter; do not fork ingest logic — the D7-05 adapter boundary).
- `vercel build` + `vercel dev` run the real @vercel/node pipeline locally — use for iteration instead of deploy-per-attempt. NOTE (fix 2): local `vercel build`/`deploy` on the big bundle MUST run with a raised stack — use `npm run deploy:vercel` (launcher) or `node --stack-size=8000 node_modules/vercel/dist/vc.js build`; the CLI is authenticated on this machine. `npx vercel deploy` (preview) is permitted for final verification. Prod deploys go through `npm run deploy:vercel` — the agent runs it only on explicit user authorization (granted for the fix-2 deploy; locked decision 4 otherwise).
- Residual (accepted, documented): if this project ever switches to git-connected CLOUD builds, the @vercel/node stack overflow on the 16MB bundle will recur on Vercel's build infra (their default stack) — deploys must stay CLI-driven (launcher), or the bundle must be split/shrunk when that migration happens.
- Follow-up candidate 2 (out of scope): bundle size 16MB unminified — minify would cut it to ~9MB but loses stack-trace readability and does NOT fix the stack overflow; revisit only if cold-start latency or bandwidth matters.
- Vercel CLI 59.3.0, Node 22.22.3, org william-van-derens-projects, project prj_29ySZSNV24R3j4EY1E7EegodnA8t (lem-reader).
- esbuild is NOT currently a devDep (check node_modules — vite 8 bundles Rolldown; esbuild may exist transitively but must be added explicitly as devDep for a stable CLI path). → RESOLVED: added as exact devDep 0.28.1 (matched the transitively-present version; lockfile delta = 1 line).
- Follow-up candidate (pre-existing, out of scope): `npm run lint` reports 3 errors in src/portability/zipSlip.ts (no-control-regex on deliberate \x1f path-safety regexes + one no-useless-escape). Present before this session; the regexes look intentional — either disable the rules inline with a comment or restructure, in a separate task.
- Runtime note: packaged func runs nodejs24.x (project default) — bundle targets node22, forward-compatible; no action needed.

## REOPENED 2026-08-21 ~19:6x — fix 1 regressed in prod (new failure mode)

Deployed via `npm run deploy:vercel` (commit 39cd95c → deployment lem-reader-r01ux9p76). Prod STILL 500s — but a DIFFERENT, deeper crash:

```
Error [ERR_REQUIRE_ESM]: require() of ES Module /var/task/node_modules/@exodus/bytes/encoding-lite.js
  from /var/task/node_modules/html-encoding-sniffer/lib/html-encoding-sniffer.js not supported
Node.js process exited with exit status: 1
```

- The esbuild relative-import fix WORKED (no more ERR_MODULE_NOT_FOUND). New failure is in the `--packages=external` layer: prod runs against the nft-traced node_modules SUBSET in /var/task, where CJS `html-encoding-sniffer` (jsdom dep) `require()`s `@exodus/bytes/encoding-lite.js` — an ESM-only subpath. Bare `require()` of ESM is not supported on Node.
- Why local verification missed it: the packaged-entry smoke ran with the repo's full node_modules reachable from cwd; module resolution masked the difference between the full tree and the traced subset. LESSON: verify packaged output in ISOLATION (temp cwd with no node_modules above it).
- Next fix (variant b, already hypothesized in this session): drop `--packages=external` — bundle node_modules INTO api/ingest.js (`--bundle --platform=node --format=esm --target=node22 --external:canvas`). esbuild resolves the @exodus/bytes require at BUILD time (CJS→ESM wrapping handled by its shims), eliminating runtime node_modules resolution entirely. jsdom's optional `canvas` require stays external (not installed; jsdom degrades gracefully in try/catch). Watch: bundle size (~few MB, 250MB limit fine); verify zero bare imports in output; ISOLATED smoke (no repo node_modules visible) before deploying; then `npm run deploy:vercel` + live curl contract check (malformed 400, paste 200, URL ingest 200).

### REOPEN RESOLUTION (fix 2, 2026-08-21 ~21:5x) — RESOLVED

Variant b applied and extended. The isolated smoke (the verification fix 1 lacked) exposed FOUR more load-time crashes beyond ERR_REQUIRE_ESM before the bundle was truly self-contained: banner import name-collision (SyntaxError), jsdom's `__dirname` stylesheet read, css-tree's runtime `createRequire` JSON loads, and jsdom's eager sync-XHR-worker `require.resolve` — all fixed by targeted plugin transforms in the new scripts/build-api.mjs, plus build-time self-containment assertions so this CLASS of bug (any runtime module/filesystem resolution surviving bundling) fails the build instead of prod. A separate platform finding: @vercel/node's builder stack-overflows on the ~16MB bundle under Node's default stack (size-proportional recursion; minification does not fix) — resolved by pinning vercel@59.3.0 as an exact devDep and deploying through scripts/deploy-vercel.mjs (spawns the CLI with --stack-size=8000; NODE_OPTIONS cannot carry the flag). Deployed (user-authorized) to lem-reader-ff0in0u56 / https://lem-reader.vercel.app and verified live: malformed→400 server-error, example.com→400 extraction-unsupported (honest ING-06 refusal — the reopen brief's "example.com → 200" expectation was wrong; thin page), technical-post.html paste→200 (id=paste-23004d76a40f, identical to local), Wikipedia/Lem→200 confident. Full details in Resolution. LESSON (now enforced by build assertions): isolated verification is mandatory for packaged output; repo node_modules masks exactly the failures that matter.
