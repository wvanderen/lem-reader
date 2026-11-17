#!/usr/bin/env node
// ops/lemcentre-runner/acceptance-collect.mjs — the migration acceptance
// EVIDENCE COLLECTOR (issue #284; presentation contract:
// docs/specs/lemcentre-acceptance.md; owner protocol:
// ops/lemcentre-runner/acceptance-checklist.md; parent plan:
// docs/specs/lemcentre-ci-migration.md §Validation and cutover sequence
// steps 4–5).
//
// This tool COLLECTS NOTHING on its own authority and never creates,
// dispatches or edits anything: it issues read-only `gh api` GET requests
// (check runs, workflow-run attempts, artifacts, refs, contents) plus
// read-only local git reads, and renders the presentation record for a
// FIXED candidate SHA from a template whose unfilled values stay explicit
// UNCOLLECTED placeholders. It never fabricates a value: a missing item is
// reported as missing (and makes the exit nonzero), never guessed.
//
//   node ops/lemcentre-runner/acceptance-collect.mjs --sha <candidate-sha> \
//        [--repo wvanderen/lem-reader] \
//        [--out docs/verification/2026-11-18-284-acceptance-evidence.md] \
//        [--json <path>] [--template-only]
//
// Exit codes:
//   0  record complete (nothing missing — includes every owner section
//       being filled, so this is only ever reached after the owner acted)
//   1  record incomplete: the missing items are listed; the record is
//       still written (that is the tool's honest output, not an error)
//   2  usage
//   4  collection error (gh/git read failure) — treat the record as
//      UNVERIFIED, never as passing (mirrors verify-enforcement.mjs)
//
// What it auto-collects (deterministic, read-only):
//   - candidate resolution + the freeze identities at that SHA (the
//     recorded environment pin, the enforced lemfleet revision, the git
//     blob IDs of the budget/calibration baselines and the contention
//     threshold — the identities whose change restarts the sequence)
//   - the three-consecutive full PR-suite adjudication for BOTH producers
//     (e2e-reference on the Mac AND e2e-linux-shadow on the guest), with
//     re-run attempts expanded so an earlier failed attempt is never masked
//   - the nightly-equivalent run: the nightly ref's tree identity against
//     the candidate, the nightly-linux-shadow check run, its per-phase /
//     per-engine / host-load / contention evidence from the uploaded
//     report bundle (the #281/#282 bundle-reader machinery)
//   - the boundary-probe run link
//
// What it NEVER fills (OWNER sections, preserved across re-runs once the
// UNCOLLECTED marker is replaced): the guest receipt + image digest, the
// isolation / artifact-safety / lease-coordination reviews, the
// cancellation/timeout/cleanup proof, the recovery + unattended receipts,
// the enforcement verification output, and the acceptance decision itself
// (left blank for the owner — closing ticket #284 is NOT acceptance).

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { unzipSync } from "fflate";
import {
  MAC_PRODUCER,
  SHADOW_PRODUCER,
  parseRunId,
  pickCheckRun,
  readArtifactReport as readArtifactReportImported,
} from "./compare-shadow.mjs";
import { parsePhaseVerdicts } from "./compare-nightly-shadow.mjs";
import { summarizeReport as summarizeReportImported } from "../../scripts/summarize-e2e.mjs";

/** The two PR-suite producers the acceptance sequence needs 3 consecutive
 * green runs from, on the same fixed candidate SHA. */
export const PR_SUITE_CHECKS = [
  {
    check: "e2e-reference",
    producer: "Mac lem-reference (AUTHORITATIVE producer)",
    workflow: "ci.yml",
  },
  {
    check: "e2e-linux-shadow",
    producer: "Lemcentre browser guest (shadow producer)",
    workflow: "e2e-linux-shadow.yml",
  },
];

/** The nightly-equivalent lane (the acceptance step's second producer). */
export const NIGHTLY_CHECK = {
  check: "nightly-linux-shadow",
  workflow: "nightly-linux-shadow.yml on [self-hosted, lemcentre]",
  reportsArtifact: "nightly-linux-shadow-reports",
};

/** The engines the nightly-equivalent run must cover exhaustively. */
export const NIGHTLY_ENGINES = ["chromium", "firefox", "webkit"];

/** How many consecutive successful full PR-suite runs acceptance needs. */
export const REQUIRED_CONSECUTIVE_RUNS = 3;

// ------------------------------------------- three consecutive (the rule) --

/**
 * Build the ordered timeline of FULL suite executions for one check name
 * on the candidate SHA: every check run the check-runs API returns (the
 * LATEST attempt of its workflow run) is expanded with the attempts API,
 * so every re-run attempt becomes its own entry and no earlier failed
 * attempt can be masked. A check run whose workflow run cannot be derived
 * contributes its own (latest) conclusion as a single entry, named
 * honestly via source "check-run".
 */
export function buildSuiteTimeline(checkRuns, attemptsByRunId) {
  const entries = [];
  for (const run of checkRuns) {
    const runId = parseRunId(run?.details_url);
    const attempts = runId !== null ? attemptsByRunId.get(runId) : undefined;
    if (Array.isArray(attempts) && attempts.length > 0) {
      for (const attempt of attempts) {
        entries.push({
          runId,
          runUrl: attempt.html_url ?? run?.html_url ?? null,
          attempt: Number(attempt.run_attempt ?? 1),
          startedAt: String(attempt.run_started_at ?? run?.started_at ?? ""),
          conclusion: attempt.status === "completed" ? (attempt.conclusion ?? null) : null,
          source: "attempt",
        });
      }
      continue;
    }
    entries.push({
      runId,
      runUrl: run?.html_url ?? null,
      attempt: 1,
      startedAt: String(run?.started_at ?? ""),
      conclusion: run?.status === "completed" ? (run?.conclusion ?? null) : null,
      source: "check-run",
    });
  }
  entries.sort((a, b) => {
    if (a.startedAt !== b.startedAt) return a.startedAt < b.startedAt ? -1 : 1;
    if (a.runId !== b.runId) return (a.runId ?? -1) - (b.runId ?? -1);
    return a.attempt - b.attempt;
  });
  return entries;
}

/**
 * The "three consecutive successful full PR-suite runs" rule (the exact
 * operational meaning, implemented and documented here):
 *
 *   Take the ordered timeline of full suite executions on ONE check on the
 *   candidate SHA (buildSuiteTimeline — re-run attempts expanded). The
 *   requirement is satisfied iff the TRAILING three entries are all
 *   `conclusion === "success"`. Anything else — failure, cancelled,
 *   timed_out, skipped, or a not-yet-concluded run — is not a successful
 *   full run and interrupts the consecutive window. Entries before the
 *   counted window (successes or failures) are history: disclosed, never
 *   counted, never hidden.
 *
 * Rationale: on a fixed SHA the Mac reaches three full executions by
 * re-running its ci.yml workflow run (attempts 1→3, each re-running the
 * whole suite); the guest lane reaches three by three dispatches. A failed
 * attempt followed by green re-runs therefore shows exactly as a broken
 * then restarted window — never as three consecutive successes.
 */
export function adjudicateThreeConsecutive(timeline, required = REQUIRED_CONSECUTIVE_RUNS) {
  const entries = [...timeline];
  let windowStart = entries.length;
  while (windowStart > 0 && entries[windowStart - 1].conclusion === "success") {
    windowStart -= 1;
  }
  const counted = entries.slice(windowStart);
  const historyOutsideWindow = entries.slice(0, windowStart);
  const trailing = counted.slice(-required);
  const satisfied = counted.length >= required;
  const shortfall = Math.max(0, required - counted.length);

  const reasons = [];
  if (entries.length === 0) {
    reasons.push(
      `no recorded executions of this check on the candidate SHA (needs ${required} consecutive successes)`,
    );
  } else if (satisfied) {
    reasons.push(
      `the trailing ${required} suite executions on this check are all successful (started ${trailing[0].startedAt} → ${trailing[trailing.length - 1].startedAt})`,
    );
  } else {
    const blocker = entries[windowStart - 1] ?? null;
    const blockerText = blocker
      ? `a ${blocker.conclusion === null ? "not-yet-concluded" : String(blocker.conclusion)} execution at ${blocker.startedAt} (run ${blocker.runId ?? "?"}, attempt ${blocker.attempt}) interrupts the window`
      : "no successful executions";
    reasons.push(
      `${blockerText}: ${counted.length} of ${required} consecutive successes collected (${shortfall} more needed after it)`,
    );
  }
  // Disclosure: everything before the counted window is history. When the
  // window is interrupted, the interrupting entry is already named above —
  // only entries STRICTLY before it are "earlier" history.
  const historyBeforeBlocker = satisfied
    ? historyOutsideWindow
    : historyOutsideWindow.slice(0, Math.max(0, windowStart - 1));
  const disclosedFailures = historyBeforeBlocker.filter((entry) => entry.conclusion !== "success");
  if (disclosedFailures.length > 0) {
    reasons.push(
      `${disclosedFailures.length} earlier non-success execution(s) on this check exist BEFORE the counted window — disclosed as history, outside the three-consecutive count`,
    );
  }
  const overflowSuccesses = counted.length - required;
  if (satisfied && overflowSuccesses > 0) {
    reasons.push(
      `${overflowSuccesses} additional successful execution(s) before the counted window — history, not counted`,
    );
  }
  if (entries.some((entry) => entry.source === "check-run")) {
    reasons.push(
      "note: at least one entry could not be expanded into attempts (workflow run not derivable or attempts unreadable) — its final conclusion only is visible",
    );
  }

  return {
    required,
    satisfied,
    counted: trailing,
    consecutiveCollected: counted.length,
    shortfall,
    historyOutsideWindow,
    reasons,
  };
}

// ------------------------------------------------------ nightly revision --

/**
 * The nightly-equivalent run counts for the candidate SHA only when the
 * `nightly` ref's commit carries EXACTLY the candidate's tree (#226: the
 * nightly ref is main HEAD plus one empty commit — a different SHA with
 * main's exact tree). Tree-SHA equality is the check; a nightly run on a
 * different tree is wrong-SHA evidence and is excluded, never guessed.
 */
export function validateNightlyRevision(candidateCommit, nightlyRef, nightlyCommit) {
  const candidateTree = candidateCommit?.commit?.tree?.sha ?? null;
  const nightlySha = nightlyRef?.object?.sha ?? null;
  const nightlyTree = nightlyCommit?.commit?.tree?.sha ?? null;
  const reasons = [];

  if (nightlySha === null) {
    reasons.push(
      "the `nightly` ref does not exist (or is unreadable) — no nightly chain has spoken",
    );
  } else if (nightlyTree === null) {
    reasons.push(
      `the nightly ref points at ${nightlySha} but its commit tree is unreadable — cannot validate the revision identity`,
    );
  } else if (candidateTree === null) {
    reasons.push(
      "the candidate commit's tree is unreadable — cannot validate the revision identity",
    );
  } else if (nightlyTree !== candidateTree) {
    reasons.push(
      `wrong-SHA evidence: the nightly ref (${nightlySha.slice(0, 12)}, tree ${nightlyTree.slice(0, 12)}) carries a DIFFERENT tree than the candidate (tree ${candidateTree.slice(0, 12)}) — the nightly chain must be advanced from the merged candidate before its run counts`,
    );
  } else {
    reasons.push(
      `the nightly ref points at ${nightlySha.slice(0, 12)} which carries the same tree as the candidate (${candidateTree.slice(0, 12)}) — the nightly chain spoke on this revision`,
    );
  }
  return {
    ok:
      nightlySha !== null &&
      nightlyTree !== null &&
      candidateTree !== null &&
      nightlyTree === candidateTree,
    nightlySha,
    candidateTree,
    nightlyTree,
    reasons,
  };
}

// ---------------------------------------------------- evidence-bundle reader

/**
 * Read the acceptance-relevant members out of the nightly lane's uploaded
 * `nightly-linux-shadow-reports` artifact zip: the three per-engine
 * exhaustive reports, the phase verdicts (parsePhaseVerdicts — the #282
 * machinery), the per-phase host-load record (loadavg + lease owners) and
 * the contention verdict the lane's adjudication step wrote. Mirrors the
 * #281/#282 readers: a missing or malformed member is a NAMED error and
 * the rest stays readable — nothing is guessed.
 */
export function readAcceptanceEvidence(zipBytes) {
  const entries = unzipSync(new Uint8Array(zipBytes));
  const readJson = (member) => {
    const text = Buffer.from(entries[member]).toString("utf8");
    return JSON.parse(text);
  };

  const reports = {};
  const reportErrors = {};
  for (const engine of NIGHTLY_ENGINES) {
    const member = `reports/e2e-exhaustive-${engine}.json`;
    if (!entries[member]) {
      reports[engine] = undefined;
      reportErrors[engine] =
        `no report member ${member} in artifact ${NIGHTLY_CHECK.reportsArtifact}`;
      continue;
    }
    try {
      reports[engine] = readJson(member);
    } catch (error) {
      reports[engine] = undefined;
      reportErrors[engine] = `report member ${member} is not JSON: ${error.message}`;
    }
  }

  const phasesMember = "verdicts/phases.json";
  let phases;
  let phasesError;
  if (!entries[phasesMember]) {
    phasesError = `no phases member ${phasesMember} in artifact ${NIGHTLY_CHECK.reportsArtifact}`;
  } else {
    try {
      phases = parsePhaseVerdicts(readJson(phasesMember));
    } catch (error) {
      phasesError = error.message;
    }
  }

  const hostLoadMember = "identity/host-load.json";
  let hostLoad;
  let hostLoadError;
  if (!entries[hostLoadMember]) {
    hostLoadError = `no host-load member ${hostLoadMember} in artifact ${NIGHTLY_CHECK.reportsArtifact}`;
  } else {
    try {
      const parsed = readJson(hostLoadMember);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !Array.isArray(parsed.phases) ||
        parsed.phases.some(
          (phase) =>
            typeof phase !== "object" ||
            phase === null ||
            typeof phase.phase !== "string" ||
            typeof phase.loadavg?.["1m"] !== "number" ||
            !Number.isFinite(phase.loadavg["1m"]),
        )
      ) {
        throw new Error(
          "host-load record shape: expected {schemaVersion, phases: [{phase, loadavg.1m, lease}]}",
        );
      }
      hostLoad = parsed;
    } catch (error) {
      hostLoadError = `host-load member ${hostLoadMember} is unreadable: ${error.message}`;
    }
  }

  const contentionMember = "verdicts/contention.json";
  let contention;
  let contentionError;
  if (!entries[contentionMember]) {
    contentionError = `no contention member ${contentionMember} in artifact ${NIGHTLY_CHECK.reportsArtifact}`;
  } else {
    try {
      const parsed = readJson(contentionMember);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof parsed.measurementInvalid !== "boolean" ||
        typeof parsed.threshold?.loadavg1mMax !== "number"
      ) {
        throw new Error("expected {measurementInvalid, threshold.loadavg1mMax, phases}");
      }
      contention = parsed;
    } catch (error) {
      contentionError = `contention member ${contentionMember} is unreadable: ${error.message}`;
    }
  }

  return {
    reports,
    reportErrors,
    phases,
    phasesError,
    hostLoad,
    hostLoadError,
    contention,
    contentionError,
  };
}

// -------------------------------------------------- nightly run adjudication

/**
 * Grade ONE nightly-linux-shadow run for acceptance:
 *
 *   acceptance-grade      green conclusion AND every evidence member
 *                         readable AND all phase exits 0 AND no
 *                         contentionInvalid flag AND measurementInvalid
 *                         false AND all three engines' reports present
 *                         with zero unexpected outcomes AND a host-load
 *                         record present
 *   not-acceptance-grade  green but unverifiable or degraded (unreachable
 *                         bundle, missing member, nonzero phase exit,
 *                         contention flags, unexpected outcomes) — the
 *                         sequence needs a clean quiet-host rerun
 *   invalid               a failing run: under measured contention that is
 *                         the exit-7 shape (infrastructure, never a
 *                         product regression); otherwise it blocks
 *                         acceptance pending diagnosis
 *   uncollected           no concluded run on the nightly ref — never guessed
 */
export function adjudicateNightlyRun({ checkRun, evidence, evidenceError }) {
  const reasons = [];
  if (!checkRun || checkRun.status !== "completed" || !checkRun.conclusion) {
    return {
      grade: "uncollected",
      reasons: [
        checkRun
          ? `the ${NIGHTLY_CHECK.check} run has not concluded (status ${checkRun.status})`
          : `no ${NIGHTLY_CHECK.check} check run on the nightly ref — the lane has not run on this revision`,
      ],
    };
  }

  if (checkRun.conclusion !== "success") {
    if (evidence?.contention?.measurementInvalid === true) {
      reasons.push(
        "failing nightly-equivalent run under measured contention — the exit-7 shape: an INFRASTRUCTURE failure, never a product regression; re-run when the host is quiet",
      );
    } else {
      reasons.push(
        `failing nightly-equivalent run (conclusion ${checkRun.conclusion}) blocks acceptance pending diagnosis`,
      );
    }
    return { grade: "invalid", reasons };
  }

  // Green conclusion — now verify the evidence actually supports it.
  if (evidenceError !== undefined || evidence === undefined) {
    reasons.push(
      `evidence bundle unreachable (${evidenceError ?? "not fetched"}) — the green verdict is unverifiable, not acceptance-grade`,
    );
    return { grade: "not-acceptance-grade", reasons };
  }
  if (evidence.contentionError) {
    reasons.push(`contention unverifiable (${evidence.contentionError}) — not acceptance-grade`);
  } else if (evidence.contention?.measurementInvalid === true) {
    reasons.push(
      "green under measured contention (measurementInvalid) — this run is NOT acceptance-grade; the acceptance sequence needs a quiet-host nightly-equivalent run",
    );
  }
  if (!evidence.hostLoad || evidence.hostLoadError) {
    reasons.push(
      `host-load record missing or unreadable (${evidence.hostLoadError ?? "absent"}) — contention evidence is unverifiable, not acceptance-grade`,
    );
  }
  if (evidence.phasesError || !evidence.phases) {
    reasons.push(
      `phase verdicts unreachable (${evidence.phasesError ?? "absent"}) — per-phase outcomes unverifiable, not acceptance-grade`,
    );
  } else {
    for (const phase of evidence.phases.phases) {
      if (phase.contentionInvalid) {
        reasons.push(
          `phase ${phase.phase} is contention-invalidated (flagged in verdicts/phases.json) — not acceptance-grade`,
        );
      }
      if (phase.exit !== 0) {
        reasons.push(
          `phase ${phase.phase} recorded exit ${phase.exit} despite the green conclusion — a launcher contract anomaly, not acceptance-grade`,
        );
      }
    }
  }
  for (const engine of NIGHTLY_ENGINES) {
    const report = evidence.reports[engine];
    if (!report) {
      reasons.push(
        `engine ${engine}: exhaustive report unreachable (${evidence.reportErrors[engine] ?? "absent"}) — three-engine coverage unverifiable, not acceptance-grade`,
      );
      continue;
    }
    const summary = engineOutcome(report, engine);
    if (summary === null) {
      reasons.push(`engine ${engine}: report carries no comparable outcome — not acceptance-grade`);
    } else if (summary.unexpected > 0) {
      reasons.push(
        `engine ${engine}: ${summary.unexpected} unexpected outcome(s) in the exhaustive report — not acceptance-grade`,
      );
    }
  }

  if (reasons.length > 0) return { grade: "not-acceptance-grade", reasons };
  reasons.push(
    "green conclusion with verified evidence: all phases exit 0, no contention invalidation, three engines with zero unexpected outcomes, host load recorded",
  );
  return { grade: "acceptance-grade", reasons };
}

/** The per-engine outcome row from a Playwright JSON report (or null). */
function engineOutcome(report, engine) {
  const summary = summarizeReportImported(report);
  const row = (summary.engines ?? []).find((entry) => entry.project === engine);
  const unexpected = row?.unexpected ?? summary.stats?.unexpected;
  if (typeof unexpected !== "number") return null;
  return { unexpected, flaky: row?.flaky ?? 0 };
}

// -------------------------------------------------- record assembly + render

/** The unfilled collect state (the template's data shape). */
export function emptyCollectState() {
  const emptySuite = () => ({
    timeline: [],
    verdict: adjudicateThreeConsecutive([]),
    engines: [], // per counted run: {runId, attempt, rows|null, error|null}
  });
  const prSuite = {};
  for (const check of PR_SUITE_CHECKS) prSuite[check.check] = emptySuite();
  return {
    repo: "wvanderen/lem-reader",
    shaArg: "",
    resolvedSha: null,
    candidateTree: null,
    collectedAt: "", // "" = template-only render (no timestamp)
    filledOwnerIds: [],
    identity: {
      pin: null, // {parsed, source} | null
      pinError: null,
      lemfleetRev: null,
      lemfleetRevError: null,
      blobs: { budget: null, calibration: null, threshold: null },
    },
    prSuite,
    nightly: {
      revision: null, // validateNightlyRevision result | null
      run: null, // the picked nightly-linux-shadow CheckRun | null
      grade: adjudicateNightlyRun({ checkRun: null }),
      evidence: null,
      evidenceError: undefined,
    },
    boundaryProbe: null, // {url, conclusion, completedAt} | null
  };
}

/** Every item the acceptance record requires, with who must supply it. */
export const OWNER_SECTIONS = [
  { id: "owner:receipt", what: "guest environment receipt + base-image digest" },
  { id: "owner:isolation", what: "isolation review (workflow/control-plane boundary)" },
  { id: "owner:artifact-safety", what: "artifact-safety review (bounded bundle transport)" },
  { id: "owner:lease-review", what: "lease-coordination review" },
  { id: "owner:lifecycle", what: "cancellation/timeout/cleanup proof" },
  { id: "owner:recovery", what: "stale-lease + unattended recovery receipts" },
  { id: "owner:enforcement", what: "verify-enforcement.mjs output" },
  { id: "owner:decision", what: "the explicit acceptance decision" },
];

/**
 * The missing-items list: everything the record still requires. Collector
 * items are facts the tool could not read; owner items are the human
 * proofs (listed until their OWNER block's UNCOLLECTED marker is gone).
 */
export function missingItems(state, filledOwnerIds = state.filledOwnerIds ?? []) {
  const missing = [];
  const add = (id, who, why) => missing.push({ id, who, why });

  if (!state.resolvedSha) add("candidate", "collector", "the candidate SHA could not be resolved");
  const idAdds = [
    [
      "identity:pin",
      state.identity.pin,
      state.identity.pinError,
      "the recorded environment pin at the candidate SHA",
    ],
    [
      "identity:lemfleet-rev",
      state.identity.lemfleetRev,
      state.identity.lemfleetRevError,
      "the enforced lemfleet revision at the candidate SHA",
    ],
    [
      "identity:budget",
      state.identity.blobs.budget,
      null,
      "budget identity (git blob of tests/e2e/perf/budget.json)",
    ],
    [
      "identity:calibration",
      state.identity.blobs.calibration,
      null,
      "calibration identity (git blob of calibration/fingerprint.json)",
    ],
    [
      "identity:threshold",
      state.identity.blobs.threshold,
      null,
      "contention-threshold identity (git blob)",
    ],
  ];
  for (const [id, value, error, what] of idAdds) {
    if (!value) add(id, "collector", `${what} is uncollected${error ? ` (${error})` : ""}`);
  }
  for (const check of PR_SUITE_CHECKS) {
    const suite = state.prSuite[check.check];
    if (suite?.shaMismatch) {
      add(
        `pr-suite:${check.check}:sha`,
        "collector",
        "a check run on this SHA reports a different head_sha — wrong-SHA evidence, excluded",
      );
    }
    if (!suite?.verdict?.satisfied) {
      add(
        `pr-suite:${check.check}`,
        "collector",
        suite?.verdict?.reasons?.join("; ") ?? "no adjudication",
      );
    }
    const unreachable = (suite?.engines ?? []).filter((entry) => !entry.rows);
    if (unreachable.length > 0) {
      add(
        `pr-suite:${check.check}:reports`,
        "collector",
        `${unreachable.length} counted run(s) without a reachable per-engine report (${unreachable.map((entry) => entry.error ?? "?").join("; ")})`,
      );
    }
  }
  if (!state.nightly?.revision?.ok) {
    add(
      "nightly:ref",
      "collector",
      state.nightly?.revision?.reasons?.join("; ") ?? "the nightly ref was not validated",
    );
  }
  if (state.nightly?.grade?.grade !== "acceptance-grade") {
    add(
      "nightly:run",
      "collector",
      state.nightly?.grade?.reasons?.join("; ") ?? "no nightly-equivalent adjudication",
    );
  }
  if (!state.boundaryProbe) {
    add(
      "boundary-probe",
      "collector",
      "no completed boundary-probe workflow run found (read-only lookup)",
    );
  }
  for (const section of OWNER_SECTIONS) {
    if (!filledOwnerIds.includes(section.id)) {
      add(section.id, "owner", `${section.what} — OWNER section still UNCOLLECTED`);
    }
  }
  return missing;
}

const MISSING = (why) => `**UNCOLLECTED — ${why}**`;

function valueOr(why) {
  return (value, render = (v) => String(v)) =>
    value === null || value === undefined ? MISSING(why) : render(value);
}

function fmtEngineRow(row) {
  if (!row) return "absent";
  return `${row.expected}✓ / ${row.unexpected}✗ / ${row.flaky ?? 0}flake / ${row.skipped ?? 0}skip`;
}

function ownerBlock(id, body) {
  const marker = id.replace(/^owner:/, "");
  return `<!-- OWNER:${marker}:start -->\n${body}\n<!-- OWNER:${marker}:end -->`;
}

/**
 * Render the presentation record (docs/specs/lemcentre-acceptance.md is
 * the contract). Every uncollected value stays an explicit UNCOLLECTED
 * placeholder; the acceptance decision is always an owner block.
 */
export function renderRecord(state) {
  const missing = missingItems(state);
  const lines = [];
  const template = !state.collectedAt;

  lines.push(`# Migration acceptance evidence — issue #284 (spec #305, steps 4–5)`);
  lines.push("");
  if (template) {
    lines.push(
      `> **Status: TEMPLATE — NO EVIDENCE COLLECTED.** This is the presentation record`,
      `> \`acceptance-collect.mjs\` emits; nothing in it is evidence of anything except`,
      `> the protocol. Every value is an explicit UNCOLLECTED placeholder until the`,
      `> owner-gated acceptance sequence runs (\`ops/lemcentre-runner/acceptance-checklist.md\`).`,
      `> **Closing ticket #284 is NOT acceptance** — see \`docs/specs/lemcentre-acceptance.md\`.`,
    );
  } else {
    lines.push(
      `> **Status: RECORD (auto-collected at ${state.collectedAt}).** Sections marked`,
      `> COLLECTED are facts read read-only from git/GitHub at collection time;`,
      `> UNCOLLECTED means not collected — never guessed. This record alone is NOT`,
      `> acceptance: acceptance is the owner's explicit decision in §6, requested`,
      `> per \`docs/specs/lemcentre-acceptance.md\`.`,
    );
  }
  lines.push("");
  lines.push(`## 1. Freeze identity (the candidate revision and its immutable identities)`);
  lines.push("");
  lines.push(`| item | value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| repository | ${state.repo} |`);
  lines.push(
    `| candidate SHA | ${
      state.resolvedSha
        ? `\`${state.resolvedSha}\` (argument \`${state.shaArg || "?"}\`)`
        : MISSING("the candidate SHA argument was not resolved")
    } |`,
  );
  lines.push(
    `| candidate tree | ${state.candidateTree ? `\`${state.candidateTree}\`` : MISSING("candidate tree not resolved")} |`,
  );
  const pin = state.identity.pin?.parsed;
  lines.push(
    `| environment pin (recorded at candidate) | ${
      pin
        ? `${pin.guest?.form ?? "?"} · ${pin.guest?.os ?? "?"} · ${pin.guest?.vcpu ?? "?"} vCPU / ${pin.guest?.ramGiB ?? "?"} GiB · NIC ${pin.guest?.nic ?? "?"} · Node ${pin.node ?? "?"} · Playwright ${pin.playwright ?? "?"} · browsers ${JSON.stringify(pin.browsers ?? {})} · ${pin.measurementWorkers ?? "?"} measurement workers (source: ${state.identity.pin.source})`
        : MISSING(
            `the recorded environment pin at the candidate SHA${state.identity.pinError ? ` (${state.identity.pinError})` : ""}`,
          )
    } |`,
  );
  lines.push(
    `| enforced lemfleet revision (at candidate) | ${
      state.identity.lemfleetRev
        ? `\`${state.identity.lemfleetRev}\``
        : MISSING(
            `lemfleet-rev at the candidate SHA${state.identity.lemfleetRevError ? ` (${state.identity.lemfleetRevError})` : ""}`,
          )
    } |`,
  );
  for (const [key, label] of [
    ["budget", "budget identity"],
    ["calibration", "calibration identity"],
    ["threshold", "contention-threshold identity"],
  ]) {
    const blob = state.identity.blobs[key];
    lines.push(
      `| ${label} | ${
        blob
          ? `\`${blob.path}\` → git blob \`${blob.blob}\` @ candidate`
          : MISSING(`${label} (git blob at the candidate SHA)`)
      } |`,
    );
  }
  lines.push("");
  lines.push(
    `Any change to the pin, the baselines or the threshold is a profile change:`,
    `it requires explicit owner approval and **restarts the acceptance sequence**`,
    `([lemcentre-ci-migration.md](../specs/lemcentre-ci-migration.md) §Browser contracts and performance).`,
    ``,
  );

  lines.push(`## 2. Three consecutive full PR-suite runs (the candidate SHA)`);
  lines.push("");
  lines.push(
    `Rule (as implemented by \`acceptance-collect.mjs\`): per check, the ordered`,
    `timeline of FULL suite executions on the candidate SHA — every check run`,
    `expanded with its workflow-run attempts, so re-run attempts are never`,
    `masked — must end in three consecutive \`success\` conclusions. Anything`,
    `else (failure, cancelled, timed_out, not-yet-concluded) interrupts the`,
    `window. Entries before the window are history, disclosed below.`,
    ``,
  );
  for (const check of PR_SUITE_CHECKS) {
    const suite = state.prSuite[check.check];
    lines.push(`### ${check.check} — ${check.producer} (${check.workflow})`);
    lines.push("");
    lines.push(
      `**Verdict: ${suite.verdict.satisfied ? "SATISFIED (3 consecutive successes)" : `NOT SATISFIED (${suite.verdict.consecutiveCollected}/3, shortfall ${suite.verdict.shortfall})`}**`,
    );
    lines.push("");
    if (suite.timeline.length > 0) {
      lines.push(`| # | started | run | attempt | conclusion | counted |`);
      lines.push(`| --- | --- | --- | --- | --- | --- |`);
      const countedIds = new Set(suite.verdict.counted.map((e) => `${e.runId}#${e.attempt}`));
      suite.timeline.forEach((entry, index) => {
        lines.push(
          `| ${index + 1} | ${entry.startedAt || "?"} | ${entry.runUrl ? `[run ${entry.runId ?? "?"}](${entry.runUrl})` : String(entry.runId ?? "?")} | ${entry.attempt} | ${entry.conclusion ?? "not concluded"} | ${countedIds.has(`${entry.runId}#${entry.attempt}`) ? "yes" : "—"} |`,
        );
      });
      lines.push("");
    } else {
      lines.push(MISSING(`no ${check.check} executions are recorded on the candidate SHA`));
      lines.push("");
    }
    for (const reason of suite.verdict.reasons) lines.push(`- ${reason}`);
    lines.push("");
    if (suite.engines.length > 0) {
      lines.push(`Per-engine outcomes of the counted runs (from the uploaded JSON reports):`);
      lines.push("");
      for (const entry of suite.engines) {
        if (entry.rows) {
          lines.push(`- run ${entry.runId ?? "?"} attempt ${entry.attempt}:`);
          lines.push(``);
          lines.push(`  | engine | outcome |`);
          lines.push(`  | --- | --- |`);
          for (const row of entry.rows) lines.push(`  | ${row.project} | ${fmtEngineRow(row)} |`);
        } else {
          lines.push(
            `- run ${entry.runId ?? "?"} attempt ${entry.attempt}: ${MISSING(`per-engine report unreachable (${entry.error ?? "?"})`)}`,
          );
        }
      }
      lines.push("");
    }
  }

  lines.push(`## 3. Nightly-equivalent run (the \`nightly\` ref)`);
  lines.push("");
  const rev = state.nightly.revision;
  lines.push(
    `Revision identity: ${
      rev
        ? rev.reasons.join("; ")
        : MISSING("the nightly ref was not validated against the candidate")
    }`,
    ``,
  );
  const run = state.nightly.run;
  lines.push(
    `Run: ${
      run
        ? `${NIGHTLY_CHECK.check} — [run](${run.html_url ?? "?"}) conclusion \`${run.conclusion ?? "?"}\``
        : MISSING(`no ${NIGHTLY_CHECK.check} check run on the nightly ref`)
    }`,
    ``,
  );
  lines.push(`**Acceptance grade: ${state.nightly.grade.grade}**`);
  lines.push("");
  for (const reason of state.nightly.grade.reasons) lines.push(`- ${reason}`);
  lines.push("");
  const evidence = state.nightly.evidence;
  if (evidence) {
    if (evidence.phases) {
      lines.push(`Phase verdicts (verdicts/phases.json):`);
      lines.push(``);
      lines.push(`| phase | exit | per-engine | contention |`);
      lines.push(`| --- | --- | --- | --- |`);
      for (const phase of evidence.phases.phases) {
        const engines = phase.engines
          ? Object.entries(phase.engines)
              .map(([engine, exit]) => `${engine}: ${exit}`)
              .join(", ")
          : "—";
        lines.push(
          `| ${phase.phase} | ${phase.exit} | ${engines} | ${phase.contentionInvalid ? "INVALIDATED" : "—"} |`,
        );
      }
      lines.push("");
    } else {
      lines.push(MISSING(`phase verdicts (${evidence.phasesError ?? "absent"})`), "");
    }
    lines.push(`Per-engine exhaustive results:`);
    lines.push("");
    lines.push(`| engine | outcome |`);
    lines.push(`| --- | --- |`);
    for (const engine of NIGHTLY_ENGINES) {
      const report = evidence.reports[engine];
      const row = report
        ? (summarizeReportImported(report).engines ?? []).find((entry) => entry.project === engine)
        : null;
      lines.push(
        `| ${engine} | ${row ? fmtEngineRow(row) : MISSING(evidence.reportErrors[engine] ?? "report absent")} |`,
      );
    }
    lines.push("");
    if (evidence.hostLoad) {
      lines.push(`Host load at each phase's lease acquisition (identity/host-load.json):`);
      lines.push("");
      lines.push(`| phase | loadavg 1m / 5m / 15m | lease owner |`);
      lines.push(`| --- | --- | --- |`);
      for (const phase of evidence.hostLoad.phases) {
        const avg = phase.loadavg ?? {};
        lines.push(
          `| ${phase.phase} | ${avg["1m"] ?? "?"} / ${avg["5m"] ?? "?"} / ${avg["15m"] ?? "?"} | ${phase.lease?.owner ?? "?"} |`,
        );
      }
      lines.push("");
    } else {
      lines.push(MISSING(`host-load record (${evidence.hostLoadError ?? "absent"})`), "");
    }
    if (evidence.contention) {
      lines.push(
        `Contention verdict (verdicts/contention.json): measurementInvalid = \`${evidence.contention.measurementInvalid}\`, threshold loadavg1m > ${evidence.contention.threshold?.loadavg1mMax ?? "?"} (${evidence.contention.threshold?.source ?? "ops/lemcentre-runner/contention-threshold.json"}).`,
        ``,
      );
    } else {
      lines.push(MISSING(`contention verdict (${evidence.contentionError ?? "absent"})`), "");
    }
  } else {
    lines.push(
      MISSING(
        `the nightly evidence members were not readable (${state.nightly.evidenceError ?? "artifact not fetched"})`,
      ),
      ``,
    );
  }

  lines.push(`## 4. Environment identity (receipts)`);
  lines.push("");
  lines.push(
    `The pinned identity files are recorded in §1. The receipt each run actually`,
    `verified against the enforced pin is rendered in that run's step summary`,
    `(follow the run links in §2/§3): a green lane conclusion entails the`,
    `receipt-vs-pin pre-step passed (a mismatch is exit 33, honest red). The`,
    `receipt's recorded base-image digest is owner evidence:`,
    ``,
  );
  lines.push(
    ownerBlock(
      "owner:receipt",
      `UNCOLLECTED — attach the guest environment receipt (\`/usr/local/libexec/factory-ci/browser-guest-env.json\` as read during a counted run) including the exact base-image source + sha256 digest, and the receipt-vs-pin verdict links from each counted run's summary.`,
    ),
    ``,
  );

  lines.push(`## 5. Lifecycle / security / coordination / recovery proofs`);
  lines.push("");
  lines.push(
    `- boundary-probe run: ${
      state.boundaryProbe
        ? `[run](${state.boundaryProbe.url}) — conclusion \`${state.boundaryProbe.conclusion}\` (${state.boundaryProbe.completedAt})`
        : MISSING("no completed boundary-probe workflow run found by the read-only lookup")
    }`,
    `- enforcement verification: run \`node ops/lemcentre-runner/verify-enforcement.mjs --json <path>\` (pre-cutover mode) and attach the JSON output — its shape is \`{when, repo, expectLinux, mode, layers, mapping, findings, passed}\` (exit 0 = both enforcement layers hold).`,
    `- recovery drill + desired state: \`sudo bash ops/lemcentre-runner/verify-recovery.sh\` receipt (exit 0) and the lemfleet recovery-drill summary (lemfleet#24).`,
    ``,
  );
  lines.push(
    ownerBlock(
      "owner:isolation",
      `UNCOLLECTED — attach the isolation review for the acceptance runs (workflow/control-plane boundary: \`ops/lemcentre-runner/verify-boundary.sh\` receipt + the review note; see docs/specs/lemcentre-runner-boundary.md).`,
    ),
    ``,
  );
  lines.push(
    ownerBlock(
      "owner:artifact-safety",
      `UNCOLLECTED — attach the artifact-safety review (the bounded bundle transport the counted runs used: verified bundles on every counted Linux run + the review note; see docs/specs/lemcentre-browser-diagnostics.md).`,
    ),
    ``,
  );
  lines.push(
    ownerBlock(
      "owner:lease-review",
      `UNCOLLECTED — attach the lease-coordination review (host-load + lease-owner records from §3 plus the host lease log for the counted window; see docs/specs/lemcentre-host-lease.md).`,
    ),
    ``,
  );
  lines.push(
    ownerBlock(
      "owner:lifecycle",
      `UNCOLLECTED — attach the cancellation/timeout/cleanup proof (a deliberately cancelled or timed-out guest run showing visible teardown, no lingering lease or guest; see docs/specs/lemcentre-runner-rollback.md and the #283 record).`,
    ),
    ``,
  );
  lines.push(
    ownerBlock(
      "owner:recovery",
      `UNCOLLECTED — attach the stale-lease recovery + unattended-recovery receipts (verify-recovery.sh exit 0, sweep-timer drill, reboot drill; docs/verification/2026-11-17-283-unattended-recovery.md completion).`,
    ),
    ``,
  );
  lines.push(
    ownerBlock(
      "owner:enforcement",
      `UNCOLLECTED — paste the verify-enforcement.mjs JSON output (or attach it) showing both enforcement layers hold and no required-check routing changed during acceptance.`,
    ),
    ``,
  );

  lines.push(`## 6. Acceptance decision (OWNER — intentionally blank)`);
  lines.push("");
  lines.push(
    ownerBlock(
      "owner:decision",
      `UNCOLLECTED — the explicit owner decision goes here (requested per docs/specs/lemcentre-acceptance.md: the filled record + that spec). Accepted / not accepted, date, and any conditions. This section is NEVER filled by the collector.`,
    ),
    ``,
  );

  lines.push(`## 7. Missing items (tool-computed)`);
  lines.push("");
  if (missing.length === 0) {
    lines.push(
      `Nothing missing — every collector item was read and every owner section is filled.`,
    );
  } else {
    lines.push(`| item | who | why |`);
    lines.push(`| --- | --- | --- |`);
    for (const item of missing) {
      lines.push(`| ${item.id} | ${item.who} | ${item.why.replace(/\|/g, "\\|")} |`);
    }
  }
  lines.push("");
  lines.push(
    `---`,
    ``,
    `Generated by \`ops/lemcentre-runner/acceptance-collect.mjs\` (read-only).`,
    `Contract: \`docs/specs/lemcentre-acceptance.md\`. Protocol: \`ops/lemcentre-runner/acceptance-checklist.md\`.`,
    `This record is a presentation of evidence, not authority: the Mac stays the`,
    `authoritative producer and no required check changes at acceptance time.`,
    ``,
  );
  return lines.join("\n");
}

// ------------------------------------------------------- owner carry-over

/**
 * Preserve owner-filled sections across collector re-runs: for every OWNER
 * block in the freshly rendered record, if the existing file's copy of
 * that block no longer contains its UNCOLLECTED marker, the owner filled
 * it — carry it over verbatim (and report it filled). Unfilled or absent
 * blocks are regenerated. Everything outside OWNER blocks is always the
 * fresh render (auto sections are the collector's to own).
 */
export function carryOverOwnerSections(existingText, renderedText) {
  if (typeof existingText !== "string") return { text: renderedText, filledOwnerIds: [] };
  let text = renderedText;
  const filledOwnerIds = [];
  for (const section of OWNER_SECTIONS) {
    const marker = section.id.replace(/^owner:/, "");
    const pattern = new RegExp(
      `(<!-- OWNER:${marker}:start -->\\n)([\\s\\S]*?)(<!-- OWNER:${marker}:end -->)`,
    );
    const existingMatch = existingText.match(pattern);
    const renderedMatch = text.match(pattern);
    if (!existingMatch || !renderedMatch) continue;
    const body = existingMatch[2];
    if (/UNCOLLECTED/.test(body)) continue; // still unfilled — regenerate
    text = text.replace(pattern, `$1${body.replace(/\$/g, "$$$$")}$3`);
    filledOwnerIds.push(section.id);
  }
  return { text, filledOwnerIds };
}

// ---------------------------------------------------------------- CLI ------

function usage(exitCode) {
  console.log(`usage: acceptance-collect.mjs --sha <candidate-sha> [options]
       acceptance-collect.mjs --template-only [--out PATH]

  --sha SHA          the FIXED candidate revision the acceptance sequence
                     runs on (required unless --template-only)
  --repo SLUG        repository (default wvanderen/lem-reader)
  --out PATH         record path (default
                     docs/verification/2026-11-18-284-acceptance-evidence.md)
  --json PATH        also write the machine-readable collection summary
  --template-only    emit the unfilled presentation record offline (no gh
                     reads) — the committed scaffold's provenance

Read-only: only gh api GET requests and local git reads are issued; the
record is the ONLY write. OWNER sections already filled in an existing
record are carried over verbatim. Exit codes: 0 complete · 1 incomplete
(missing items listed; the record is still written) · 2 usage · 4
collection error (treat the record as UNVERIFIED, never as passing).`);
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

function gitOut(args) {
  const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
}

/** A file's content + git blob id at a SHA: local git first (no network),
 * gh contents API fallback. {content, blob} | {error}. */
function fileAt(repo, sha, path) {
  const show = gitOut(["show", `${sha}:${path}`]);
  if (show !== null) {
    const blob = gitOut(["rev-parse", `${sha}:${path}`]);
    if (blob !== null) return { content: show, blob: blob.trim() };
  }
  try {
    const entry = ghApiJson(repo, `contents/${path}?ref=${encodeURIComponent(sha)}`);
    if (typeof entry?.content !== "string")
      return { error: `contents API entry for ${path} carries no content` };
    return {
      content: Buffer.from(entry.content, "base64").toString("utf8"),
      blob: String(entry.sha ?? ""),
    };
  } catch (error) {
    return { error: error.message };
  }
}

/** The artifact entries for a workflow run (read-only), or {error}. */
function artifactsFor(repo, runId) {
  try {
    return ghApiJson(repo, `actions/runs/${runId}/artifacts`);
  } catch (error) {
    return { error: error.message };
  }
}

/** Download a producer's report artifact zip and read its JSON report —
 * the #281 machinery (readArtifactReport), never guessing. {rows}|{error}. */
function fetchEngineRows(repo, producer, checkRun) {
  const runId = parseRunId(checkRun.details_url);
  if (runId === null) return { error: `cannot derive workflow run id from details_url` };
  const artifacts = artifactsFor(repo, runId);
  if (artifacts.error) return { error: artifacts.error };
  const artifact = (artifacts.artifacts ?? []).find((entry) => entry?.name === producer.artifact);
  if (!artifact) return { error: `artifact ${producer.artifact} not present on run ${runId}` };
  if (artifact.expired) return { error: `artifact ${producer.artifact} expired (7-day retention)` };
  try {
    const report = readArtifactReportImported(ghApiBinary(artifact.archive_download_url), producer);
    return { rows: summarizeReportImported(report).engines ?? [] };
  } catch (error) {
    return { error: error.message };
  }
}

/** Collect the full read-only state for a candidate SHA. Throws on
 * foundational read failures (the caller exits 4 — UNVERIFIED). */
function collectState(repo, shaArg) {
  const state = emptyCollectState();
  state.repo = repo;
  state.shaArg = shaArg;
  state.collectedAt = new Date().toISOString();

  const candidate = ghApiJson(repo, `commits/${encodeURIComponent(shaArg)}`);
  state.resolvedSha = String(candidate?.sha ?? "") || null;
  state.candidateTree = candidate?.commit?.tree?.sha ?? null;
  if (!state.resolvedSha) throw new Error(`commits/${shaArg} returned no sha`);

  // Freeze identities at the candidate SHA.
  const pinFile = fileAt(
    repo,
    state.resolvedSha,
    "ops/lemcentre-runner/browser-guest/environment-pin.json",
  );
  if (pinFile.error) state.identity.pinError = pinFile.error;
  else {
    try {
      state.identity.pin = {
        parsed: JSON.parse(pinFile.content),
        source: `ops/lemcentre-runner/browser-guest/environment-pin.json @ ${state.resolvedSha.slice(0, 12)} (git blob ${pinFile.blob.slice(0, 12)})`,
      };
    } catch (error) {
      state.identity.pinError = `the recorded pin is not JSON at this SHA: ${error.message}`;
    }
  }
  const revFile = fileAt(repo, state.resolvedSha, "ops/lemcentre-runner/lemfleet-rev");
  if (revFile.error) state.identity.lemfleetRevError = revFile.error;
  else state.identity.lemfleetRev = revFile.content.trim() || null;
  for (const [key, path] of [
    ["budget", "tests/e2e/perf/budget.json"],
    ["calibration", "calibration/fingerprint.json"],
    ["threshold", "ops/lemcentre-runner/contention-threshold.json"],
  ]) {
    const file = fileAt(repo, state.resolvedSha, path);
    if (!file.error && file.blob) state.identity.blobs[key] = { path, blob: file.blob };
  }

  // PR-suite timelines for both producers on the candidate SHA.
  const checkRuns = ghApiJson(repo, `commits/${encodeURIComponent(shaArg)}/check-runs`);
  for (const check of PR_SUITE_CHECKS) {
    const runs = (checkRuns?.check_runs ?? []).filter((run) => run?.name === check.check);
    const attemptsByRunId = new Map();
    for (const runId of [
      ...new Set(runs.map((run) => parseRunId(run?.details_url)).filter((id) => id !== null)),
    ]) {
      try {
        const payload = ghApiJson(repo, `actions/runs/${runId}/attempts`);
        attemptsByRunId.set(runId, payload?.workflow_runs ?? []);
      } catch {
        // degradation: the check run's own (latest) conclusion is used and
        // named honestly via source "check-run"
      }
    }
    const suite = state.prSuite[check.check];
    suite.timeline = buildSuiteTimeline(runs, attemptsByRunId);
    suite.verdict = adjudicateThreeConsecutive(suite.timeline);
    if (runs.some((run) => run?.head_sha && run.head_sha !== state.resolvedSha)) {
      suite.shaMismatch = true;
      suite.verdict.reasons.push(
        "a check run on this SHA reports a different head_sha — wrong-SHA evidence",
      );
    }
    const producer = check.check === "e2e-reference" ? MAC_PRODUCER : SHADOW_PRODUCER;
    for (const entry of suite.verdict.counted) {
      const run = runs.find(
        (candidateRun) => parseRunId(candidateRun?.details_url) === entry.runId,
      );
      if (!run || entry.source === "check-run") {
        suite.engines.push({
          runId: entry.runId,
          attempt: entry.attempt,
          rows: null,
          error: "per-engine report only fetched where the workflow run is derivable",
        });
        continue;
      }
      const fetched = fetchEngineRows(repo, producer, run);
      suite.engines.push({
        runId: entry.runId,
        attempt: entry.attempt,
        rows: fetched.rows ?? null,
        error: fetched.error ?? null,
      });
    }
  }

  // Nightly-equivalent run on the nightly ref.
  let nightlyRef = null;
  try {
    nightlyRef = ghApiJson(repo, "git/ref/heads/nightly");
  } catch {
    nightlyRef = null;
  }
  let nightlyCommit = null;
  if (nightlyRef?.object?.sha) {
    try {
      nightlyCommit = ghApiJson(repo, `commits/${encodeURIComponent(nightlyRef.object.sha)}`);
    } catch {
      nightlyCommit = null;
    }
  }
  state.nightly.revision = validateNightlyRevision(candidate, nightlyRef, nightlyCommit);
  if (state.nightly.revision.nightlySha) {
    let nightlyChecks = null;
    try {
      nightlyChecks = ghApiJson(
        repo,
        `commits/${encodeURIComponent(state.nightly.revision.nightlySha)}/check-runs`,
      );
    } catch {
      nightlyChecks = null;
    }
    const run = nightlyChecks ? pickCheckRun(nightlyChecks, NIGHTLY_CHECK.check) : null;
    state.nightly.run = run;
    if (run && run.status === "completed") {
      const runId = parseRunId(run.details_url);
      const artifacts =
        runId !== null ? artifactsFor(repo, runId) : { error: "run id not derivable" };
      const artifact = artifacts.artifacts?.find(
        (entry) => entry?.name === NIGHTLY_CHECK.reportsArtifact,
      );
      if (artifact && !artifact.expired) {
        try {
          state.nightly.evidence = readAcceptanceEvidence(
            ghApiBinary(artifact.archive_download_url),
          );
        } catch (error) {
          state.nightly.evidenceError = error.message;
        }
      } else {
        state.nightly.evidenceError = artifact?.expired
          ? `artifact ${NIGHTLY_CHECK.reportsArtifact} expired (7-day retention)`
          : `artifact ${NIGHTLY_CHECK.reportsArtifact} not present on run ${runId ?? "?"}`;
      }
    }
    state.nightly.grade = adjudicateNightlyRun({
      checkRun: run,
      evidence: state.nightly.evidence ?? undefined,
      evidenceError: state.nightly.evidenceError,
    });
  }

  // Boundary-probe pointer (read-only lookup of the latest completed run).
  try {
    const workflows = ghApiJson(repo, "actions/workflows");
    const probe = (workflows.workflows ?? []).find(
      (entry) => entry?.path === ".github/workflows/boundary-probe.yml",
    );
    if (probe?.id) {
      const runs = ghApiJson(repo, `actions/workflows/${probe.id}/runs?per_page=10`);
      const completed = (runs.workflow_runs ?? []).find(
        (entry) => entry?.status === "completed" && entry?.conclusion,
      );
      if (completed) {
        state.boundaryProbe = {
          url: completed.html_url ?? "",
          conclusion: String(completed.conclusion),
          completedAt: String(completed.updated_at ?? completed.run_started_at ?? ""),
        };
      }
    }
  } catch {
    state.boundaryProbe = null;
  }
  return state;
}

export function main(argv = process.argv.slice(2)) {
  let repo = "wvanderen/lem-reader";
  let shaArg = null;
  let outPath = "docs/verification/2026-11-18-284-acceptance-evidence.md";
  let jsonPath = null;
  let templateOnly = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--sha") shaArg = argv[(i += 1)];
    else if (arg === "--repo") repo = argv[(i += 1)];
    else if (arg === "--out") outPath = argv[(i += 1)];
    else if (arg === "--json") jsonPath = argv[(i += 1)];
    else if (arg === "--template-only") templateOnly = true;
    else if (arg === "--help" || arg === "-h") usage(0);
    else {
      console.error(`unknown argument: ${arg}`);
      usage(2);
    }
  }
  if (!shaArg && !templateOnly) usage(2);

  let state;
  if (templateOnly) {
    state = emptyCollectState();
  } else {
    try {
      state = collectState(repo, shaArg);
    } catch (error) {
      console.error(`✗ collection error: ${error.message}`);
      console.error(
        "  (read-only collection failed — treat the record as UNVERIFIED, never as passing)",
      );
      return 4;
    }
  }

  const target = resolve(outPath);
  let existing = null;
  try {
    existing = readFileSync(target, "utf8");
  } catch {
    existing = null;
  }
  const rendered = renderRecord(state);
  const carried = carryOverOwnerSections(existing, rendered);
  state.filledOwnerIds = carried.filledOwnerIds;
  // Re-render so the tool-computed missing list reflects carried sections.
  const finalText = carryOverOwnerSections(existing, renderRecord(state)).text;
  const missing = missingItems(state, carried.filledOwnerIds);

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, finalText);
  console.log(
    `acceptance record written: ${target} (${carried.filledOwnerIds.length} owner section(s) carried)`,
  );

  if (jsonPath) {
    const entry = {
      when: state.collectedAt || null,
      repo,
      sha: state.shaArg || null,
      resolvedSha: state.resolvedSha,
      prSuite: Object.fromEntries(
        PR_SUITE_CHECKS.map((check) => [
          check.check,
          {
            satisfied: state.prSuite[check.check].verdict.satisfied,
            consecutiveCollected: state.prSuite[check.check].verdict.consecutiveCollected,
            shaMismatch: state.prSuite[check.check].shaMismatch ?? false,
          },
        ]),
      ),
      nightly: {
        revisionOk: state.nightly.revision?.ok ?? false,
        grade: state.nightly.grade.grade,
      },
      missingCount: missing.length,
      missing,
    };
    const jsonTarget = resolve(jsonPath);
    mkdirSync(dirname(jsonTarget), { recursive: true });
    writeFileSync(jsonTarget, `${JSON.stringify(entry, null, 2)}\n`);
    console.log(`collection summary written: ${jsonPath}`);
  }

  if (missing.length > 0) {
    console.error("");
    console.error(`MISSING (${missing.length}) — the record is incomplete:`);
    for (const item of missing) console.error(`  [${item.who}] ${item.id}: ${item.why}`);
    console.error("");
    console.error(
      "Closing ticket #284 is NOT acceptance; owner items are filled by the owner-gated sequence (ops/lemcentre-runner/acceptance-checklist.md).",
    );
    return 1;
  }
  console.log("record complete — nothing missing (owner sections included).");
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
