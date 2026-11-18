// tests/unit/ops/recovery-constants.test.ts
// Issue #283 — the driver-plane recovery constants pairing: the stale-claim
// sweep (driver-process STALE_SECONDS), the safety-net sweep timer
// (OnUnitInactiveSec + AccuracySec) and the runner-side wrapper's wait
// deadline (factory-validate DEADLINE_SECONDS/POLL_SECONDS) must satisfy
// one invariant so a mid-job crash is reported to the waiting wrapper as a
// swept fail-closed verdict (exit 3) BEFORE its own deadline expires
// (exit 5): stale + timer + accuracy ≤ deadline − poll.
//
// ops/lemcentre-runner/recovery-constants.json is the recorded pairing
// record (#279/#280 coordination point); this spec pins every consumer of
// those constants — the bash sources, the unit files, and verify-recovery's
// own invariant check — to that record, so no consumer can drift alone.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const OPS = join(import.meta.dirname, "..", "..", "..", "ops", "lemcentre-runner");
const read = (name: string) => readFileSync(join(OPS, name), "utf8");
const record = JSON.parse(read("recovery-constants.json")) as {
  staleSeconds: number;
  deadlineSeconds: number;
  pollSeconds: number;
  sweepTimerSeconds: number;
  sweepAccuracySeconds: number;
  invariant: string;
};

describe("recovery-constants.json", () => {
  it("records positive integers for every recovery constant", () => {
    for (const key of [
      "staleSeconds",
      "deadlineSeconds",
      "pollSeconds",
      "sweepTimerSeconds",
      "sweepAccuracySeconds",
    ]) {
      expect(
        Number.isInteger(record[key as keyof typeof record]),
        `${key} must be an integer`,
      ).toBe(true);
      expect(record[key as keyof typeof record] as number).toBeGreaterThan(0);
    }
    expect(record.invariant).toMatch(
      /staleSeconds \+ sweepTimerSeconds \+ sweepAccuracySeconds <= deadlineSeconds - pollSeconds/,
    );
  });

  it("satisfies the sweep-before-deadline invariant", () => {
    const { staleSeconds, deadlineSeconds, pollSeconds, sweepTimerSeconds, sweepAccuracySeconds } =
      record;
    expect(staleSeconds + sweepTimerSeconds + sweepAccuracySeconds).toBeLessThanOrEqual(
      deadlineSeconds - pollSeconds,
    );
  });
});

describe("consumers of the recovery constants", () => {
  it("driver-process sweeps claims at staleSeconds", () => {
    expect(read("driver-process")).toMatch(
      new RegExp(`^STALE_SECONDS=${record.staleSeconds}$`, "m"),
    );
  });

  it("factory-validate waits at deadlineSeconds and polls at pollSeconds", () => {
    const wrapper = read("factory-validate");
    expect(wrapper).toMatch(new RegExp(`^POLL_SECONDS=${record.pollSeconds}$`, "m"));
    expect(wrapper).toMatch(new RegExp(`DEADLINE_SECONDS=${record.deadlineSeconds} `, "m"));
  });

  it("the sweep timer re-arms the driver plane within sweepTimerSeconds + accuracy", () => {
    const timer = read("factory-driver-sweep.timer");
    expect(timer).toMatch(
      new RegExp(`^OnUnitInactiveSec=${record.sweepTimerSeconds / 60}min$`, "m"),
    );
    expect(timer).toMatch(new RegExp(`^AccuracySec=${record.sweepAccuracySeconds / 60}min$`, "m"));
    expect(timer).toMatch(/^Unit=lemcentre-factory\.service$/m);
    expect(timer).toMatch(/^WantedBy=timers\.target$/m);
  });

  it("verify-recovery.sh re-checks the invariant from the INSTALLED artifacts", () => {
    const script = read("verify-recovery.sh");
    expect(script).toContain("STALE_SECONDS");
    expect(script).toContain("DEADLINE_SECONDS");
    expect(script).toContain("POLL_SECONDS");
    expect(script).toContain("OnUnitInactiveSec");
    // The invariant arithmetic must appear as an enforced check (a `fail`
    // on violation), not as documentation only.
    expect(script).toMatch(/fail "recovery-constants invariant VIOLATED/);
  });

  it("provision.sh recovery phase installs the sweep timer and the optional inhibitor", () => {
    const provision = read("provision.sh");
    expect(provision).toContain("factory-driver-sweep.timer");
    expect(provision).toContain("lemcentre-awake.service");
    expect(provision).toMatch(/recovery\) phase_recovery/);
    // The inhibitor is installed but deliberately NOT enabled by default
    // (the only `systemctl enable ... lemcentre-awake` line is the echoed
    // owner instruction, not an executed command).
    const recoverySection =
      provision.split(
        "# -------------------------------------------------------------- recovery",
      )[1] ?? "";
    const executed = recoverySection
      .split("\n")
      .filter((line) => !line.trim().startsWith("echo") && !line.trim().startsWith("#"))
      .join("\n");
    expect(executed).not.toMatch(/systemctl enable[^\n]*lemcentre-awake/);
    expect(recoverySection).toContain("systemctl enable --now lemcentre-factory-sweep.timer");
  });

  it("lemcentre-awake.service inhibits idle only (never shutdown or sleep)", () => {
    const unit = read("lemcentre-awake.service");
    expect(unit).toMatch(/--what=idle/);
    expect(unit).not.toMatch(/--what=(shutdown|sleep|idle:sleep|idle:shutdown)/);
    expect(unit).not.toMatch(/What=(shutdown|sleep)/);
    // Lifetime follows the runner unit, so maintenance stops release it.
    expect(unit).toMatch(/^(PartOf|BindsTo)=lemcentre-runner\.service$/m);
  });
});
