#!/usr/bin/env node
// ops/lemcentre-runner/acceptance-record.mjs — the acceptance record's
// PRESENTATION layer (issue #284; split out of acceptance-collect.mjs by
// the #305 review so the collector fetches/adjudicates and this module
// renders; docs/specs/lemcentre-acceptance.md stays the contract).
//
// Everything here is pure over an already-collected state: the record's
// contract constants (which checks and engines the record is about), the
// missing-items list, the markdown template with its explicit UNCOLLECTED
// placeholders, and the owner carry-over across collector re-runs. It
// performs no reads and never fabricates a value — the collector's
// emptyCollectState() is this module's template data shape.

import { NIGHTLY_ENGINES } from "./compare-nightly-shadow.mjs";
import { summarizeReport } from "../../scripts/summarize-e2e.mjs";

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
      lines.push(
        `Phase verdicts (verdicts/phases-contention.json — the lane-annotated copy; the guest's own verdicts/phases.json is uploaded byte-faithful beside it):`,
      );
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
