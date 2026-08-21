---
phase: quick-260821-k6z
plan: 01
subsystem: deployment
tags: [vercel, deploy, ingest, adapter, d7-05, production]
status: complete
requires: []
provides:
  - "api/ingest.ts — the D7-05 adapter-boundary port to a Vercel Node function (web-standard module-object fetch form, DEFAULT Node runtime, zero npm deps)"
  - "tests/unit/server/vercel-ingest-endpoint.spec.ts — 4-case contract spec for the wrapper's request.json → handleIngestBody → Response.json glue"
  - "vercel.json — exactly two keys (buildCommand npm run build + outputDirectory dist)"
  - "package.json deploy:vercel script (user-run only) + .gitignore .vercel/ entry"
affects: []
tech-stack:
  added: []
  patterns:
    - "Vercel zero-config api/ convention: repo-root api/ingest.ts auto-serves at /api/ingest on the DEFAULT Node.js runtime (jsdom requirement — never edge); no @vercel/node dep needed for the web-standard handler form"
    - "Third wrapper around the UNCHANGED shared server/ingestAdapter.ts helper (Cloudflare Pages Function, Vite dev middleware, Vercel Node function) — behavior byte-identical, only I/O shape differs"
    - "api/ deliberately outside tsconfig include [src,tests] (mirrors functions/ precedent); the spec's import pulls it into the root tsc program transitively — zero config drift"
key-files:
  created:
    - api/ingest.ts
    - tests/unit/server/vercel-ingest-endpoint.spec.ts
    - vercel.json
  modified:
    - .gitignore
    - package.json
decisions:
  - "Web-standard module-object handler (default export with fetch) per current Vercel docs — avoids @vercel/node entirely (that package only supplies VercelRequest/VercelResponse typings) and keeps the wrapper dependency-free (T-Q1-SC)"
  - "vercel.json carries ONLY buildCommand + outputDirectory — Node runtime is the api/ default, hash-based routing needs no SPA-fallback rewrite, so least-config wins; vercel.json cannot carry comments, so this SUMMARY + the plan are the documentation home for the two-key rationale"
  - "Single atomic commit per task (orchestrator constraint) with RED→GREEN discipline observed inside Task 1: the spec was run and FAILED first (import-resolution failure with api/ingest.ts absent — recorded), then implemented and re-run to 4/4 green"
  - "Pre-existing npm run lint failure in src/portability/zipSlip.ts is OUT OF SCOPE (file byte-unchanged since Phase 09-01 commit 9793d1f; src/** is protected by this task's constraints) — logged to deferred-items.md with a 3-line suggested follow-up; this task's files lint clean in isolation"
metrics:
  duration: "5 min"
  completed: "2026-08-21T19:42:38Z"
  tasks: "3 of 3"
---

# Quick Task 260821-k6z: Deploy-minimal-production-to-vercel-port Summary

Ported `/api/ingest` to a Vercel Node function via the unchanged D7-05 adapter boundary and prepared (never executed) a minimal production deploy — the third wrapper around `server/ingestAdapter.ts`, byte-identical in contract to the dev middleware and the Cloudflare Pages Function shape.

## What Was Built

### Task 1 — `api/ingest.ts` + contract spec (commit cf2a6a3, tdd)

- **RED:** wrote `tests/unit/server/vercel-ingest-endpoint.spec.ts` first; `npx vitest run` failed exactly as expected (`Failed to resolve import "../../../api/ingest"` — module absent).
- **GREEN:** implemented `api/ingest.ts` — default-export object whose `fetch(request)` does `await request.json()` in try/catch (malformed → 400 `{ok:false,reason:"server-error"}`, no ingest call), delegates to the UNCHANGED `handleIngestBody` from `../server/ingestAdapter`, and returns `Response.json(body, {status})`. Header block documents the 07-01 HYBRID CONTINGENCY verdict, locked decisions 1–4, and the 4.5MB platform residual. Zero npm dependencies.
- Spec: 4/4 green — parse-fail 400 (ingest NOT called), ok:true → 200 + exact envelope + called-once-with-parsed-body, ok:false → 400 + exact typed refusal, content-type `application/json`.
- `npx tsc --noEmit` exit 0 — the spec's import transitively type-checks `api/ingest.ts` under the root program (DOM lib supplies Request/Response types).

### Task 2 — minimal Vercel config (commit 934853f)

- `vercel.json`: exactly `{"buildCommand":"npm run build","outputDirectory":"dist"}` — verified by gate (`Object.keys(v).length===2`).
- `.gitignore`: `.vercel/` appended with comment (CLI project-link state, never committable).
- `package.json`: `"deploy:vercel": "npx --yes vercel@latest deploy --prod --yes"` — the ONLY package.json change (deps untouched, verified via 1-line diff stat).

### Task 3 — full honest gate sweep + untouched-files proof

| Gate | Result |
|------|--------|
| `npm run build` | ✅ exit 0 — tsc + vite build; `dist/index.html` exists |
| `npm run lint` | ⚠️ exit 1 — 3 PRE-EXISTING errors in `src/portability/zipSlip.ts` only (see Deviations); this task's files lint clean in isolation (`npx eslint api/ingest.ts tests/.../vercel-ingest-endpoint.spec.ts` → exit 0) |
| `npm run lint:no-danger` | ✅ exit 0 — 0 dangerouslySetInnerHTML usages across src/server/functions |
| `npm run test:unit -- --run` | ✅ exit 0 — **1248 passed / 0 failed / 13 skipped** (87 files passed, 2 skipped; the 13 skips are the documented intentional set) across both vitest projects incl. the new spec |
| Untouched-files proof | ✅ `git diff --name-status c893b19 HEAD` = exactly the 5 intended files (`.gitignore` M, `api/ingest.ts` A, `package.json` M, spec A, `vercel.json` A); `git diff c893b19 HEAD -- functions wrangler.toml server src index.html` = EMPTY — locked decision 3 holds |

## Deviations from Plan

**1. [Scope boundary] Pre-existing `npm run lint` failure logged, not fixed**
- **Found during:** Task 3 gate sweep.
- **Issue:** `npm run lint` exits 1 with 3 errors, all in `src/portability/zipSlip.ts` (`no-control-regex` ×2 on intentional `\x1f` guards, `no-useless-escape` ×1 on an escaped `/`). The file is byte-identical to Phase 09-01 (commit 9793d1f) — untouched by this task.
- **Why not auto-fixed:** the task's hard constraint forbids modifying `src/**`, and the executor scope boundary excludes pre-existing failures in unrelated files.
- **Action:** logged to `deferred-items.md` in this task's directory with a 3-line suggested follow-up quick task.
- **Files modified:** none (documentation only).

No other deviations — the plan executed exactly as written.

## Deploy Handoff (USER-RUN — the agent never ran any `vercel` command, per locked decision 4)

Run these in order from the repo root:

1. **Login (interactive browser flow):**
   ```
   npx vercel login
   ```
2. **Deploy production:**
   ```
   npm run deploy:vercel
   ```
   (Expands to `npx --yes vercel@latest deploy --prod --yes`. First run links the project non-interactively with defaults and writes local state to the gitignored `.vercel/`; it runs `npm run build` per vercel.json and auto-serves `api/ingest.ts` at `/api/ingest` on the Node runtime.)
3. **Verify production at the returned URL:**
   - The SPA loads (article list / settings render).
   - Paste an article via the UI ingest — it produces a saved article (full pipeline: safeFetch → Readability/jsdom extraction → DOMPurify sanitize → typed envelope → local save).
   - Contract curl check — malformed JSON must return the typed 400:
     ```
     curl -X POST <deployed-url>/api/ingest -H 'content-type: application/json' -d '{bad json'
     ```
     Expected: HTTP 400, body `{"ok":false,"reason":"server-error"}`.

## Known Limits

- **4.5MB request-body cap (accepted residual T-Q1-02):** Vercel refuses request bodies over 4.5MB with a platform 413 `FUNCTION_PAYLOAD_TOO_LARGE` BEFORE our code (and before our own `MAX_INGEST_BODY_BYTES` ≈ 13.3MB) runs. Binary ingests (PDF/EPUB base64-in-JSON) over ~3.4MB decoded surface this refusal; IngestionClient's catch-all maps it to the same calm server-error copy shown for other transport failures. The blob-upload bypass (Vercel KB "bypass body size limit") is the documented future path — out of scope for this minimal deploy.
- **Cloudflare artifacts remain in-repo** (`functions/**`, `wrangler.toml`) as documented spike/adapter evidence per locked decision 3; the `wrangler pages dev` webServer entry in playwright.config.ts is harmless (spike regression spec skips when workerd is unreachable).

## Self-Check: PASSED

- Files exist: `api/ingest.ts`, `tests/unit/server/vercel-ingest-endpoint.spec.ts`, `vercel.json` — FOUND; `.gitignore`/`package.json` modified as intended.
- Commits exist: `cf2a6a3` (feat), `934853f` (chore) — FOUND on `main`.
