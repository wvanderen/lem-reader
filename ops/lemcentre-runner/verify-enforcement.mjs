#!/usr/bin/env node
// ops/lemcentre-runner/verify-enforcement.mjs — read-only GitHub enforcement
// verifier (issue #283, migration spec docs/specs/lemcentre-ci-migration.md).
//
// Lem Reader's main branch has TWO enforcement layers that both gate merges:
//   1. classic branch protection (required_status_checks.contexts =
//      checks + e2e-reference + factory-validation, admin bypass ON — the
//      deliberate lemfleet ADR-0012 state), and
//   2. the active repository ruleset "main guardrails"
//      (checks + e2e-reference, no bypass actors).
// A cutover or rollback that touches only one layer silently changes the
// real gate, so this script re-reads BOTH layers through `gh api`
// (read-only), asserts the canonical required sets, rejects admin-bypass
// surprises, and maps every required check to the workflow job that
// produces it plus its runs-on labels.
//
// Today `e2e-reference` is produced by the Mac reference runner
// ([self-hosted, macOS, reference]). After the Lemcentre cutover the SAME
// check name must be produced by the Linux guest job — assert that state
// with --expect-linux (the script then requires lemcentre labels and
// rejects macOS labels for e2e-reference). This script never edits
// anything; the rollback runbook (docs/specs/lemcentre-runner-rollback.md)
// owns the write commands.
//
// Usage (from a lem-reader checkout with gh authenticated, read-only):
//   node ops/lemcentre-runner/verify-enforcement.mjs [--expect-linux]
//        [--repo wvanderen/lem-reader] [--workflows <dir>] [--json <path>]
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

/** The canonical classic-protection required contexts (sorted for compare). */
export const CANONICAL_CLASSIC_CONTEXTS = ["checks", "e2e-reference", "factory-validation"];

/** The canonical active ruleset that must exist alongside classic protection. */
export const CANONICAL_RULESET_NAME = "main guardrails";

/** The canonical ruleset required contexts. */
export const CANONICAL_RULESET_CONTEXTS = ["checks", "e2e-reference"];

/**
 * Which workflow job must produce each required check, and on what runner.
 * `e2e-reference` has a producer expectation that flips at cutover; the
 * others are constant across the migration.
 */
export const PRODUCER_EXPECTATIONS = {
  "e2e-reference": {
    mac: ["self-hosted", "macOS", "reference"],
    linuxMustInclude: "lemcentre",
    linuxMustExclude: "macOS",
  },
  "factory-validation": { runsOn: ["self-hosted", "lemcentre"] },
  checks: { runsOn: ["ubuntu-latest"] },
};

/**
 * A producing job as discovered from .github/workflows
 * (see verify-enforcement.d.mts → WorkflowProducer).
 */
/**
 * Parse the workflow texts (basename → YAML text) into the list of
 * check-name producers. The check name a GitHub Actions job posts is the
 * job's `name` when set, else the job id (matrix jobs post qualified names
 * like "e2e (chromium)", which stay distinct entries).
 */
export function mapWorkflows(workflowTexts) {
  const producers = [];
  for (const [basename, text] of Object.entries(workflowTexts)) {
    let doc;
    try {
      doc = parseYaml(text);
    } catch (error) {
      throw new Error(`unparseable workflow ${basename}: ${error.message}`);
    }
    const jobs = doc?.jobs ?? {};
    for (const [jobId, job] of Object.entries(jobs)) {
      if (!job || typeof job !== "object" || !job["runs-on"]) continue;
      const runsOn = Array.isArray(job["runs-on"])
        ? job["runs-on"].map(String)
        : [String(job["runs-on"])];
      if (job.name) {
        producers.push({ check: String(job.name), workflow: basename, job: jobId, runsOn });
        continue;
      }
      // No explicit name: the check name is the job id — but a matrix job
      // posts one check per combination, qualified "job (value, value)"
      // (e.g. evidence.yml's `e2e (chromium)`). Model the qualified names so
      // they stay distinct from single-job checks like `e2e-reference`.
      const matrix = job.strategy?.matrix;
      const combos = matrixCombinations(matrix);
      if (combos) {
        for (const combo of combos) {
          producers.push({
            check: `${jobId} (${combo.join(", ")})`,
            workflow: basename,
            job: jobId,
            runsOn,
          });
        }
      } else {
        producers.push({ check: String(jobId), workflow: basename, job: jobId, runsOn });
      }
    }
  }
  return producers;
}

/** Expand a strategy.matrix into its value combinations (bounded; include/
 * exclude are ignored — the drill only needs the qualified name shapes). */
function matrixCombinations(matrix) {
  if (!matrix || typeof matrix !== "object") return null;
  const keys = Object.keys(matrix).filter((k) => !k.startsWith("include"));
  if (keys.length === 0) return null;
  let combos = [[]];
  for (const key of keys) {
    const values = matrix[key];
    if (!Array.isArray(values)) continue;
    combos = combos.flatMap((prefix) => values.slice(0, 12).map((v) => [...prefix, String(v)]));
    if (combos.length > 64) combos = combos.slice(0, 64);
  }
  return combos;
}

/**
 * Normalize a required_status_checks contexts field. The classic layer
 * returns plain strings; ruleset details return {context} objects.
 */
function contextsOf(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) =>
      typeof entry === "string" ? entry : entry && typeof entry === "object" ? entry.context : null,
    )
    .filter((c) => typeof c === "string")
    .sort();
}

function sameSet(actual, expected) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

/**
 * The pure verifier: given the gh api payloads (already parsed) and the
 * locally discovered producers, return a report with findings. `severity:
 * "fail"` findings make the script exit nonzero; "note" findings are
 * informational (e.g. matrix checks that are expected to exist).
 */
export function analyzeEnforcement({
  classic,
  rulesetList,
  rulesetDetails,
  producers,
  expectLinux = false,
}) {
  const findings = [];
  const fail = (code, message, extra = {}) =>
    findings.push({ severity: "fail", code, message, ...extra });
  const note = (code, message, extra = {}) =>
    findings.push({ severity: "note", code, message, ...extra });

  // ---- Layer 1: classic branch protection --------------------------------
  const classicContexts = contextsOf(classic?.required_status_checks?.contexts);
  for (const context of CANONICAL_CLASSIC_CONTEXTS) {
    if (!classicContexts.includes(context)) {
      fail("classic-missing-context", `classic protection no longer requires '${context}'`, {
        check: context,
      });
    }
  }
  for (const context of classicContexts) {
    if (!CANONICAL_CLASSIC_CONTEXTS.includes(context)) {
      fail("classic-unexpected-context", `classic protection requires unexpected '${context}'`, {
        check: context,
      });
    }
    if (!producers.some((p) => p.check === context)) {
      // A required context nothing produces pends forever — the worst
      // silent state a botched cutover/rollback can leave behind.
      fail(
        "classic-check-no-producer",
        `required check '${context}' has no producing workflow job locally`,
        { check: context },
      );
    }
  }
  if (classic?.required_status_checks && classic.required_status_checks.strict === true) {
    note("classic-strict", "classic protection requires strict up-to-date branches before merge");
  }

  // Admin bypass is deliberately ON in the classic layer (ADR-0012: the
  // owner merges own PRs through admin bypass). A change in either layer's
  // bypass shape is a surprise worth failing on: rollback and cutover both
  // assume the recorded state.
  if (classic?.enforce_admins?.enabled !== false) {
    fail(
      "admin-bypass-surprise",
      `classic enforce_admins.enabled is ${classic?.enforce_admins?.enabled}, expected false (admin bypass deliberately on — lemfleet ADR-0012)`,
    );
  }

  // ---- Layer 2: repository rulesets ---------------------------------------
  const active = (rulesetList ?? []).filter((r) => r && r.enforcement === "active");
  const guardrails = active.filter((r) => r.name === CANONICAL_RULESET_NAME);
  if (guardrails.length === 0) {
    fail(
      "ruleset-missing",
      `no ACTIVE ruleset named '${CANONICAL_RULESET_NAME}' (checks + e2e-reference layer)`,
    );
  }
  for (const ruleset of guardrails) {
    const detail = (rulesetDetails ?? []).find((d) => d.ruleset === ruleset.name)?.detail;
    if (!detail) continue; // fetch failure already reported by the CLI layer
    const rule = (detail.rules ?? []).find((r) => r.type === "required_status_checks");
    const contexts = contextsOf(
      rule?.parameters?.required_status_checks ?? rule?.parameters?.contexts,
    );
    if (!sameSet(contexts, CANONICAL_RULESET_CONTEXTS)) {
      fail(
        "ruleset-context-mismatch",
        `ruleset '${ruleset.name}' requires [${contexts.join(", ")}], expected [${CANONICAL_RULESET_CONTEXTS.join(", ")}]`,
        { ruleset: ruleset.name },
      );
    }
    if (
      Array.isArray(detail.bypass_actors ?? detail.bypass) &&
      (detail.bypass_actors ?? detail.bypass).length > 0
    ) {
      fail(
        "admin-bypass-surprise",
        `ruleset '${ruleset.name}' has ${(detail.bypass_actors ?? detail.bypass).length} bypass actor(s); none were recorded`,
        { ruleset: ruleset.name },
      );
    }
  }
  // Any OTHER active ruleset requiring status checks must not require a
  // context the classic layer lacks (that would be a second, invisible gate
  // with no reviewed producer set).
  for (const ruleset of active.filter((r) => r.name !== CANONICAL_RULESET_NAME)) {
    const detail = (rulesetDetails ?? []).find((d) => d.ruleset === ruleset.name)?.detail;
    const rule = (detail?.rules ?? []).find((r) => r.type === "required_status_checks");
    if (!rule) continue;
    const contexts = contextsOf(
      rule.parameters?.required_status_checks ?? rule.parameters?.contexts,
    );
    for (const context of contexts) {
      if (!CANONICAL_CLASSIC_CONTEXTS.includes(context)) {
        fail(
          "ruleset-unexpected-required",
          `ruleset '${ruleset.name}' requires '${context}' which the classic layer does not — unreviewed second gate`,
          { ruleset: ruleset.name, check: context },
        );
      }
    }
  }

  // Ruleset details actually fetched (the list endpoint omits `rules`, so
  // the CLI fetches every active ruleset's detail; tests inject them).
  const detailsFetched = (rulesetDetails ?? []).filter((d) => d.detail);

  // ---- Check → producer mapping ------------------------------------------
  const mapping = {};
  const byCheck = new Map();
  for (const producer of producers) {
    const list = byCheck.get(producer.check) ?? [];
    list.push(producer);
    byCheck.set(producer.check, list);
  }
  for (const check of CANONICAL_CLASSIC_CONTEXTS) {
    const list = byCheck.get(check) ?? [];
    if (list.length === 0) {
      mapping[check] = { producer: null, expectation: PRODUCER_EXPECTATIONS[check] ?? null };
      continue;
    }
    if (list.length > 1) {
      fail(
        "duplicate-producer",
        `check '${check}' is produced by ${list.length} jobs (${list.map((p) => `${p.workflow}:${p.job}`).join(", ")}) — routing is ambiguous`,
        { check },
      );
    }
    const producer = list[0];
    mapping[check] = { producer, expectation: PRODUCER_EXPECTATIONS[check] ?? null };
    const expectation = PRODUCER_EXPECTATIONS[check];
    if (!expectation) continue;
    if (check === "e2e-reference") {
      const ok = expectLinux
        ? producer.runsOn.includes(expectation.linuxMustInclude) &&
          !producer.runsOn.includes(expectation.linuxMustExclude)
        : JSON.stringify(producer.runsOn) === JSON.stringify(expectation.mac);
      if (!ok) {
        fail(
          "producer-runs-on-mismatch",
          expectLinux
            ? `'e2e-reference' must run on the Linux guest (include '${expectation.linuxMustInclude}', no '${expectation.linuxMustExclude}'); found [${producer.runsOn.join(", ")}] in ${producer.workflow}`
            : `'e2e-reference' must still be the Mac producer ${expectation.mac.join(", ")} (pre-cutover); found [${producer.runsOn.join(", ")}] in ${producer.workflow}`,
          { check },
        );
      }
    } else if (JSON.stringify(producer.runsOn) !== JSON.stringify(expectation.runsOn)) {
      fail(
        "producer-runs-on-mismatch",
        `'${check}' must run on [${expectation.runsOn.join(", ")}]; found [${producer.runsOn.join(", ")}] in ${producer.workflow}`,
        { check },
      );
    }
  }

  return {
    mode: expectLinux ? "expect-linux (post-cutover)" : "pre-cutover (Mac produces e2e-reference)",
    layers: {
      classic: { contexts: classicContexts, enforceAdmins: classic?.enforce_admins?.enabled },
      rulesets: detailsFetched.map((d) => ({
        ruleset: d.ruleset,
        contexts: contextsOf(
          (d.detail?.rules ?? []).find((r) => r.type === "required_status_checks")?.parameters
            ?.required_status_checks,
        ),
        bypassActors: d.detail?.bypass_actors ?? d.detail?.bypass ?? null,
      })),
    },
    mapping,
    findings,
    passed: findings.every((f) => f.severity !== "fail"),
  };
}

// ---------------------------------------------------------------- CLI ------

function usage(exitCode) {
  console.log(`usage: verify-enforcement.mjs [options]

  --expect-linux      assert the POST-cutover producer for e2e-reference
                      (lemcentre labels, no macOS); default asserts today's
                      Mac producer [self-hosted, macOS, reference]
  --repo SLUG         repository (default wvanderen/lem-reader)
  --workflows DIR     workflows dir (default <repo checkout>/.github/workflows)
  --json PATH         also write the full report as JSON

Read-only: only gh api GET requests are issued. Nonzero exit means an
enforcement finding (or a read failure — treat that as unverifiable).`);
  process.exit(exitCode);
}

function ghApi(repo, path) {
  const result = spawnSync("gh", ["api", `repos/${repo}/${path}`], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `gh api ${path} failed (${result.status}): ${result.stderr?.trim() || "no stderr"}`,
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`gh api ${path} returned unparseable output: ${error.message}`);
  }
}

export function defaultWorkflowsDir() {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", ".github", "workflows");
}

export function main(argv = process.argv.slice(2)) {
  let repo = "wvanderen/lem-reader";
  let workflowsDir = defaultWorkflowsDir();
  let expectLinux = false;
  let jsonPath = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--expect-linux") expectLinux = true;
    else if (arg === "--repo") repo = argv[(i += 1)];
    else if (arg === "--workflows") workflowsDir = argv[(i += 1)];
    else if (arg === "--json") jsonPath = argv[(i += 1)];
    else if (arg === "--help" || arg === "-h") usage(0);
    else {
      console.error(`unknown argument: ${arg}`);
      usage(2);
    }
  }

  const workflowTexts = {};
  for (const name of readdirSync(workflowsDir)) {
    if (name.endsWith(".yml") || name.endsWith(".yaml")) {
      workflowTexts[name] = readFileSync(join(workflowsDir, name), "utf8");
    }
  }
  const producers = mapWorkflows(workflowTexts);

  let classic;
  let rulesetList;
  let rulesetDetails = [];
  try {
    classic = ghApi(repo, "branches/main/protection");
    rulesetList = ghApi(repo, "rulesets");
    // The list endpoint omits `rules` — fetch every ACTIVE ruleset's detail
    // so both layers' parameters are actually inspected.
    for (const ruleset of rulesetList.filter((r) => r?.enforcement === "active")) {
      const detail = ghApi(repo, `rulesets/${ruleset.id}`);
      rulesetDetails.push({ ruleset: ruleset.name, detail });
    }
  } catch (error) {
    console.error(`✗ cannot read enforcement state: ${error.message}`);
    console.error(
      "  (read-only verification failed — treat enforcement as UNVERIFIED, never as passing)",
    );
    return 4;
  }

  const report = analyzeEnforcement({
    classic,
    rulesetList,
    rulesetDetails,
    producers,
    expectLinux,
  });

  console.log(`Enforcement verification — ${repo} (${report.mode})`);
  console.log(
    `  classic required: [${report.layers.classic.contexts.join(", ")}]  admin bypass ${
      report.layers.classic.enforceAdmins === false
        ? "ON (deliberate)"
        : String(report.layers.classic.enforceAdmins)
    }`,
  );
  for (const ruleset of report.layers.rulesets) {
    console.log(
      `  ruleset '${ruleset.ruleset}': [${ruleset.contexts.join(", ")}]  bypass actors: ${ruleset.bypassActors?.length ?? "?"}`,
    );
  }
  for (const [check, entry] of Object.entries(report.mapping)) {
    const p = entry.producer;
    console.log(
      `  ${check} ← ${p ? `${p.workflow} → [${p.runsOn.join(", ")}]` : "NO LOCAL PRODUCER"}`,
    );
  }
  for (const finding of report.findings) {
    console.log(
      `${finding.severity === "fail" ? "FAIL " : "note "} ${finding.code}: ${finding.message}`,
    );
  }

  if (jsonPath) {
    const entry = { when: new Date().toISOString(), repo, expectLinux, ...report };
    mkdirSync(dirname(resolve(jsonPath)), { recursive: true });
    writeFileSync(jsonPath, `${JSON.stringify(entry, null, 2)}\n`);
    console.log(`report written: ${jsonPath}`);
  }

  console.log(report.passed ? "enforcement layers hold" : "ENFORCEMENT FINDINGS — see above");
  return report.passed ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
