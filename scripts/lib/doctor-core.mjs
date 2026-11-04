// scripts/lib/doctor-core.mjs
// The doctor's reporting contract (issue #253). Launch-blocked engines are
// distinguished from application/test failures — a browser that cannot start
// is an ENVIRONMENT blockage with a named fix, never a silent skip and never
// a test verdict. Partial engine success can never be reported as complete
// verification: aggregateLane() decides completeness and the exit code, and
// it requires every requested engine ready. Pure logic; the live probes live
// in scripts/doctor.mjs (host) and scripts/container-browser-probe.mjs
// (container), which both feed results through these functions.

/**
 * Classify a Playwright launch failure into a kind + actionable fix.
 * @param {string} message
 * @returns {{kind: "not-installed"|"launch-blocked", reason: string, fix: string}}
 */
export function classifyBrowserFailure(message) {
  const text = String(message ?? "");

  if (
    /Executable doesn't exist|looks like Playwright was just installed|please run.*playwright install/i.test(
      text,
    )
  ) {
    return {
      kind: "not-installed",
      reason: "browser binary not installed for this Playwright version",
      fix: "npx playwright install <browser>  (host lane; see docs/setup.md)",
    };
  }

  if (
    /error while loading shared libraries|cannot open shared object file|Host system is missing dependencies|missing dependencies/i.test(
      text,
    )
  ) {
    return {
      kind: "launch-blocked",
      reason: "host is missing OS system libraries for this engine",
      fix: "run this engine through the container lane: npm run test:e2e:container -- <spec> --project=<engine>  (docs/setup.md); do not transplant system libraries or set LD_LIBRARY_PATH",
    };
  }

  if (/timeout.*exceeded/i.test(text)) {
    return {
      kind: "launch-blocked",
      reason: "browser launch timed out (possible sandbox, profile, or resource contention issue)",
      fix: "check machine load, then docs/setup.md recovery table; if it persists, run the engine through the container lane",
    };
  }

  // Anything else that fails at LAUNCH time is still an environment blockage —
  // it happened before any test ran, so it is never an application/test
  // failure. Report it as launch-blocked with the raw first line as reason.
  const firstLine =
    text.split("\n").find((line) => line.trim().length > 0) ?? "unknown launch failure";
  return {
    kind: "launch-blocked",
    reason: `browser exited during launch: ${firstLine.slice(0, 160)}`,
    fix: "see docs/setup.md recovery table; if it persists, run the engine through the container lane",
  };
}

/**
 * Aggregate one lane's probe results into the doctor's verdict.
 * @param {string} lane "host" | "container"
 * @param {Array<{engine: string, ok: boolean, kind?: string, reason?: string, fix?: string}>} results
 * @returns {{lane: string, complete: boolean, exitCode: number, ready: string[], blocked: Array, summary: string}}
 */
export function aggregateLane(lane, results) {
  const ready = [];
  const blocked = [];
  for (const result of results) {
    if (result.ok) {
      ready.push(result.engine);
    } else {
      blocked.push({
        engine: result.engine,
        kind: result.kind ?? "launch-blocked",
        reason: result.reason ?? "unavailable",
        fix: result.fix ?? "see docs/setup.md",
      });
    }
  }
  const complete = results.length > 0 && blocked.length === 0;
  const parts = [];
  parts.push(`lane ${lane}: ${complete ? "verification-ready" : "NOT complete"}`);
  if (ready.length > 0) parts.push(`ready: ${ready.join(", ")}`);
  for (const b of blocked) parts.push(`blocked: ${b.engine} — ${b.kind} (${b.reason})`);
  return {
    lane,
    complete,
    exitCode: complete ? 0 : 1,
    ready,
    blocked,
    summary: parts.join("; "),
  };
}
