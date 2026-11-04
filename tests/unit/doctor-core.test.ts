// tests/unit/doctor-core.test.ts
// Issue #253 — the doctor's reporting contract. Launch-blocked engines must
// be distinguished from application/test failures, and PARTIAL engine success
// must never be reportable as complete verification: the doctor's summary and
// exit signal say "complete" only when every requested engine is ready on the
// requested lane. The classification itself is pinned against the real
// failure signatures observed on this machine (WebKit missing libicudata
// libraries; a Playwright install missing browser binaries).
import { describe, expect, test } from "vitest";
import {
  aggregateLane,
  classifyBrowserFailure,
  type EngineProbeResult,
} from "../../scripts/lib/doctor-core.mjs";

describe("classifyBrowserFailure — launch problems vs everything else", () => {
  test("a missing browser binary is not-installed, with the install fix", () => {
    const result = classifyBrowserFailure(
      "browserType.launch: Executable doesn't exist at /home/lem/.cache/ms-playwright/webkit-9999/pw_run.sh",
    );
    expect(result.kind).toBe("not-installed");
    expect(result.fix).toContain("npx playwright install");
  });

  test("the Playwright-just-installed-or-updated notice is not-installed", () => {
    const result = classifyBrowserFailure(
      "Looks like Playwright was just installed or updated. Please run the following command to download new browsers: npx playwright install",
    );
    expect(result.kind).toBe("not-installed");
  });

  test("missing OS shared libraries are launch-blocked, pointed at the container lane", () => {
    // The exact signature observed on this Omarchy box (2026-11-04):
    // MiniBrowser: error while loading shared libraries: libicudata.so.74
    const result = classifyBrowserFailure(
      "browserType.launch: Target page, context or browser has been closed. " +
        "[pid=3007785][err] MiniBrowser: error while loading shared libraries: " +
        "libicudata.so.74: cannot open shared object file: No such file or directory",
    );
    expect(result.kind).toBe("launch-blocked");
    expect(result.reason).toContain("system libraries");
    expect(result.fix).toContain("container");
  });

  test("Playwright's own missing-dependency notice is launch-blocked", () => {
    const result = classifyBrowserFailure(
      "Host system is missing dependencies to run browsers. Please install them with the following command",
    );
    expect(result.kind).toBe("launch-blocked");
    expect(result.reason).toContain("system libraries");
  });

  test("a bare launch crash without a recognizable cause is still launch-blocked, never app failure", () => {
    const result = classifyBrowserFailure(
      "browserType.launch: Target page, context or browser has been closed",
    );
    expect(result.kind).toBe("launch-blocked");
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test("a launch timeout is launch-blocked, not a test failure", () => {
    const result = classifyBrowserFailure("browserType.launch: Timeout 20000ms exceeded.");
    expect(result.kind).toBe("launch-blocked");
    expect(result.reason).toContain("timed out");
  });
});

describe("aggregateLane — partial success is not complete verification", () => {
  const ready = (engine: string): EngineProbeResult => ({ engine, ok: true, kind: "ready" });

  test("all requested engines ready → complete, exit 0", () => {
    const lane = aggregateLane("host", [ready("chromium"), ready("firefox")]);
    expect(lane.complete).toBe(true);
    expect(lane.exitCode).toBe(0);
  });

  test("one launch-blocked engine keeps the lane incomplete with the blockage named", () => {
    const lane = aggregateLane("host", [
      ready("chromium"),
      ready("firefox"),
      classifyAndWrap("webkit", "error while loading shared libraries: libicudata.so.74"),
    ]);
    expect(lane.complete).toBe(false);
    expect(lane.exitCode).toBe(1);
    expect(lane.blocked).toHaveLength(1);
    expect(lane.blocked[0]?.engine).toBe("webkit");
    expect(lane.summary).toContain("webkit");
    expect(lane.summary).toContain("NOT complete");
  });

  test("every engine blocked is still incomplete, never an exception path", () => {
    const lane = aggregateLane(
      "host",
      ["chromium", "firefox", "webkit"].map((engine) =>
        classifyAndWrap(engine, "Executable doesn't exist"),
      ),
    );
    expect(lane.complete).toBe(false);
    expect(lane.blocked).toHaveLength(3);
  });
});

function classifyAndWrap(engine: string, message: string): EngineProbeResult {
  const classified = classifyBrowserFailure(message);
  return {
    engine,
    ok: false,
    kind: classified.kind,
    reason: classified.reason,
    fix: classified.fix,
  };
}
