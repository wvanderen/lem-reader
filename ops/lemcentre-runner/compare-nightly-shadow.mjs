#!/usr/bin/env node
// ops/lemcentre-runner/compare-nightly-shadow.mjs — the nightly-chain
// producer comparison tool (issue #282; lane contract:
// docs/specs/lemcentre-nightly-linux.md).
//
// The Mac (`lem-reference`) stays the AUTHORITATIVE nightly evidence
// producer (evidence.yml on the `nightly` ref: the exhaustive-reference
// job + the hosted e2e matrix) while the Lemcentre nightly-linux-shadow
// lane runs the nightly-equivalent phases inside the pinned browser guest
// on the SAME nightly-ref SHA. This tool compares the two nightly chains
// for one revision:
//
//   node ops/lemcentre-runner/compare-nightly-shadow.mjs --sha <sha> \
//        [--repo wvanderen/lem-reader] [--json <path>]
//
// Read-only: only `gh api` GET requests are issued (check runs for the
// SHA; workflow-run artifacts; artifact archive downloads), exactly like
// compare-shadow.mjs (#281), whose machinery this reuses (pickCheckRun,
// parseRunId, readArtifactReport, ghApiJson/ghApiBinary, and the
// comparableVerdict classification — the single definitions live there).
// Per-engine outcomes come from the
// JSON reports both chains upload — summarize-e2e.mjs stays the ONE
// report reader (issue #254). Where an artifact is no longer reachable
// (retention is 7 days), the table says so honestly and the verdict
// rests on the check-run conclusions.
//
// Verdict vocabulary (frozen by docs/specs/lemcentre-nightly-linux.md,
// mirroring #281's shadow vocabulary):
//   match            exit 0 — both nightly chains spoke, conclusions agree,
//                     and every comparable per-engine / per-measurement
//                     verdict agrees
//   diverge          exit 1 — conclusions disagree, or a comparable engine
//                     or measurement verdict differs
//   missing-producer exit 2 — a producer's check run is absent for the SHA
//                     or has no comparable verdict; comparison unavailable,
//                     never guessed
//
// Contentions-invalidated measurement phases (the lane-annotated
// verdicts/phases-contention.json member's contentionInvalid flags, set
// by the lane from record-contention.mjs's verdict; the guest's own
// verdicts/phases.json is uploaded byte-faithful beside it)
// are infrastructure failures, not product divergence: they are reported
// as not-comparable notes and the verdict rests on the comparable
// surface, exactly like unreachable report artifacts. Flaky-count
// differences are notes, never divergence: a flaky case eventually
// passed — retry evidence, not a verdict difference.
//
// Honest limit, recorded rather than hidden: the Mac's exhaustive job
// speaks with ONE conclusion for its functional + calibration + perf
// phases (evidence.yml does not report per-phase conclusions), so the
// Mac side of a measurement row is that job's conclusion; the Linux side
// is the lane's per-phase exit. A Mac failure therefore shows as a
// measurement-row disagreement, which at chain level it is.

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { unzipSync } from "fflate";
import {
  comparableVerdict,
  ghApiBinary,
  ghApiJson,
  parseRunId,
  pickCheckRun,
  readArtifactReport,
} from "./compare-shadow.mjs";
// The gh-api seam and the verdict classification live ONCE, in
// compare-shadow.mjs (the #281 tool) — every comparison tool shares them.
import { summarizeReport } from "../../scripts/summarize-e2e.mjs";

/** The engines both nightly chains must speak for (the frozen set). */
export const NIGHTLY_ENGINES = ["chromium", "firefox", "webkit"];

/** The measurement phases the nightly chains run after the functional
 * phase (calibrate then perf; the contention-invalidating set). */
export const MEASUREMENT_PHASES = ["calibration", "performance"];

/** The Mac side of the nightly chain (evidence.yml on the nightly ref):
 * the exhaustive-reference job (which also runs calibrate + perf) plus
 * the hosted three-engine matrix. */
export const MAC_NIGHTLY_PRODUCERS = {
  exhaustive: {
    id: "mac-exhaustive",
    check: "exhaustive-reference",
    workflow: "evidence.yml job exhaustive-reference on [self-hosted, macOS, reference]",
    artifact: "exhaustive-artifacts-reference",
    member: ".test-reports/functional.json",
  },
  matrixPrefix: "e2e (",
};

/** The Linux side: the nightly-equivalent lane and the artifact members
 * it uploads through the verified evidence bundle. */
export const LINUX_NIGHTLY_PRODUCER = {
  id: "linux-nightly",
  check: "nightly-linux-shadow",
  workflow: "nightly-linux-shadow.yml on [self-hosted, lemcentre]",
  artifact: "nightly-linux-shadow-reports",
  engineMember(engine) {
    return `reports/e2e-exhaustive-${engine}.json`;
  },
  // the lane-annotated copy (contention flags); NOT the guest's own
  // verdicts/phases.json, which the lane uploads byte-faithful for
  // direct inspection — the annotation never rewrites guest output
  phasesMember: "verdicts/phases-contention.json",
};

/** Pick every nightly producer's check run (latest attempt each):
 * the Mac exhaustive job, the Mac matrix per engine, and the Linux lane. */
export function pickNightlyProducers(payload) {
  const matrix = {};
  for (const engine of NIGHTLY_ENGINES) {
    matrix[engine] = pickCheckRun(payload, `${MAC_NIGHTLY_PRODUCERS.matrixPrefix}${engine})`);
  }
  return {
    mac: {
      exhaustive: pickCheckRun(payload, MAC_NIGHTLY_PRODUCERS.exhaustive.check),
      matrix,
    },
    linux: pickCheckRun(payload, LINUX_NIGHTLY_PRODUCER.check),
  };
}

/** Validate the lane's machine-readable phase verdicts
 * (verdicts/phases-contention.json, the lane-annotated copy): every phase
 * needs {phase, exit}; unknown extra
 * keys (engines maps, contentionInvalid flags) pass through untouched. */
export function parsePhaseVerdicts(payload) {
  if (typeof payload !== "object" || payload === null || !Array.isArray(payload.phases)) {
    throw new Error("phases payload shape: expected {schemaVersion, phases: [...]}");
  }
  for (const phase of payload.phases) {
    if (
      typeof phase !== "object" ||
      phase === null ||
      typeof phase.phase !== "string" ||
      typeof phase.exit !== "number" ||
      !Number.isFinite(phase.exit)
    ) {
      throw new Error(
        `phase verdict shape (every phase needs {phase, exit}): ${JSON.stringify(phase)?.slice(0, 120)}`,
      );
    }
  }
  return { schemaVersion: payload.schemaVersion ?? 1, phases: payload.phases };
}

/** Read the Linux lane's uploaded evidence members out of its artifact
 * zip: one JSON report per engine plus the phase verdicts. Never throws
 * past this seam — a missing or malformed member is a named error, and
 * the comparison rests on what remains reachable. */
export function readShadowEvidence(zipBytes) {
  const entries = unzipSync(new Uint8Array(zipBytes));
  const reports = {};
  const reportErrors = {};
  for (const engine of NIGHTLY_ENGINES) {
    const member = LINUX_NIGHTLY_PRODUCER.engineMember(engine);
    if (!entries[member]) {
      reports[engine] = undefined;
      reportErrors[engine] =
        `no report member ${member} in artifact ${LINUX_NIGHTLY_PRODUCER.artifact}`;
      continue;
    }
    try {
      reports[engine] = JSON.parse(Buffer.from(entries[member]).toString("utf8"));
    } catch (error) {
      reports[engine] = undefined;
      reportErrors[engine] = `report member ${member} is not JSON: ${error.message}`;
    }
  }
  let phases;
  let phasesError;
  const phasesMember = LINUX_NIGHTLY_PRODUCER.phasesMember;
  if (!entries[phasesMember]) {
    phasesError = `no phases member ${phasesMember} in artifact ${LINUX_NIGHTLY_PRODUCER.artifact}`;
  } else {
    try {
      phases = parsePhaseVerdicts(JSON.parse(Buffer.from(entries[phasesMember]).toString("utf8")));
    } catch (error) {
      phasesError = error.message;
    }
  }
  return { reports, reportErrors, phases, phasesError };
}

/** The Mac's per-engine unexpected/flaky counts: from the exhaustive
 * artifact's functional.json when reachable, else (a green matrix check
 * means zero unexpected) the matrix conclusion. Null = not comparable. */
function macEngineOutcome(engine, matrixRun, macCounts) {
  if (macCounts) {
    const row = macCounts.get(engine);
    if (!row) return null;
    return { unexpected: row.unexpected, flaky: row.flaky, source: "functional.json" };
  }
  if (comparableVerdict(matrixRun).kind === "success") {
    return { unexpected: 0, flaky: 0, source: "matrix conclusion (success)" };
  }
  return null;
}

/** The Linux lane's per-engine unexpected/flaky counts from its own
 * uploaded report. Null = not comparable. */
function linuxEngineOutcome(engine, evidence) {
  const report = evidence?.reports[engine];
  if (!report) return null;
  const summary = summarizeReport(report);
  const row = (summary.engines ?? []).find((entry) => entry.project === engine);
  const unexpected = row?.unexpected ?? summary.stats?.unexpected;
  if (typeof unexpected !== "number") return null;
  return { unexpected, flaky: row?.flaky ?? 0, source: "e2e-exhaustive report" };
}

/**
 * The pure comparison: every producer's check run (already picked) plus
 * each chain's report evidence where reachable (or a named error when
 * not). Returns {verdict, exitCode, reasons, engines, measurements,
 * producers}. `agree` is null for a not-comparable row — divergence is
 * only ever a positive disagreement between two comparable verdicts.
 */
export function compareNightly({
  macExhaustive,
  macMatrix,
  linux,
  linuxEvidence,
  linuxEvidenceError,
  macReport,
  macReportError,
}) {
  const reasons = [];
  const matrixProducers = NIGHTLY_ENGINES.map((engine) => ({
    producer: {
      check: `${MAC_NIGHTLY_PRODUCERS.matrixPrefix}${engine})`,
      workflow: `evidence.yml job e2e (hosted matrix, ${engine})`,
    },
    run: macMatrix?.[engine] ?? null,
    verdict: comparableVerdict(macMatrix?.[engine] ?? null),
  }));
  const producers = [
    {
      producer: MAC_NIGHTLY_PRODUCERS.exhaustive,
      run: macExhaustive ?? null,
      verdict: comparableVerdict(macExhaustive ?? null),
    },
    ...matrixProducers,
    {
      producer: LINUX_NIGHTLY_PRODUCER,
      run: linux ?? null,
      verdict: comparableVerdict(linux ?? null),
    },
  ];

  for (const { producer, verdict } of producers) {
    if (verdict.kind === "absent") {
      reasons.push(
        `${producer.check}: no check run for this SHA (producer missing — the nightly chain has not run on this revision)`,
      );
    } else if (verdict.kind === "no-verdict") {
      reasons.push(`${producer.check}: no comparable verdict (${verdict.why})`);
    }
  }
  if (reasons.length > 0) {
    return {
      verdict: "missing-producer",
      exitCode: 2,
      reasons,
      engines: [],
      measurements: [],
      producers,
    };
  }

  // Chain conclusions: the Mac nightly chain is green only when its
  // exhaustive job AND its whole hosted matrix are green.
  const macKinds = [
    comparableVerdict(macExhaustive).kind,
    ...NIGHTLY_ENGINES.map((engine) => comparableVerdict(macMatrix[engine]).kind),
  ];
  const macChainKind = macKinds.every((kind) => kind === "success") ? "success" : "failure";
  const linuxKind = comparableVerdict(linux).kind;
  const conclusionsAgree = macChainKind === linuxKind;
  if (!conclusionsAgree) {
    reasons.push(
      `check conclusions disagree: Mac nightly chain ${macChainKind} vs ${LINUX_NIGHTLY_PRODUCER.check} ${linuxKind}`,
    );
  }

  // Per-engine rows (unexpected counts; flaky differences are notes).
  const macCounts =
    macReport !== undefined
      ? new Map((summarizeReport(macReport).engines ?? []).map((row) => [row.project, row]))
      : null;
  if (macReport === undefined) {
    reasons.push(
      `note: Mac per-test counts unreachable (${macReportError ?? "not fetched"}) — per-engine agreement rests on the check conclusions`,
    );
  }
  const engines = NIGHTLY_ENGINES.map((engine) => {
    const mac = macEngineOutcome(engine, macMatrix[engine], macCounts);
    const linuxSide = linuxEngineOutcome(engine, linuxEvidence);
    const agree =
      mac !== null && linuxSide !== null ? mac.unexpected === linuxSide.unexpected : null;
    return { project: engine, mac, linux: linuxSide, agree };
  });
  for (const row of engines) {
    if (row.agree === false) {
      reasons.push(
        `engine ${row.project} unexpected: ${row.mac.unexpected} (Mac) vs ${row.linux.unexpected} (${LINUX_NIGHTLY_PRODUCER.check})`,
      );
    } else if (row.agree === null) {
      const why =
        row.mac === null
          ? "Mac side not comparable"
          : `${LINUX_NIGHTLY_PRODUCER.check} report unreachable (${linuxEvidence?.reportErrors?.[row.project] ?? linuxEvidenceError ?? "not fetched"})`;
      reasons.push(`note: engine ${row.project} — ${why}; rests on the check conclusions`);
    }
    if (row.mac !== null && row.linux !== null && row.mac.flaky !== row.linux.flaky) {
      reasons.push(
        `note: engine ${row.project} flaky ${row.mac.flaky} (Mac) vs ${row.linux.flaky} (${LINUX_NIGHTLY_PRODUCER.check}) — retry evidence, not a verdict difference`,
      );
    }
  }

  // Measurement rows: the Mac's exhaustive job conclusion vs the lane's
  // per-phase exits. Contention-invalidated phases are not comparable.
  const macMeasurementGreen = comparableVerdict(macExhaustive).kind === "success";
  const measurements = [];
  if (linuxEvidence?.phases) {
    for (const phase of MEASUREMENT_PHASES) {
      const recorded = linuxEvidence.phases.phases.find((entry) => entry.phase === phase);
      if (!recorded) {
        reasons.push(
          `note: no recorded ${phase} verdict in ${LINUX_NIGHTLY_PRODUCER.phasesMember} — rests on the check conclusions`,
        );
        continue;
      }
      if (recorded.contentionInvalid) {
        measurements.push({
          phase,
          mac: macMeasurementGreen ? "green" : "red",
          linux: `exit ${recorded.exit} (contention-invalidated)`,
          agree: null,
          contentionInvalid: true,
        });
        reasons.push(
          `note: ${phase} contention-invalidated on ${LINUX_NIGHTLY_PRODUCER.check} (exit ${recorded.exit} under host load over the reviewed threshold) — an infrastructure failure, not comparable, never a product divergence`,
        );
        continue;
      }
      const linuxGreen = recorded.exit === 0;
      const agree = linuxGreen === macMeasurementGreen;
      measurements.push({
        phase,
        mac: macMeasurementGreen ? "green" : "red",
        linux: `exit ${recorded.exit}`,
        agree,
      });
      if (agree === false) {
        reasons.push(
          `measurement phase ${phase}: Mac ${macMeasurementGreen ? "green" : "red"} vs ${LINUX_NIGHTLY_PRODUCER.check} exit ${recorded.exit}`,
        );
      }
    }
  } else {
    reasons.push(
      `per-measurement comparison unavailable: ${LINUX_NIGHTLY_PRODUCER.phasesMember} unreachable (${linuxEvidence?.phasesError ?? linuxEvidenceError ?? "not fetched"}) — rests on the check conclusions`,
    );
  }

  if (
    !conclusionsAgree ||
    engines.some((row) => row.agree === false) ||
    measurements.some((row) => row.agree === false)
  ) {
    return { verdict: "diverge", exitCode: 1, reasons, engines, measurements, producers };
  }
  return { verdict: "match", exitCode: 0, reasons, engines, measurements, producers };
}

function formatEngineCounts(outcome) {
  if (!outcome) return "not comparable";
  return `${outcome.unexpected}✗ / ${outcome.flaky}flake (${outcome.source})`;
}

/** Human rendering: producer lines, the engine and measurement tables,
 * reasons, verdict. */
export function renderNightlyComparison({
  sha,
  verdict,
  exitCode,
  reasons,
  engines,
  measurements,
  producers,
}) {
  const lines = [];
  lines.push(`## nightly comparison for ${sha}`);
  lines.push("");
  for (const { producer, verdict: v } of producers) {
    const state =
      v.kind === "absent"
        ? "NO CHECK RUN"
        : v.kind === "no-verdict"
          ? `no comparable verdict (${v.why})`
          : v.kind;
    lines.push(`- ${producer.check} (${producer.workflow}): ${state}`);
  }
  if (engines.length) {
    lines.push("");
    lines.push("| engine | Mac nightly chain | nightly-linux-shadow (guest) | agree |");
    lines.push("| --- | --- | --- | --- |");
    for (const row of engines) {
      const agree = row.agree === null ? "not comparable" : row.agree ? "yes" : "NO";
      lines.push(
        `| ${row.project} | ${formatEngineCounts(row.mac)} | ${formatEngineCounts(row.linux)} | ${agree} |`,
      );
    }
  }
  if (measurements.length) {
    lines.push("");
    lines.push("| measurement | Mac nightly chain | nightly-linux-shadow (guest) | agree |");
    lines.push("| --- | --- | --- | --- |");
    for (const row of measurements) {
      const agree = row.agree === null ? "not comparable" : row.agree ? "yes" : "NO";
      lines.push(`| ${row.phase} | ${row.mac} | ${row.linux} | ${agree} |`);
    }
  }
  if (reasons.length) {
    lines.push("");
    for (const reason of reasons) lines.push(`- ${reason}`);
  }
  lines.push("");
  lines.push(`verdict: ${verdict} (exit ${exitCode})`);
  lines.push("The Mac nightly chain stays authoritative; this comparison never gates a merge.");
  return lines.join("\n");
}

// ---------------------------------------------------------------- CLI ------

function usage(exitCode) {
  console.log(`usage: compare-nightly-shadow.mjs --sha <sha> [--repo SLUG] [--json PATH]

  --sha SHA       the nightly-ref revision both chains ran (required)
  --repo SLUG     repository (default wvanderen/lem-reader)
  --json PATH     also write the full comparison as JSON

Read-only: only gh api GET requests are issued. Exit codes: 0 match ·
1 diverge · 2 missing producer / no comparable verdict / unavailable.`);
  process.exit(exitCode);
}

/** Find a run's artifact by name; {archive_download_url} or {error}. */
function findArtifact(repo, producer, checkRun) {
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
  return { artifact };
}

/** Fetch the Mac exhaustive job's functional.json report, or {error}. */
function fetchMacReport(repo, checkRun) {
  const producer = MAC_NIGHTLY_PRODUCERS.exhaustive;
  const found = findArtifact(repo, producer, checkRun);
  if (found.error) return { error: found.error };
  try {
    return {
      report: readArtifactReport(ghApiBinary(found.artifact.archive_download_url), producer),
    };
  } catch (error) {
    return { error: error.message };
  }
}

/** Fetch the Linux lane's evidence-members artifact zip, or {error}. */
function fetchLinuxEvidence(repo, checkRun) {
  const producer = LINUX_NIGHTLY_PRODUCER;
  const found = findArtifact(repo, producer, checkRun);
  if (found.error) return { error: found.error };
  try {
    return { evidence: readShadowEvidence(ghApiBinary(found.artifact.archive_download_url)) };
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

  const picked = pickNightlyProducers(checkRuns);
  const comparable = (run) =>
    run !== null && run.status === "completed" && ["success", "failure"].includes(run.conclusion);
  const allComparable =
    comparable(picked.mac.exhaustive) &&
    NIGHTLY_ENGINES.every((engine) => comparable(picked.mac.matrix[engine])) &&
    comparable(picked.linux);
  const macFetch = allComparable ? fetchMacReport(repo, picked.mac.exhaustive) : {};
  const linuxFetch = allComparable ? fetchLinuxEvidence(repo, picked.linux) : {};

  const comparison = compareNightly({
    macExhaustive: picked.mac.exhaustive,
    macMatrix: picked.mac.matrix,
    linux: picked.linux,
    macReport: macFetch.report,
    macReportError: macFetch.error,
    linuxEvidence: linuxFetch.evidence,
    linuxEvidenceError: linuxFetch.error,
  });

  console.log(renderNightlyComparison({ sha, ...comparison }));
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
