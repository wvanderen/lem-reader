// SPIKE SPEC — Phase 7 Wave 1 (07-01 Task 2). The jsdom-on-Workers spike.
//
// This spec is a one-time empirical investigation, NOT a feature test. It runs
// the spike harness at functions/api/spike.ts against the REAL workerd runtime
// (booted by `npx wrangler pages dev --port 8788`) and RECORDS the outcome. If
// workerd is not running, the suite SKIPS gracefully so `npm run test:unit`
// stays green in CI (the spike outcome is permanently captured in
// 07-01-SUMMARY.md §Spike Outcome; this spec is the regression lock).
//
// ── SPIKE OUTCOME (recorded 2026-08-11) ──────────────────────────────────
// jsdom-primary:        REJECTED — ReferenceError: MessagePort is not defined
//                        (workerd lacks MessagePort; jsdom cannot construct)
// DOMPurify (jsdom):    REJECTED — cascades from jsdom (Cannot read 'bind')
// Readability (jsdom):  REJECTED — cascades from jsdom (no document)
// ip-address:           PASS     — Address4.isInSubnet works on workerd
// A1 cf.resolveOverride: PASS    — Workers fetch() accepts the cf option
// linkedom parseHTML:   PASS     — constructs a document; querySelector works
// linkedom-DOMPurify:   REJECTED — DOMPurify no-ops (isSupported undefined,
//                        sanitize returns input unchanged with script/onerror
//                        intact) → the mXSS gate FAILS on linkedom
// ── VERDICT: HYBRID CONTINGENCY (RESEARCH.md §Spike L482) ────────────────
// Both jsdom AND linkedom fail the mXSS gate on Workers. Extraction+sanitize
// must run in a Node-runtime function; Workers handles ONLY SSRF-safe fetch.
// ip-address (PASS) + cf.resolveOverride (PASS) confirm the Workers-side SSRF
// guard IS viable — only the extraction layer shifts to Node.
// ── A3 (vite-plugin webServer preservation): PASS under Option A ─────────
// @cloudflare/vite-plugin in vite.config.ts plugins[] preserved the v1.0
// Playwright webServer flow (open-every-fixture.spec.ts 8/8 chromium green).
import { describe, expect, test, beforeAll } from "vitest";

const SPIKE_URL = "http://localhost:8788/api/spike";
const BOOT_HINT =
  "workerd not running — start it with: npx wrangler pages dev --port 8788";

type Capability = { ok: boolean; error?: string; detail?: unknown };
type SpikeResponse = {
  runtime: string;
  capabilities: {
    jsdomImport: Capability;
    jsdomConstruct: Capability;
    dompurify: Capability;
    readability: Capability;
    ipAddress: Capability;
  };
  linkedom: {
    linkedomImport: Capability;
    linkedomParse: Capability;
    linkedomDompurify: Capability;
  };
  a1ResolveOverride: Capability;
};

let spike: SpikeResponse | null = null;
let workerdReachable = false;

beforeAll(async () => {
  try {
    const res = await fetch(SPIKE_URL, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      spike = (await res.json()) as SpikeResponse;
      workerdReachable = true;
    }
  } catch {
    /* workerd not running — tests will skip */
  }
}, 30_000);

describe("jsdom-on-Workers spike — RECORDED OUTCOME", () => {
  // `skipIfWorkerdDown` uses the Vitest task context (ctx.skip) to skip the
  // current test when workerd isn't reachable — Vitest's bare `test.skip()`
  // registers a NEW test rather than skipping the running one, so the context
  // form is mandatory here.
  function skipIfWorkerdDown(ctx: { skip: (reason?: string) => void }) {
    if (!workerdReachable || !spike) ctx.skip(BOOT_HINT);
  }

  test("workerd spike harness is reachable", (ctx) => {
    skipIfWorkerdDown(ctx);
    expect(spike!.runtime).toContain("workerd");
  });

  // The structural PASSes — these are the Workers-viable pieces (the SSRF
  // guard + ip-address + DNS pinning option acceptance survive on workerd).
  test("ip-address Address4.isInSubnet works on workerd", (ctx) => {
    skipIfWorkerdDown(ctx);
    expect(spike!.capabilities.ipAddress.ok).toBe(true);
  });

  test("A1: cf.resolveOverride accepted by Workers fetch()", (ctx) => {
    skipIfWorkerdDown(ctx);
    expect(spike!.a1ResolveOverride.ok).toBe(true);
  });

  test("linkedom parseHTML constructs a usable document on workerd", (ctx) => {
    skipIfWorkerdDown(ctx);
    expect(spike!.linkedom.linkedomImport.ok).toBe(true);
    expect(spike!.linkedom.linkedomParse.ok).toBe(true);
  });

  // The RECORDED FAILures — locked in as regression checks. If workerd later
  // supports jsdom (or DOMPurify-on-linkedom stops no-op'ing), these tests
  // FAIL, flagging that the architecture can revisit Worker-local extraction.
  test("RECORDED: jsdom-primary REJECTED on workerd (MessagePort)", (ctx) => {
    skipIfWorkerdDown(ctx);
    // Regression lock on the spike finding. When this starts failing, the
    // jsdom-primary path is viable again and 07-04 can revisit.
    expect(spike!.capabilities.jsdomImport.ok).toBe(false);
    expect(String(spike!.capabilities.jsdomImport.error)).toMatch(/MessagePort/);
  });

  test("RECORDED: linkedom-DOMPurify REJECTED (no-op sanitizer, mXSS gate FAIL)", (ctx) => {
    skipIfWorkerdDown(ctx);
    // Regression lock on the mXSS-gate failure. DOMPurify bound to linkedom
    // returns input UNCHANGED (script/onerror/onload/javascript: all survive).
    // When this starts failing, linkedom-DOMPurify is viable and 07-04 can
    // revisit Worker-local sanitize.
    expect(spike!.linkedom.linkedomDompurify.ok).toBe(false);
    const detail = spike!.linkedom.linkedomDompurify.detail as {
      hasScript?: boolean;
      isSupported?: boolean;
    } | undefined;
    // The no-op signature: sanitize returns input with script intact AND
    // isSupported is undefined (DOMPurify bound but degraded).
    expect(detail?.hasScript).toBe(true);
    expect(detail?.isSupported).toBeUndefined();
  });

  test("RECORDED: spike verdict is HYBRID CONTINGENCY (extraction on Node)", (ctx) => {
    skipIfWorkerdDown(ctx);
    // The composite verdict: jsdom fails AND linkedom-DOMPurify fails AND
    // ip-address works AND cf.resolveOverride accepted. This combination is
    // exactly the hybrid-contingency trigger per RESEARCH.md §Spike L482:
    // Workers does SSRF-safe fetch; Node-runtime function does extract+sanitize.
    const jsdomViable = spike!.capabilities.jsdomImport.ok;
    const linkedomViable = spike!.linkedom.linkedomDompurify.ok;
    const ssrfViableOnWorkers =
      spike!.capabilities.ipAddress.ok && spike!.a1ResolveOverride.ok;
    // Document the trigger condition (do NOT assert the verdict itself, which
    // is a planner decision — just confirm the factual inputs that drive it).
    expect(jsdomViable).toBe(false);
    expect(linkedomViable).toBe(false);
    expect(ssrfViableOnWorkers).toBe(true);
  });
});

describe("A3: @cloudflare/vite-plugin preserves v1.0 SPA dev flow", () => {
  // A3 was verified manually in 07-01 by booting vite WITH cloudflare() in
  // plugins[] and running the v1.0 smoke (open-every-fixture.spec.ts 8/8
  // chromium green). Option A (the cloudflare plugin) was the chosen
  // vite.config.ts shape at the time.
  //
  // 07-07 Rule 3 blocker follow-up: the cloudflare() plugin was REMOVED from
  // vite.config.ts because bundling /functions/* (and their transitive undici
  // dependency) into workerd crashes the Vite dev server with the same
  // `ReferenceError: MessagePort is not defined` the 07-01 spike documented
  // for jsdom-on-workers. The Vite Node middleware (viteIngestMiddleware,
  // 07-06) serves /api/ingest natively in Node; workerd is no longer needed
  // for Phase 7 dev/e2e. The HYBRID CONTINGENCY verdict (the spike's job-one
  // deliverable) is preserved; only the dev-server plugin choice changed.
  //
  // This test now locks in the OPPOSITE invariant: the cloudflare() plugin
  // is NOT in vite.config.ts (its presence would crash the dev server).
  test("vite.config.ts does NOT use @cloudflare/vite-plugin (07-07 Rule 3 removal)", async () => {
    const cfg = await import("node:fs/promises").then((fs) =>
      fs.readFile("./vite.config.ts", "utf-8"),
    );
    // The cloudflare plugin import must be absent (the actual import line,
    // not prose mentions in comments).
    expect(cfg).not.toMatch(
      /^\s*import\s+\{[^}]*\bcloudflare\b[^}]*\}\s+from\s+["']@cloudflare\/vite-plugin["']/m,
    );
    expect(cfg).not.toMatch(/^\s*cloudflare\(\),?\s*$/m);
    // The Vite Node middleware (the Phase 7 /api/ingest runtime per the
    // 07-06 HYBRID CONTINGENCY adaptation) MUST be present as an actual
    // import + plugin install.
    expect(cfg).toMatch(/from\s+["']\.\/dev-server\/ingest-middleware["']/);
    expect(cfg).toMatch(/configureServer:\s*viteIngestMiddleware\(\)/);
  });
});
