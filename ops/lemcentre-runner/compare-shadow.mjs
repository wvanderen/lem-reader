#!/usr/bin/env node
// ops/lemcentre-runner/compare-shadow.mjs — the same-revision shadow-lane
// comparison tool (issue #281; contract:
// docs/specs/lemcentre-linux-shadow.md, migration sequence step 3).
//
// The Mac (`lem-reference`) stays the AUTHORITATIVE e2e-reference producer
// while the Lemcentre browser guest runs the same PR browser suite under
// the distinct, temporary, NON-AUTHORITATIVE check name `e2e-linux-shadow`.
// Shadow validation compares the two producers ON IDENTICAL CANDIDATE
// REVISIONS, and this script is that comparison:
//
//   node ops/lemcentre-runner/compare-shadow.mjs --sha <full-or-short-sha> \
//        [--repo wvanderen/lem-reader] [--json <path>]
//
// Read-only: only `gh api` GET requests are issued (check runs for the SHA;
// workflow-run artifacts; artifact archive downloads). Per-engine outcomes
// come from the JSON report each lane uploads — summarize-e2e.mjs stays the
// ONE report reader (issue #254; this tool imports its summarizeReport).
// Where an artifact is no longer reachable (retention is 7 days), the table
// says so honestly and the verdict rests on the check-run conclusions.
//
// Verdict vocabulary (frozen by the shadow spec):
//   match            exit 0 — same suite verdict on both producers and,
//                     where both reports are reachable, the same per-engine
//                     unexpected outcome sets
//   diverge          exit 1 — conclusions disagree, or a reachable engine
//                     fails on one side only / is absent from one report
//   missing-producer exit 2 — a producer's check run is absent for the SHA,
//                     or exists but has not concluded a comparable suite
//                     verdict (pending/cancelled): comparison unavailable,
//                     never guessed
//
// Flaky-count differences are reported as notes, never divergence: a flaky
// case eventually passed — retry evidence, not a verdict difference.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { unzipSync } from "fflate";
import { summarizeReport } from "../../scripts/summarize-e2e.mjs";

/** The two producers this tool compares (check name + report artifact). */
export const MAC_PRODUCER = {
  id: "mac",
  check: "e2e-reference",
  workflow: "ci.yml job e2e-reference on [self-hosted, macOS, reference]",
  artifact: "playwright-artifacts-reference",
  member: ".test-reports/functional.json",
};

export const SHADOW_PRODUCER = {
  id: "shadow",
  check: "e2e-linux-shadow",
  workflow: "e2e-linux-shadow.yml on [self-hosted, lemcentre]",
  artifact: "e2e-linux-shadow-report",
  member: ".guest-reports/e2e-pr.json",
};

/** Pick the check run for `name` with the LATEST started_at (a reattempt
 * supersedes its earlier attempt); null when no run carries that name. */
export function pickCheckRun(payload, name) {
  const runs = (payload?.check_runs ?? []).filter((run) => run?.name === name);
  if (runs.length === 0) return null;
  return runs.reduce((latest, run) =>
    String(run.started_at ?? "") > String(latest.started_at ?? "") ? run : latest,
  );
}

/** Extract the workflow run id from a check run's details_url; null when
 * the shape is not parseable (never guessed). */
export function parseRunId(detailsUrl) {
  if (typeof detailsUrl !== "string") return null;
  const match = detailsUrl.match(/\/actions\/runs\/(\d+)\/job\//);
  return match ? Number(match[1]) : null;
}

/** Read the PR-suite JSON report out of a downloaded artifact zip using the
 * producer's configured member name, with a basename fallback that must be
 * UNIQUE (an ambiguous fallback is a refusal, not a guess). */
export function readArtifactReport(zipBytes, producer) {
  const entries = unzipSync(new Uint8Array(zipBytes));
  const names = Object.keys(entries);
  let member = producer.member;
  if (!names.includes(member)) {
    const base = basename(producer.member);
    const matches = names.filter((name) => basename(name) === base);
    if (matches.length === 1) member = matches[0];
    else if (matches.length > 1)
      throw new Error(
        `${producer.check}: ambiguous report member fallback for ${base} (${matches.join(", ")})`,
      );
    else
      throw new Error(
        `${producer.check}: no report member ${producer.member} in artifact ${producer.artifact}`,
      );
  }
  const text = Buffer.from(entries[member]).toString("utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${producer.check}: report member ${member} is not JSON: ${error.message}`);
  }
}

/** Align per-engine outcome rows across the two producers' summaries.
 * `agree` is false when an engine's unexpected counts differ or the engine
 * is absent from one report while present in the other. */
export function engineRows(macSummary, shadowSummary) {
  const byProject = (summary) =>
    new Map((summary?.engines ?? []).map((engine) => [engine.project, engine]));
  const mac = byProject(macSummary);
  const shadow = byProject(shadowSummary);
  const projects = [...new Set([...mac.keys(), ...shadow.keys()])].sort();
  return projects.map((project) => {
    const m = mac.get(project) ?? null;
    const s = shadow.get(project) ?? null;
    const agree = m !== null && s !== null && m.unexpected === s.unexpected;
    return { project, mac: m, shadow: s, agree };
  });
}

/** The suite-verdict classification used for comparison: success/failure
 * are comparable; cancelled, timed_out, skipped, null and in-progress runs
 * have NO comparable suite verdict (the run never spoke about the code). */
function comparableVerdict(checkRun) {
  if (!checkRun) return { kind: "absent" };
  if (checkRun.status !== "completed")
    return { kind: "no-verdict", why: `status ${checkRun.status}` };
  if (checkRun.conclusion === "success" || checkRun.conclusion === "failure")
    return { kind: checkRun.conclusion };
  return { kind: "no-verdict", why: `conclusion ${String(checkRun.conclusion)}` };
}

/**
 * The pure comparison: check runs for both producers (already picked) plus
 * each side's JSON report where it was reachable (or a named error when
 * not). Returns {verdict, exitCode, reasons, engines, producers}.
 */
export function compareProducers({
  mac,
  shadow,
  macReport,
  shadowReport,
  macReportError,
  shadowReportError,
}) {
  const reasons = [];
  const producers = [
    { producer: MAC_PRODUCER, run: mac, verdict: comparableVerdict(mac) },
    { producer: SHADOW_PRODUCER, run: shadow, verdict: comparableVerdict(shadow) },
  ];

  for (const { producer, run, verdict } of producers) {
    if (verdict.kind === "absent") {
      reasons.push(
        `${producer.check}: no check run for this SHA (producer missing — the lane has not run on this revision)`,
      );
    } else if (verdict.kind === "no-verdict") {
      reasons.push(`${producer.check}: no comparable suite verdict (${verdict.why})`);
    }
  }
  if (reasons.length > 0) {
    return { verdict: "missing-producer", exitCode: 2, reasons, engines: [], producers };
  }

  const macKind = comparableVerdict(mac).kind;
  const shadowKind = comparableVerdict(shadow).kind;
  const conclusionsAgree = macKind === shadowKind;
  if (!conclusionsAgree) {
    reasons.push(
      `check conclusions disagree: ${MAC_PRODUCER.check} ${macKind} vs ${SHADOW_PRODUCER.check} ${shadowKind}`,
    );
  }

  const engines = [];
  if (macReport !== undefined && shadowReport !== undefined) {
    // Both reports reachable: the per-engine table is computed even when
    // the conclusions already disagree — it names WHICH engine diverged,
    // which is exactly what a shadow investigation needs.
    const rows = engineRows(summarizeReport(macReport), summarizeReport(shadowReport));
    engines.push(...rows);
    for (const row of rows) {
      if (!row.agree) {
        const detail =
          row.mac === null || row.shadow === null
            ? `engine ${row.project} absent from ${row.mac === null ? MAC_PRODUCER.check : SHADOW_PRODUCER.check}'s report`
            : `engine ${row.project} unexpected: ${row.mac.unexpected} (${MAC_PRODUCER.check}) vs ${row.shadow.unexpected} (${SHADOW_PRODUCER.check})`;
        reasons.push(detail);
      }
    }
    for (const row of rows) {
      if (row.mac?.flaky !== row.shadow?.flaky) {
        reasons.push(
          `note: engine ${row.project} flaky ${row.mac?.flaky ?? "?"} (${MAC_PRODUCER.check}) vs ${row.shadow?.flaky ?? "?"} (${SHADOW_PRODUCER.check}) — retry evidence, not a verdict difference`,
        );
      }
    }
  } else if (macReport !== undefined || shadowReport !== undefined) {
    const unreachable =
      macReport === undefined
        ? `${MAC_PRODUCER.check} report unreachable (${macReportError ?? "unknown"})`
        : `${SHADOW_PRODUCER.check} report unreachable (${shadowReportError ?? "unknown"})`;
    reasons.push(
      `per-engine comparison unavailable: ${unreachable} — verdict rests on the check conclusions (${macKind})`,
    );
  } else {
    reasons.push(
      `per-engine reports unreachable (${MAC_PRODUCER.check}: ${macReportError ?? "not fetched"}; ${SHADOW_PRODUCER.check}: ${shadowReportError ?? "not fetched"}) — verdict rests on the check conclusions (${macKind})`,
    );
  }

  if (!conclusionsAgree || engines.some((row) => !row.agree)) {
    return { verdict: "diverge", exitCode: 1, reasons, engines, producers };
  }

  return { verdict: "match", exitCode: 0, reasons, engines, producers };
}

function formatEngineCount(engine) {
  if (!engine) return "absent";
  return `${engine.expected}✓ / ${engine.unexpected}✗ / ${engine.flaky}flake / ${engine.skipped}skip`;
}

/** Human rendering: producer lines, the per-engine table, reasons, verdict. */
export function renderComparison({ sha, verdict, exitCode, reasons, engines, producers }) {
  const lines = [];
  lines.push(`Shadow comparison for ${sha}`);
  for (const { producer, run, verdict: v } of producers) {
    const state =
      v.kind === "absent"
        ? "NO CHECK RUN"
        : v.kind === "no-verdict"
          ? `no comparable verdict (${v.why})`
          : v.kind;
    lines.push(`  ${producer.check} (${producer.workflow}): ${state}`);
  }
  if (engines.length) {
    lines.push("");
    lines.push("| engine | e2e-reference (Mac) | e2e-linux-shadow (guest) | agree |");
    lines.push("| --- | --- | --- | --- |");
    for (const row of engines) {
      lines.push(
        `| ${row.project} | ${formatEngineCount(row.mac)} | ${formatEngineCount(row.shadow)} | ${row.agree ? "yes" : "NO"} |`,
      );
    }
  }
  if (reasons.length) {
    lines.push("");
    for (const reason of reasons) lines.push(`- ${reason}`);
  }
  lines.push("");
  lines.push(`verdict: ${verdict} (exit ${exitCode})`);
  lines.push("The Mac's e2e-reference stays authoritative; this comparison never gates a merge.");
  return lines.join("\n");
}

// ---------------------------------------------------------------- CLI ------

function usage(exitCode) {
  console.log(`usage: compare-shadow.mjs --sha <sha> [--repo SLUG] [--json PATH]

  --sha SHA       the candidate revision both producers ran (required)
  --repo SLUG     repository (default wvanderen/lem-reader)
  --json PATH     also write the full comparison as JSON

Read-only: only gh api GET requests are issued. Exit codes: 0 match ·
1 diverge · 2 missing producer / no comparable verdict.`);
  process.exit(exitCode);
}

function ghApiJson(repo, path) {
  const result = spawnSync("gh", ["api", `repos/${repo}/${path}`], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `gh api ${path} failed (${result.status}): ${result.stderr?.trim() || "no stderr"}`,
    );
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`gh api ${path} returned unparseable output: ${error.message}`);
  }
}

function ghApiBinary(absoluteUrl) {
  const result = spawnSync("gh", ["api", absoluteUrl], {
    encoding: null,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const stderr = result.stderr ? Buffer.from(result.stderr).toString("utf8") : "no stderr";
    throw new Error(`gh api artifact download failed (${result.status}): ${stderr.trim()}`);
  }
  return result.stdout;
}

/** Fetch the producer's uploaded JSON report for a run, or return
 * {error} naming why it was unreachable — never throws past this seam. */
function fetchReport(repo, producer, checkRun) {
  const runId = parseRunId(checkRun.details_url);
  if (runId === null)
    return {
      error: `cannot derive workflow run id from details_url ${String(checkRun.details_url)}`,
    };
  let artifacts;
  try {
    artifacts = ghApiJson(repo, `actions/runs/${runId}/artifacts`);
  } catch (error) {
    return { error: error.message };
  }
  const artifact = (artifacts.artifacts ?? []).find((entry) => entry?.name === producer.artifact);
  if (!artifact) return { error: `artifact ${producer.artifact} not present on run ${runId}` };
  if (artifact.expired) return { error: `artifact ${producer.artifact} expired (7-day retention)` };
  try {
    return { report: readArtifactReport(ghApiBinary(artifact.archive_download_url), producer) };
  } catch (error) {
    return { error: error.message };
  }
}

export function main(argv = process.argv.slice(2)) {
  let repo = "wvanderen/lem-reader";
  let sha = null;
  let jsonPath = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--sha") sha = argv[(i += 1)];
    else if (arg === "--repo") repo = argv[(i += 1)];
    else if (arg === "--json") jsonPath = argv[(i += 1)];
    else if (arg === "--help" || arg === "-h") usage(0);
    else {
      console.error(`unknown argument: ${arg}`);
      usage(2);
    }
  }
  if (!sha) usage(2);

  let checkRuns;
  try {
    checkRuns = ghApiJson(repo, `commits/${sha}/check-runs`);
  } catch (error) {
    console.error(`✗ cannot read check runs for ${sha}: ${error.message}`);
    console.error(
      "  (read-only comparison failed — treat the comparison as UNAVAILABLE, never as matching)",
    );
    return 2;
  }

  const mac = pickCheckRun(checkRuns, MAC_PRODUCER.check);
  const shadow = pickCheckRun(checkRuns, SHADOW_PRODUCER.check);
  // Reports are fetched only when both producers concluded a comparable
  // suite verdict — artifact downloads are otherwise wasted work on the
  // missing-producer path.
  const comparable = (run) =>
    run !== null && run.status === "completed" && ["success", "failure"].includes(run.conclusion);
  const bothComparable = comparable(mac) && comparable(shadow);
  const macFetch = bothComparable ? fetchReport(repo, MAC_PRODUCER, mac) : {};
  const shadowFetch = bothComparable ? fetchReport(repo, SHADOW_PRODUCER, shadow) : {};

  const comparison = compareProducers({
    mac,
    shadow,
    macReport: macFetch.report,
    shadowReport: shadowFetch.report,
    macReportError: macFetch.error,
    shadowReportError: shadowFetch.error,
  });

  console.log(renderComparison({ sha, ...comparison }));
  if (jsonPath) {
    const entry = { when: new Date().toISOString(), repo, sha, ...comparison };
    mkdirSync(dirname(resolve(jsonPath)), { recursive: true });
    writeFileSync(jsonPath, `${JSON.stringify(entry, null, 2)}\n`);
    console.log(`comparison written: ${jsonPath}`);
  }
  return comparison.exitCode;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
