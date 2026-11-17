// tests/unit/ops/verify-enforcement.test.ts
// Issue #283 — the read-only GitHub enforcement verifier contract for the
// Lemcentre migration: BOTH enforcement layers (classic branch protection +
// repository rulesets) must keep the canonical required-check sets, admin
// bypass must stay in its recorded deliberate shape (classic bypass ON per
// lemfleet ADR-0012, no ruleset bypass actors), and every required check
// must map to a producing workflow job whose runs-on labels match today's
// producer set — `e2e-reference` is still the Mac's today, and flips to the
// Linux guest producer only with --expect-linux (post-cutover).
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANONICAL_CLASSIC_CONTEXTS,
  CANONICAL_RULESET_NAME,
  PRODUCER_EXPECTATIONS,
  analyzeEnforcement,
  mapWorkflows,
} from "../../../ops/lemcentre-runner/verify-enforcement.mjs";

const FIXTURE_WORKFLOWS = join(import.meta.dirname, "fixtures", "workflows");
const REPO_WORKFLOWS = join(import.meta.dirname, "..", "..", "..", ".github", "workflows");

function readWorkflowDir(dir: string): Record<string, string> {
  const texts: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".yml") || name.endsWith(".yaml")) {
      texts[name] = readFileSync(join(dir, name), "utf8");
    }
  }
  return texts;
}

function classicFixture(contexts: string[], enforceAdmins = false) {
  return {
    required_status_checks: { strict: false, contexts },
    enforce_admins: { enabled: enforceAdmins },
    required_pull_request_reviews: null,
    restrictions: null,
    allow_force_pushes: false,
    allow_deletions: false,
    required_linear_history: false,
    lock_branch: false,
  };
}

function rulesetListFixture() {
  return [
    {
      id: 24549266,
      name: "main guardrails",
      enforcement: "active",
      source: "wvanderen/lem-reader",
    },
  ];
}

function rulesetDetailFixture(contexts: string[], bypassActors: unknown[] = []) {
  // Live shape (observed 2026-11-17): the detail carries `bypass` (the
  // older `bypass_actors` key is also accepted by the analyzer).
  return {
    id: 24549266,
    name: "main guardrails",
    enforcement: "active",
    source: "wvanderen/lem-reader",
    rules: [
      {
        type: "required_status_checks",
        parameters: {
          strict: false,
          required_status_checks: contexts.map((context) => ({ context, integration_id: 15368 })),
        },
      },
    ],
    bypass: bypassActors,
  };
}

const canonicalInputs = () => ({
  classic: classicFixture([...CANONICAL_CLASSIC_CONTEXTS]),
  rulesetList: rulesetListFixture(),
  rulesetDetails: [
    { ruleset: CANONICAL_RULESET_NAME, detail: rulesetDetailFixture(["checks", "e2e-reference"]) },
  ],
});

describe("mapWorkflows", () => {
  it("maps every canonical required check to its producing workflow job", () => {
    const producers = mapWorkflows(readWorkflowDir(FIXTURE_WORKFLOWS));
    for (const check of CANONICAL_CLASSIC_CONTEXTS) {
      const matches = producers.filter((p) => p.check === check);
      expect(matches, `check ${check} must have exactly one producer`).toHaveLength(1);
      expect(matches[0]?.workflow).toMatch(/\.yml$/);
      expect(matches[0]?.runsOn.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("keeps matrix-qualified check names distinct from the canonical set", () => {
    const producers = mapWorkflows(readWorkflowDir(FIXTURE_WORKFLOWS));
    // evidence.yml's e2e matrix produces "e2e (chromium)" etc. — those are
    // nightly-ref-only checks and must never collide with `e2e-reference`.
    expect(producers.some((p) => p.check === "e2e (chromium)")).toBe(true);
    expect(producers.filter((p) => p.check === "e2e-reference")).toHaveLength(1);
  });

  it("maps the real repository workflows: e2e-reference is the Mac producer today", () => {
    const producers = mapWorkflows(readWorkflowDir(REPO_WORKFLOWS));
    const e2e = producers.find((p) => p.check === "e2e-reference");
    expect(e2e?.workflow).toBe("ci.yml");
    expect(e2e?.runsOn).toEqual(["self-hosted", "macOS", "reference"]);
    const factory = producers.find((p) => p.check === "factory-validation");
    expect(factory?.workflow).toBe("factory-validation.yml");
    expect(factory?.runsOn).toEqual(["self-hosted", "lemcentre"]);
    const checks = producers.find((p) => p.check === "checks");
    expect(checks?.workflow).toBe("ci.yml");
    expect(checks?.runsOn).toEqual(["ubuntu-latest"]);
  });
});

describe("analyzeEnforcement (canonical state)", () => {
  it("passes today's canonical state with the Mac producing e2e-reference", () => {
    const report = analyzeEnforcement({
      ...canonicalInputs(),
      producers: mapWorkflows(readWorkflowDir(REPO_WORKFLOWS)),
      expectLinux: false,
    });
    expect(report.findings.filter((f) => f.severity === "fail")).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.mapping["e2e-reference"]?.producer).toMatchObject({
      workflow: "ci.yml",
      runsOn: ["self-hosted", "macOS", "reference"],
    });
  });

  it("passes the post-cutover state only with expectLinux when e2e-reference runs on lemcentre", () => {
    const linuxInputs = canonicalInputs();
    const linuxProducers = mapWorkflows(readWorkflowDir(REPO_WORKFLOWS)).map((p) =>
      p.check === "e2e-reference" ? { ...p, runsOn: ["self-hosted", "lemcentre"] } : p,
    );
    // Without the flag the Linux producer is flagged (cutover not yet asserted).
    const preCutover = analyzeEnforcement({
      ...linuxInputs,
      producers: linuxProducers,
      expectLinux: false,
    });
    expect(preCutover.passed).toBe(false);
    expect(
      preCutover.findings.some(
        (f) => f.code === "producer-runs-on-mismatch" && f.check === "e2e-reference",
      ),
    ).toBe(true);
    const postCutover = analyzeEnforcement({
      ...linuxInputs,
      producers: linuxProducers,
      expectLinux: true,
    });
    expect(postCutover.passed).toBe(true);
  });
});

describe("analyzeEnforcement (enforcement-layer findings)", () => {
  it("fails when classic protection drops a canonical required check", () => {
    const report = analyzeEnforcement({
      ...canonicalInputs(),
      classic: classicFixture(["checks", "e2e-reference"]),
      producers: mapWorkflows(readWorkflowDir(REPO_WORKFLOWS)),
    });
    expect(report.passed).toBe(false);
    expect(
      report.findings.some(
        (f) => f.code === "classic-missing-context" && f.check === "factory-validation",
      ),
    ).toBe(true);
  });

  it("fails when classic protection requires a context no workflow produces", () => {
    const report = analyzeEnforcement({
      ...canonicalInputs(),
      classic: classicFixture([...CANONICAL_CLASSIC_CONTEXTS, "ghost-check"]),
      producers: mapWorkflows(readWorkflowDir(REPO_WORKFLOWS)),
    });
    expect(report.passed).toBe(false);
    expect(
      report.findings.some(
        (f) => f.code === "classic-check-no-producer" && f.check === "ghost-check",
      ),
    ).toBe(true);
  });

  it("fails when the main-guardrails ruleset is missing or inactive", () => {
    const missing = analyzeEnforcement({
      ...canonicalInputs(),
      rulesetList: [],
      rulesetDetails: [],
      producers: mapWorkflows(readWorkflowDir(REPO_WORKFLOWS)),
    });
    expect(missing.passed).toBe(false);
    expect(missing.findings.some((f) => f.code === "ruleset-missing")).toBe(true);

    const disabled = analyzeEnforcement({
      ...canonicalInputs(),
      rulesetList: [{ id: 1, name: CANONICAL_RULESET_NAME, enforcement: "disabled", source: "x" }],
      rulesetDetails: [],
      producers: mapWorkflows(readWorkflowDir(REPO_WORKFLOWS)),
    });
    expect(disabled.passed).toBe(false);
    expect(disabled.findings.some((f) => f.code === "ruleset-missing")).toBe(true);
  });

  it("fails when the ruleset weakens or extends its required set", () => {
    const weakened = analyzeEnforcement({
      ...canonicalInputs(),
      rulesetDetails: [
        { ruleset: CANONICAL_RULESET_NAME, detail: rulesetDetailFixture(["checks"]) },
      ],
      producers: mapWorkflows(readWorkflowDir(REPO_WORKFLOWS)),
    });
    expect(weakened.passed).toBe(false);
    expect(weakened.findings.some((f) => f.code === "ruleset-context-mismatch")).toBe(true);

    const extended = analyzeEnforcement({
      ...canonicalInputs(),
      rulesetDetails: [
        {
          ruleset: CANONICAL_RULESET_NAME,
          detail: rulesetDetailFixture(["checks", "e2e-reference", "factory-validation"]),
        },
      ],
      producers: mapWorkflows(readWorkflowDir(REPO_WORKFLOWS)),
    });
    expect(extended.passed).toBe(false);
    expect(extended.findings.some((f) => f.code === "ruleset-context-mismatch")).toBe(true);
  });

  it("fails on admin-bypass surprises in either layer", () => {
    const enforcedAdmins = analyzeEnforcement({
      ...canonicalInputs(),
      classic: classicFixture([...CANONICAL_CLASSIC_CONTEXTS], true),
      producers: mapWorkflows(readWorkflowDir(REPO_WORKFLOWS)),
    });
    expect(enforcedAdmins.passed).toBe(false);
    expect(enforcedAdmins.findings.some((f) => f.code === "admin-bypass-surprise")).toBe(true);

    const bypassActors = analyzeEnforcement({
      ...canonicalInputs(),
      rulesetDetails: [
        {
          ruleset: CANONICAL_RULESET_NAME,
          detail: rulesetDetailFixture(
            ["checks", "e2e-reference"],
            [{ actor_id: 1, bypass_mode: "always" }],
          ),
        },
      ],
      producers: mapWorkflows(readWorkflowDir(REPO_WORKFLOWS)),
    });
    expect(bypassActors.passed).toBe(false);
    expect(bypassActors.findings.some((f) => f.code === "admin-bypass-surprise")).toBe(true);
  });

  it("fails when two jobs produce the same required check name", () => {
    const producers = [
      ...mapWorkflows(readWorkflowDir(REPO_WORKFLOWS)),
      {
        check: "e2e-reference",
        workflow: "shadow.yml",
        job: "e2e-reference",
        runsOn: ["self-hosted", "lemcentre"],
      },
    ];
    const report = analyzeEnforcement({ ...canonicalInputs(), producers });
    expect(report.passed).toBe(false);
    expect(
      report.findings.some((f) => f.code === "duplicate-producer" && f.check === "e2e-reference"),
    ).toBe(true);
  });

  it("fails when factory-validation is not produced on the lemcentre runner", () => {
    const producers = mapWorkflows(readWorkflowDir(REPO_WORKFLOWS)).map((p) =>
      p.check === "factory-validation" ? { ...p, runsOn: ["ubuntu-latest"] } : p,
    );
    const report = analyzeEnforcement({ ...canonicalInputs(), producers });
    expect(report.passed).toBe(false);
    expect(
      report.findings.some(
        (f) => f.code === "producer-runs-on-mismatch" && f.check === "factory-validation",
      ),
    ).toBe(true);
  });

  it("documents the canonical expectations it asserts (producer table)", () => {
    expect(PRODUCER_EXPECTATIONS["e2e-reference"]?.mac).toEqual([
      "self-hosted",
      "macOS",
      "reference",
    ]);
    expect(PRODUCER_EXPECTATIONS["e2e-reference"]?.linuxMustInclude).toBe("lemcentre");
    expect(PRODUCER_EXPECTATIONS["factory-validation"]?.runsOn).toEqual([
      "self-hosted",
      "lemcentre",
    ]);
    expect(PRODUCER_EXPECTATIONS.checks?.runsOn).toEqual(["ubuntu-latest"]);
  });
});
