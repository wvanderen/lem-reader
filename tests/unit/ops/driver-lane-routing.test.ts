// tests/unit/ops/driver-lane-routing.test.ts
// Issue #282 (lane routing) — the driver plane's optional `lane` spool
// envelope key: strict fail-closed validation (absent = the unit lane,
// byte-identical legacy behavior; otherwise EXACTLY one of the reviewed
// lanes), routing of the browser lanes to the pinned browser entry
// (proof/f4a/browser_ci.py — the invocation each trusted lemfleet
// launcher's --direct path makes), the diagnostics sidecar hand-off for
// routed lanes, and the lane-aware stale-claim sweep (nightly claims sweep
// at NIGHTLY_STALE_SECONDS, everything else at STALE_SECONDS).
//
// The spec EXECUTES ops/lemcentre-runner/driver-process against fakes: a
// test-local copy with the trusted absolute paths swapped for temp dirs
// (a test-only transform — the reviewed source keeps its hardcoded
// control-plane paths; only the constant assignments are rewritten). The
// unit-check environments (ubuntu-latest, the factory Ubuntu guest, the
// dev Linux box) provide bash + python3, the same availability argument
// as guest-diagnostics-bundle.test.ts.
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const source = join(repoRoot, "ops", "lemcentre-runner", "driver-process");

const HEAD = "a".repeat(40);
const ID = "0123456789abcdef0123456789abcdef";

const roots: string[] = [];

function makeRoot(): string {
  const root = join(tmpdir(), `lem-lane-routing-${process.pid}-${roots.length}-`);
  mkdirSync(root);
  roots.push(root);
  return root;
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A driver-process copy with the trusted control-plane constants
 * rewritten to this test's fakes. Only whole-assignment lines (and the
 * checkout-prefix string inside the validation heredoc) are replaced —
 * everything else, including the fail-closed logic under test, is the
 * reviewed source verbatim. */
function makeDriver(root: ReturnType<typeof makeFakes>): string {
  let text = readFileSync(source, "utf8");
  const swaps: Array<[RegExp, string]> = [
    [/^JOBS=".*"$/m, `JOBS="${root.spool}"`],
    [/^INNER=".*"$/m, `INNER="${root.inner}"`],
    [/^FLEET=".*"$/m, `FLEET="${root.fleet}"`],
    [/^EVIDENCE_ROOT=".*"$/m, `EVIDENCE_ROOT="${root.evidence}"`],
    [/^BROWSER_CI=".*"$/m, `BROWSER_CI="${root.browserCi}"`],
    [/^PIN_FILE=".*"$/m, `PIN_FILE="${root.pinFile}"`],
    [/^RECEIPT=".*"$/m, `RECEIPT="${root.receipt}"`],
    [/^SCRATCH=".*"$/m, `SCRATCH="${root.scratch}"`],
    [/^BROWSER_IMAGE=".*"$/m, `BROWSER_IMAGE="${root.image}"`],
    [/^LEASE_FILE=".*"$/m, `LEASE_FILE="${root.leaseFile}"`],
    [/\/var\/lib\/lem-ci\/runner-work\//g, `${root.runnerWork}/`],
  ];
  for (const [pattern, replacement] of swaps) {
    text = text.replace(pattern, replacement);
  }
  const driver = join(root.base, "driver-process");
  writeFileSync(driver, text, { mode: 0o755 });
  return driver;
}

interface Fakes {
  base: string;
  spool: string;
  fleet: string;
  evidence: string;
  scratch: string;
  runnerWork: string;
  checkout: string;
  inner: string;
  browserCi: string;
  pinFile: string;
  receipt: string;
  image: string;
  leaseFile: string;
  innerLog: string;
  browserLog: string;
  stageLog: string;
  sidecarValid: string;
  innerExit: string;
  browserExit: string;
}

function makeFakes(): Fakes {
  const base = makeRoot();
  const fakes = {
    base,
    spool: join(base, "spool"),
    fleet: join(base, "fleet"),
    evidence: join(base, "evidence"),
    scratch: join(base, "scratch"),
    runnerWork: join(base, "runner-work"),
    checkout: "",
    inner: join(base, "inner"),
    browserCi: join(base, "fleet", "proof", "f4a", "browser_ci.py"),
    pinFile: join(base, "lemfleet-rev"),
    receipt: join(base, "browser-guest-env.json"),
    image: join(base, "browser-base.qcow2"),
    leaseFile: join(base, "heavy-test.lease.json"),
    innerLog: join(base, "inner.log"),
    browserLog: join(base, "browser.log"),
    stageLog: join(base, "stage.log"),
    sidecarValid: join(base, "sidecar-valid"),
    innerExit: join(base, "inner.exit"),
    browserExit: join(base, "browser.exit"),
  } as Fakes;
  for (const dir of [
    fakes.spool,
    fakes.evidence,
    fakes.scratch,
    fakes.runnerWork,
    dirname(fakes.browserCi),
  ]) {
    mkdirSync(dir, { recursive: true });
  }
  fakes.checkout = join(fakes.runnerWork, "pr-1");
  mkdirSync(fakes.checkout);
  // The checkout's recorded pin JSON path (the browser entry's --pin).
  mkdirSync(join(fakes.checkout, "ops/lemcentre-runner/browser-guest"), { recursive: true });
  writeFileSync(
    join(fakes.checkout, "ops/lemcentre-runner/browser-guest/environment-pin.json"),
    "{}\n",
  );

  writeFileSync(
    fakes.inner,
    `#!/usr/bin/env python3
import json, sys
with open(${JSON.stringify(fakes.innerLog)}, "a") as handle:
    handle.write(json.dumps(sys.argv[1:]) + "\\n")
code = 0
try:
    code = int(open(${JSON.stringify(fakes.innerExit)}).read().strip())
except OSError:
    pass
raise SystemExit(code)
`,
  );
  chmodSync(fakes.inner, 0o755);
  // The pinned browser entry fake: python (the driver invokes it through
  // /usr/bin/python3 -B), logs argv + the scrubbed environment it saw.
  writeFileSync(
    fakes.browserCi,
    `import json, os, sys
with open(${JSON.stringify(fakes.browserLog)}, "a") as sink:
    sink.write(json.dumps({"argv": sys.argv[1:], "env": dict(os.environ)}) + "\\n")
raise SystemExit(int(open(${JSON.stringify(fakes.browserExit)}).read().strip() if
                   os.path.exists(${JSON.stringify(fakes.browserExit)}) else 0))
`,
  );
  // The envelope tool fake: stage writes the sink sidecar; validate-sidecar's
  // verdict is controlled by the sidecar-valid flag file.
  writeFileSync(
    join(fakes.fleet, "proof", "f4a", "envelope.py"),
    `import json, os, sys
if sys.argv[1:2] == ["stage"]:
    sink = sys.argv[sys.argv.index("--sink") + 1]
    os.makedirs(os.path.dirname(sink), exist_ok=True)
    with open(sink, "w") as handle:
        handle.write(json.dumps({"v": 1, "bundle": "/x", "receipt": "/y",
                                 "bytes": 1, "sha256": "0" * 64}) + "\\n")
    with open(${JSON.stringify(fakes.stageLog)}, "a") as handle:
        handle.write(sink + "\\n")
invalid = os.path.exists(${JSON.stringify(fakes.sidecarValid)}) and \\
    open(${JSON.stringify(fakes.sidecarValid)}).read().strip() == "invalid"
raise SystemExit(1 if invalid else 0)
`,
  );
  return fakes;
}

interface Envelope {
  lane?: string;
  diagnostics?: boolean;
}

function enqueue(spool: string, envelope: Envelope): string {
  const id = ID;
  const body = {
    id,
    head: HEAD,
    checkout: join(spool, "..", "runner-work", "pr-1"),
    ...(envelope.lane === undefined ? {} : { lane: envelope.lane }),
    ...(envelope.diagnostics === undefined ? {} : { diagnostics: envelope.diagnostics }),
  };
  const job = join(spool, `${id}.job`);
  writeFileSync(job, `${JSON.stringify(body)}\n`);
  return job;
}

function run(driver: string) {
  return spawnSync("bash", [driver], { encoding: "utf8", timeout: 60_000 });
}

function result(spool: string): number | undefined {
  const path = join(spool, `${ID}.result`);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")).exit as number;
}

function logLines(path: string): unknown[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

beforeAll(() => {
  expect(existsSync(source), "driver-process must exist in ops/").toBe(true);
});

describe("driver-process lane routing (issue #282)", () => {
  test("absent lane stays the byte-identical unit path: INNER with the legacy arguments", () => {
    const fakes = makeFakes();
    enqueue(fakes.spool, {});
    const runResult = run(makeDriver(fakes));
    expect(runResult.status, runResult.stderr).toBe(0);
    expect(result(fakes.spool)).toBe(0);
    const calls = logLines(fakes.innerLog) as string[][];
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([HEAD, fakes.checkout]);
    // no browser entry, no sidecar staging
    expect(existsSync(fakes.browserLog)).toBe(false);
    expect(existsSync(fakes.stageLog)).toBe(false);
  });

  test("explicit unit lane behaves identically to the absent legacy envelope", () => {
    const fakes = makeFakes();
    enqueue(fakes.spool, { lane: "unit" });
    run(makeDriver(fakes));
    expect(result(fakes.spool)).toBe(0);
    const calls = logLines(fakes.innerLog) as string[][];
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([HEAD, fakes.checkout]);
    expect(existsSync(fakes.browserLog)).toBe(false);
  });

  test("absent lane with diagnostics threads the #279 flag pair to INNER", () => {
    const fakes = makeFakes();
    enqueue(fakes.spool, { diagnostics: true });
    run(makeDriver(fakes));
    expect(logLines(fakes.innerLog)[0]).toEqual([
      HEAD,
      fakes.checkout,
      "--diagnostics",
      "--artifact-sink",
      join(fakes.spool, `${ID}.artifacts`),
    ]);
  });

  test.each([
    ["browser-smoke", "smoke", false],
    ["browser-suite", "pr", true],
    ["browser-nightly", "nightly", true],
  ] as const)(
    "%s routes to the pinned browser entry with its launcher's --direct invocation",
    (lane, mode, heavy) => {
      const fakes = makeFakes();
      enqueue(fakes.spool, { lane });
      const runResult = run(makeDriver(fakes));
      expect(runResult.status, runResult.stderr).toBe(0);
      expect(result(fakes.spool)).toBe(0);
      expect(existsSync(fakes.innerLog)).toBe(false); // INNER never runs for browser lanes
      const calls = logLines(fakes.browserLog) as Array<{
        argv: string[];
        env: Record<string, string>;
      }>;
      expect(calls).toHaveLength(1);
      const entry = calls[0]!;
      const args = entry.argv;
      expect(args.slice(0, 9)).toEqual([
        "--head",
        HEAD,
        "--checkout",
        fakes.checkout,
        "--scratch",
        fakes.scratch,
        "--mode",
        mode,
        "--pin",
      ]);
      expect(entry.argv).toContain(
        join(fakes.checkout, "ops/lemcentre-runner/browser-guest/environment-pin.json"),
      );
      expect(entry.argv).toContain("--lemfleet-rev");
      expect(entry.argv).toContain(fakes.pinFile);
      expect(entry.argv).toContain(fakes.receipt);
      expect(entry.argv).toContain(fakes.image);
      const has = (flag: string) => args.includes(flag);
      expect(has("--lease-required")).toBe(heavy);
      expect(has("--lease-file")).toBe(heavy);
      if (heavy) expect(args[args.indexOf("--lease-file") + 1]).toBe(fakes.leaseFile);
      expect(has("--diagnostics")).toBe(heavy);
      // The scrubbed environment: exactly HOME/LC_ALL/PATH, nothing ambient.
      const seen = entry.env;
      expect(Object.keys(seen).sort()).toEqual(["HOME", "LC_ALL", "PATH"]);
      expect(seen.HOME).toBe(fakes.scratch);
      // Diagnostics lanes hand the bundle pointer to the spool sidecar.
      expect(existsSync(fakes.stageLog)).toBe(heavy);
      if (heavy) {
        expect(readFileSync(fakes.stageLog, "utf8")).toContain(
          join(fakes.spool, `${ID}.artifacts`),
        );
      }
    },
  );

  test("browser-lane verdicts propagate unchanged (33 provisioning, 8 the gate)", () => {
    for (const exit of [33, 8, 2]) {
      const fakes = makeFakes();
      writeFileSync(fakes.browserExit, `${exit}\n`);
      enqueue(fakes.spool, { lane: "browser-nightly" });
      run(makeDriver(fakes));
      expect(result(fakes.spool)).toBe(exit);
    }
  });

  test.each([
    ["an unknown lane name", { lane: "browser-diagnostics" }],
    ["a non-string lane", { lane: 5 }],
    ["an empty lane string", { lane: "" }],
    ["lane with diagnostics not exactly true", { lane: "browser-suite", diagnostics: "yes" }],
  ])("refuses %s fail-closed: exit 3, nothing executed", (_name, envelope) => {
    const fakes = makeFakes();
    enqueue(fakes.spool, envelope as Envelope);
    const runResult = run(makeDriver(fakes));
    expect(runResult.status).toBe(0); // the driver itself always exits 0
    expect(result(fakes.spool)).toBe(3);
    expect(existsSync(fakes.innerLog)).toBe(false);
    expect(existsSync(fakes.browserLog)).toBe(false);
    expect(runResult.stderr).toMatch(/refused malformed envelope/);
  });

  test("a failed sidecar validation drops the diagnostics but never the verdict", () => {
    const fakes = makeFakes();
    writeFileSync(fakes.sidecarValid, "invalid\n");
    enqueue(fakes.spool, { lane: "browser-suite" });
    const runResult = run(makeDriver(fakes));
    expect(runResult.status).toBe(0);
    expect(result(fakes.spool)).toBe(0);
    expect(existsSync(join(fakes.spool, `${ID}.artifacts`))).toBe(false);
    expect(runResult.stderr).toMatch(/sidecar.*failed validation/);
  });
});

describe("driver-process lane-aware stale sweep (issue #282)", () => {
  const now = Date.now() / 1000;

  function claim(root: Fakes, lane: string | null, ageSeconds: number): string {
    const id = `f${Math.floor(Math.random() * 1e9)
      .toString(16)
      .padStart(8, "0")}`;
    const running = join(root.spool, `${id}.running`);
    writeFileSync(
      running,
      `${JSON.stringify({
        id,
        head: HEAD,
        checkout: join(root.runnerWork, "pr-1"),
        ...(lane ? { lane } : {}),
      })}\n`,
    );
    utimesSync(running, now - ageSeconds, now - ageSeconds);
    return id;
  }

  test("a nightly claim older than STALE_SECONDS but younger than NIGHTLY_STALE_SECONDS survives", () => {
    const fakes = makeFakes();
    const id = claim(fakes, "browser-nightly", 5000); // > 4500, < 11700
    run(makeDriver(fakes));
    // not swept: the phase may be legitimately running (vm guard 11400 s)
    expect(existsSync(join(fakes.spool, `${id}.running`))).toBe(true);
    expect(existsSync(join(fakes.spool, `${id}.result`))).toBe(false);
  });

  test("a nightly claim older than NIGHTLY_STALE_SECONDS is swept to exit 3", () => {
    const fakes = makeFakes();
    const id = claim(fakes, "browser-nightly", 11760);
    run(makeDriver(fakes));
    expect(existsSync(join(fakes.spool, `${id}.running`))).toBe(false);
    expect(JSON.parse(readFileSync(join(fakes.spool, `${id}.result`), "utf8")).exit).toBe(3);
  });

  test("non-nightly claims keep sweeping at STALE_SECONDS (absent lane included)", () => {
    for (const lane of [null, "unit", "browser-suite"]) {
      const fakes = makeFakes();
      const id = claim(fakes, lane, 4600);
      run(makeDriver(fakes));
      expect(existsSync(join(fakes.spool, `${id}.running`)), `lane=${lane}`).toBe(false);
      expect(JSON.parse(readFileSync(join(fakes.spool, `${id}.result`), "utf8")).exit).toBe(3);
    }
  });

  test("an unreadable (corrupt) claim sweeps at the LONGEST bound, never the unit bound", () => {
    // Honesty rule: lane_of must not guess "unit" for a claim it cannot
    // read — a corrupt browser-nightly claim swept at 4500 s would kill
    // possibly-live nightly work and false-red the lane. An unreadable
    // claim is treated as the worst case (nightly) and logged loudly.
    const fakes = makeFakes();
    const id = `c${Math.floor(Math.random() * 1e6).toString(16)}`;
    const running = join(fakes.spool, `${id}.running`);
    writeFileSync(running, "{not json at all\n");
    const aged = Date.now() / 1000 - 5000; // > STALE_SECONDS, < NIGHTLY_STALE_SECONDS
    utimesSync(running, aged, aged);
    const runResult = run(makeDriver(fakes));
    expect(runResult.status, runResult.stderr).toBe(0);
    expect(existsSync(join(fakes.spool, `${id}.running`))).toBe(true);
    expect(existsSync(join(fakes.spool, `${id}.result`))).toBe(false);
    expect(runResult.stderr).toMatch(/corrupt/i);
  });

  test("a corrupt claim older than NIGHTLY_STALE_SECONDS is swept to exit 3", () => {
    const fakes = makeFakes();
    const id = `c${Math.floor(Math.random() * 1e6).toString(16)}`;
    const running = join(fakes.spool, `${id}.running`);
    writeFileSync(running, "\x00\x01garbage\n");
    const aged = Date.now() / 1000 - 11760;
    utimesSync(running, aged, aged);
    const runResult = run(makeDriver(fakes));
    expect(runResult.status).toBe(0);
    expect(existsSync(join(fakes.spool, `${id}.running`))).toBe(false);
    expect(JSON.parse(readFileSync(join(fakes.spool, `${id}.result`), "utf8")).exit).toBe(3);
    expect(runResult.stderr).toMatch(/corrupt/i);
  });
});

describe("wrapper lane threading (factory-validate / factory-validate-inner)", () => {
  const wrapper = readFileSync(
    join(repoRoot, "ops", "lemcentre-runner", "factory-validate"),
    "utf8",
  );
  const inner = readFileSync(
    join(repoRoot, "ops", "lemcentre-runner", "factory-validate-inner"),
    "utf8",
  );
  const driverText = readFileSync(source, "utf8");

  test("the allowed lane set is one reviewed list, identical in all three wrappers", () => {
    const allowed = "unit browser-smoke browser-suite browser-nightly";
    // factory-validate and factory-validate-inner carry the space-separated
    // list; driver-process carries the same set as the python tuple below.
    for (const [name, text] of [
      ["factory-validate", wrapper],
      ["factory-validate-inner", inner],
    ] as const) {
      expect(text, name).toContain(allowed);
    }
    // The driver's fail-closed check is the tuple membership, not a regex.
    expect(driverText).toMatch(
      /ALLOWED_LANES = \("unit", "browser-smoke", "browser-suite", "browser-nightly"\)/,
    );
  });

  test("factory-validate writes the lane key only when passed (legacy envelope byte-identical)", () => {
    // The legacy shape (no --lane) must keep producing the exact
    // three-field envelope of #277 — asserted literally.
    expect(wrapper).toContain(`printf '{"id": "%s", "head": "%s", "checkout": "%s"}\\n'`);
    expect(wrapper).toContain(
      `printf '{"id": "%s", "head": "%s", "checkout": "%s", "lane": "%s"}\\n'`,
    );
    expect(wrapper).toMatch(/unknown lane/);
  });

  test("factory-validate-inner accepts --lane but refuses browser lanes (routing is upstream)", () => {
    expect(inner).toMatch(/--lane\) LANE=/);
    expect(inner).toMatch(/routed by driver-process to the browser entry/);
    expect(inner).toMatch(/unknown lane/);
  });

  test("the nightly sweep pairing is recorded and satisfies the lane invariant", () => {
    const record = JSON.parse(
      readFileSync(join(repoRoot, "ops", "lemcentre-runner", "recovery-constants.json"), "utf8"),
    ) as {
      sweepTimerSeconds: number;
      sweepAccuracySeconds: number;
      lanes: {
        nightlyStaleSeconds: number;
        nightlyPhaseWaitSeconds: number;
        nightlyPollSeconds: number;
      };
    };
    expect(driverText).toMatch(
      new RegExp(`^NIGHTLY_STALE_SECONDS=${record.lanes.nightlyStaleSeconds}$`, "m"),
    );
    expect(
      record.lanes.nightlyStaleSeconds + record.sweepTimerSeconds + record.sweepAccuracySeconds,
    ).toBeLessThanOrEqual(record.lanes.nightlyPhaseWaitSeconds - record.lanes.nightlyPollSeconds);
    // and above the longest legit nightly phase (the vm guard, lemfleet ADR-0015)
    expect(record.lanes.nightlyStaleSeconds).toBeGreaterThan(11400);
    // verify-recovery re-checks the lane pairing from installed artifacts
    const verify = readFileSync(
      join(repoRoot, "ops", "lemcentre-runner", "verify-recovery.sh"),
      "utf8",
    );
    expect(verify).toContain("NIGHTLY_STALE_SECONDS");
    expect(verify).toMatch(/nightly recovery-constants invariant VIOLATED/);
  });
});
