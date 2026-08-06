// tests/unit/measurement/driftGuard.test.ts
/**
 * RuntimeDriftGuard (Plan 02 — D3-08). The guard exists BECAUSE Pretext is
 * primary for eligible kinds (D3-03) — a build-time-only fingerprint cannot
 * see runtime drift. The guard samples Pretext predictions against DOM
 * references per measurement pass; if any sampled block of a kind drifts
 * beyond tolerance, the kind is downgraded Pretext→DOM and a
 * `runtime-guard-downgrade` diagnostic is emitted (D3-05 — never silently
 * degrade).
 *
 * Guards:
 *   - Within tolerance: eligibility unchanged, no diagnostic emitted.
 *   - Beyond tolerance: kind's pretextEligible flips to false and exactly
 *     one `runtime-guard-downgrade` diagnostic per downgraded kind is
 *     emitted, naming the kind + observed drift (D3-08).
 *   - Multiple kinds drifting in the same pass: each emits its own
 *     diagnostic (D3-01 per-kind gate).
 *   - Already-downgraded kinds are not re-sampled (cheap path).
 *   - Mismatched array lengths: emits a measurement-error diagnostic and
 *     skips sampling (V7 — never throw to the reader).
 */
import { describe, expect, it } from "vitest";
import { RuntimeDriftGuard } from "../../../src/measurement/driftGuard";
import { DiagnosticBus } from "../../../src/measurement/diagnostics";
import type {
  BlockMeasurement,
  DiagnosticEvent,
  EligibilityState,
} from "../../../src/measurement/types";

function block(kind: string, heightPx: number): BlockMeasurement {
  return { kind, heightPx, lineCount: Math.round(heightPx / 20), lineBoxes: [] };
}

function bothEligible(): EligibilityState {
  return {
    paragraph: { pretextEligible: true },
    heading: { pretextEligible: true },
  };
}

describe("RuntimeDriftGuard — within tolerance", () => {
  it("does NOT mutate eligibility when drift ≤ tolerance", () => {
    const bus = new DiagnosticBus();
    const guard = new RuntimeDriftGuard({
      tolerancePx: 1.0,
      diagnostics: bus,
      sampleSize: 5,
    });
    const eligibility = bothEligible();
    const predictions = [block("paragraph", 100), block("heading", 50)];
    const dom = [block("paragraph", 100.5), block("heading", 50.9)];
    const returned = guard.sample(predictions, dom, eligibility);
    expect(returned.paragraph.pretextEligible).toBe(true);
    expect(returned.heading.pretextEligible).toBe(true);
    expect(bus.recent()).toEqual([]);
  });

  it("boundary: drift exactly == tolerance is NOT a downgrade (strictly greater)", () => {
    const bus = new DiagnosticBus();
    const guard = new RuntimeDriftGuard({
      tolerancePx: 1.0,
      diagnostics: bus,
    });
    const eligibility = bothEligible();
    guard.sample(
      [block("paragraph", 100)],
      [block("paragraph", 101)],
      eligibility,
    );
    expect(eligibility.paragraph.pretextEligible).toBe(true);
    expect(bus.recent()).toEqual([]);
  });
});

describe("RuntimeDriftGuard — beyond tolerance (D3-08 downgrade)", () => {
  it("downgrades paragraph + emits exactly one runtime-guard-downgrade diagnostic", () => {
    const bus = new DiagnosticBus();
    const received: DiagnosticEvent[] = [];
    bus.subscribe((e) => received.push(e));
    const guard = new RuntimeDriftGuard({
      tolerancePx: 1.0,
      diagnostics: bus,
      sampleSize: 5,
    });
    const eligibility = bothEligible();
    const returned = guard.sample(
      [block("paragraph", 100)],
      [block("paragraph", 105)],
      eligibility,
    );
    expect(returned.paragraph.pretextEligible).toBe(false);
    expect(returned.heading.pretextEligible).toBe(true);
    // Exactly one diagnostic, naming the kind + observed drift.
    const downgrades = received.filter(
      (e) => e.kind === "runtime-guard-downgrade",
    );
    expect(downgrades).toHaveLength(1);
    const dg = downgrades[0]!;
    expect(dg.kind).toBe("runtime-guard-downgrade");
    // The kebab-cased field name is the source-of-truth shape from types.ts.
    expect(dg).toHaveProperty("kind-downgraded", "paragraph");
    expect(dg).toHaveProperty("heightDriftPx", 5);
    expect(dg).toHaveProperty("ts");
    expect(typeof dg.ts).toBe("string");
  });

  it("downgrades heading independently (D3-01 per-kind gate)", () => {
    const bus = new DiagnosticBus();
    const received: DiagnosticEvent[] = [];
    bus.subscribe((e) => received.push(e));
    const guard = new RuntimeDriftGuard({
      tolerancePx: 0.5,
      diagnostics: bus,
    });
    const eligibility = bothEligible();
    guard.sample(
      [block("heading", 30)],
      [block("heading", 35)],
      eligibility,
    );
    expect(eligibility.heading.pretextEligible).toBe(false);
    expect(eligibility.paragraph.pretextEligible).toBe(true);
    expect(
      received.filter((e) => e.kind === "runtime-guard-downgrade"),
    ).toHaveLength(1);
  });

  it("emits ONE diagnostic per downgraded kind even with multiple drifting blocks", () => {
    const bus = new DiagnosticBus();
    const received: DiagnosticEvent[] = [];
    bus.subscribe((e) => received.push(e));
    const guard = new RuntimeDriftGuard({
      tolerancePx: 1.0,
      diagnostics: bus,
      sampleSize: 5,
    });
    const eligibility = bothEligible();
    // Three drifting paragraphs in one pass.
    guard.sample(
      [
        block("paragraph", 100),
        block("paragraph", 100),
        block("paragraph", 100),
      ],
      [
        block("paragraph", 110),
        block("paragraph", 112),
        block("paragraph", 105),
      ],
      eligibility,
    );
    expect(eligibility.paragraph.pretextEligible).toBe(false);
    const downgrades = received.filter(
      (e) => e.kind === "runtime-guard-downgrade",
    );
    expect(downgrades).toHaveLength(1);
    // Records the WORST drift observed (12, not 5 or 10).
    expect(downgrades[0]).toHaveProperty("heightDriftPx", 12);
  });

  it("downgrades BOTH kinds in the same pass when both drift (D3-01)", () => {
    const bus = new DiagnosticBus();
    const received: DiagnosticEvent[] = [];
    bus.subscribe((e) => received.push(e));
    const guard = new RuntimeDriftGuard({
      tolerancePx: 0.5,
      diagnostics: bus,
    });
    const eligibility = bothEligible();
    guard.sample(
      [block("paragraph", 100), block("heading", 30)],
      [block("paragraph", 102), block("heading", 33)],
      eligibility,
    );
    expect(eligibility.paragraph.pretextEligible).toBe(false);
    expect(eligibility.heading.pretextEligible).toBe(false);
    expect(
      received.filter((e) => e.kind === "runtime-guard-downgrade"),
    ).toHaveLength(2);
  });
});

describe("RuntimeDriftGuard — sampling discipline", () => {
  it("respects sampleSize — only samples the first N eligible blocks", () => {
    const bus = new DiagnosticBus();
    const guard = new RuntimeDriftGuard({
      tolerancePx: 1.0,
      diagnostics: bus,
      sampleSize: 2,
    });
    const eligibility = bothEligible();
    // Five drifting paragraphs; sampleSize 2 means only the first two are
    // compared. The kind is still downgraded (drift observed in the sample).
    guard.sample(
      [
        block("paragraph", 100),
        block("paragraph", 100),
        block("paragraph", 100),
        block("paragraph", 100),
        block("paragraph", 100),
      ],
      [
        block("paragraph", 110),
        block("paragraph", 110),
        block("paragraph", 110),
        block("paragraph", 110),
        block("paragraph", 110),
      ],
      eligibility,
    );
    expect(eligibility.paragraph.pretextEligible).toBe(false);
  });

  it("does NOT re-sample a kind already downgraded in a prior pass (cheap path)", () => {
    const bus = new DiagnosticBus();
    const received: DiagnosticEvent[] = [];
    bus.subscribe((e) => received.push(e));
    const guard = new RuntimeDriftGuard({
      tolerancePx: 1.0,
      diagnostics: bus,
    });
    const eligibility = bothEligible();
    // First pass: drift, downgrade + emit.
    guard.sample(
      [block("paragraph", 100)],
      [block("paragraph", 110)],
      eligibility,
    );
    expect(
      received.filter((e) => e.kind === "runtime-guard-downgrade"),
    ).toHaveLength(1);
    // Second pass: still drifting, but the kind is now ineligible — skip.
    guard.sample(
      [block("paragraph", 100)],
      [block("paragraph", 110)],
      eligibility,
    );
    expect(
      received.filter((e) => e.kind === "runtime-guard-downgrade"),
    ).toHaveLength(1);
  });

  it("ignores DOM-only kinds (blockquote/figure/etc.) — only paragraph/heading are Pretext-eligible", () => {
    const bus = new DiagnosticBus();
    const guard = new RuntimeDriftGuard({
      tolerancePx: 1.0,
      diagnostics: bus,
    });
    const eligibility = bothEligible();
    // A blockquote and figure appear in the predictions array (defensive);
    // the guard must not touch their eligibility (they have none) and must
    // not emit.
    guard.sample(
      [block("blockquote", 100), block("figure", 200)],
      [block("blockquote", 999), block("figure", 999)],
      eligibility,
    );
    expect(eligibility.paragraph.pretextEligible).toBe(true);
    expect(eligibility.heading.pretextEligible).toBe(true);
    expect(bus.recent()).toEqual([]);
  });
});

describe("RuntimeDriftGuard — defensive shape (V7)", () => {
  it("emits a measurement-error diagnostic (NOT a throw) on array length mismatch", () => {
    const bus = new DiagnosticBus();
    const received: DiagnosticEvent[] = [];
    bus.subscribe((e) => received.push(e));
    const guard = new RuntimeDriftGuard({
      tolerancePx: 1.0,
      diagnostics: bus,
    });
    const eligibility = bothEligible();
    expect(() =>
      guard.sample(
        [block("paragraph", 100)],
        // Different length — engine mis-wire.
        [block("paragraph", 100), block("paragraph", 110)],
        eligibility,
      ),
    ).not.toThrow();
    expect(eligibility.paragraph.pretextEligible).toBe(true);
    const errors = received.filter((e) => e.kind === "measurement-error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toHaveProperty("message");
    expect(typeof (errors[0] as { message: string }).message).toBe("string");
  });
});
