// tests/unit/paginationFailure.test.ts
// Issue #240 — the ONE validated classifier from diagnostic events to
// reader-facing pagination failure explanations. The engine, the overflow
// guard, the windowed adapter, and the measurement layer each emit typed
// reasons; this classifier is the ONLY place a reason becomes reader copy,
// so a generic banner can never infer a cause again.
//
// Contract under test (issue #240 acceptance):
//   - genuinely unpageable content and processing failures are explicit and
//     DISTINCT classes with their own calm copy;
//   - unknown/absent reasons never infer a specific content limit — they
//     classify honestly as a processing error;
//   - diagnostic fields (measurement-error message, raw reason strings) are
//     NEVER rendered into reader-facing copy;
//   - the output validates against the Zod schema (V5 boundary discipline);
//   - non-failure diagnostic kinds produce no reader-facing failure.
import { describe, expect, it } from "vitest";
import {
  PAGINATION_FAILURE_REASONS,
  PaginationFailureSchema,
  classifyPaginationFailure,
} from "../../src/reader/paginationFailure";
import type { DiagnosticEvent } from "../../src/measurement/types";

const domFallback = (reason?: string): DiagnosticEvent => ({
  kind: "dom-fallback",
  ts: new Date().toISOString(),
  ...(reason !== undefined ? { reason } : {}),
});

describe("classifyPaginationFailure — genuinely unpageable content (#240)", () => {
  it.each(["oversized-block", "overflow-atomic-too-tall"])(
    "classifies %s as unpageable content too large for one page",
    (reason) => {
      const failure = classifyPaginationFailure(domFallback(reason));
      expect(failure?.failureClass).toBe("unpageable-content");
      expect(failure?.heading).toMatch(/too large to fit on one page/);
      // The disclosed, reversible session flip rides this class only.
      expect(failure?.flipsToScrolling).toBe(true);
    },
  );

  it.each(["unsplittable-block-overflow", "overflow-no-legal-split"])(
    "classifies %s as unpageable content that cannot be divided",
    (reason) => {
      const failure = classifyPaginationFailure(domFallback(reason));
      expect(failure?.failureClass).toBe("unpageable-content");
      expect(failure?.heading).toMatch(/can't be divided across pages/);
      expect(failure?.flipsToScrolling).toBe(true);
    },
  );

  it.each(["page-ceiling", "overflow-page-ceiling"])(
    "classifies %s as a one-pass length limit, not a processing crash",
    (reason) => {
      const failure = classifyPaginationFailure(domFallback(reason));
      expect(failure?.failureClass).toBe("unpageable-content");
      expect(failure?.heading).toMatch(/too long/);
      expect(failure?.flipsToScrolling).toBe(true);
    },
  );

  it("gives unpageable classes the disclosed, reversible scrolling disclosure", () => {
    const failure = classifyPaginationFailure(domFallback("oversized-block"));
    expect(failure?.body).toMatch(/Switched to scrolling/);
    expect(failure?.body).toMatch(/switch back to pages/);
  });
});

describe("classifyPaginationFailure — processing failures (#240)", () => {
  it.each([
    "zero-progress",
    "overflow-no-progress",
    "unsupported-capacity-continuation",
    "measurement-scope-mismatch",
    "unexpected-pagination-error",
  ])("classifies %s as a distinct processing failure that never flips modes", (reason) => {
    const failure = classifyPaginationFailure(domFallback(reason));
    expect(failure?.failureClass).toBe("processing-error");
    expect(failure?.flipsToScrolling).toBe(false);
    // Honest failure of the reader (the app) with a next step — never
    // blamed on the content or the reader (GLOSSARY "Error").
    expect(failure?.body).toMatch(/Something went wrong/);
  });

  it("classifies a measurement-error event as a processing failure", () => {
    const event: DiagnosticEvent = {
      kind: "measurement-error",
      message: "measureAllBlocks returned 0 elements",
      ts: new Date().toISOString(),
    };
    const failure = classifyPaginationFailure(event);
    expect(failure?.failureClass).toBe("processing-error");
    expect(failure?.flipsToScrolling).toBe(false);
  });

  it("never renders raw diagnostic fields into reader copy (T-04-14)", () => {
    const hostile = '<script>alert("x")</script> scope mismatch at block 4';
    const failure = classifyPaginationFailure({
      kind: "measurement-error",
      message: hostile,
      ts: new Date().toISOString(),
    });
    expect(failure?.heading).not.toContain("script");
    expect(failure?.body).not.toContain("script");
    expect(failure?.announce).not.toContain("block 4");
    const fallback = classifyPaginationFailure(domFallback(hostile));
    expect(fallback?.heading).not.toContain("script");
    expect(fallback?.body).not.toContain(hostile);
  });

  it("classifies an event with NO reason as an honest processing error — never an inferred content limit", () => {
    const failure = classifyPaginationFailure(domFallback());
    expect(failure?.failureClass).toBe("processing-error");
    // The specific-limit headings are only reachable through their validated
    // reasons — a bare fallback must not claim one.
    expect(failure?.heading).not.toMatch(/too large|too long|divided/);
  });

  it("classifies an UNKNOWN reason as an honest processing error — never an inferred content limit", () => {
    const failure = classifyPaginationFailure(domFallback("some-future-guard-v2"));
    expect(failure?.failureClass).toBe("processing-error");
    expect(failure?.heading).not.toMatch(/too large|too long|divided/);
  });
});

describe("classifyPaginationFailure — non-failure diagnostics", () => {
  it.each([
    { kind: "drift-exceedance", ts: new Date().toISOString() },
    { kind: "late-epoch-drop", captured: 1, current: 2, ts: new Date().toISOString() },
    { kind: "calibration-failure", ts: new Date().toISOString() },
    {
      kind: "runtime-guard-downgrade",
      "kind-downgraded": "heading",
      heightDriftPx: 3,
      ts: new Date().toISOString(),
    },
  ] satisfies DiagnosticEvent[])("returns null for %j", (event) => {
    expect(classifyPaginationFailure(event)).toBeNull();
  });
});

describe("classifyPaginationFailure — validation contract", () => {
  it("returns Zod-valid failure objects for every known reason", () => {
    for (const reason of PAGINATION_FAILURE_REASONS) {
      if (reason === "unrecognized") continue; // sentinel — covered below
      const failure = classifyPaginationFailure(domFallback(reason));
      expect(failure).not.toBeNull();
      expect(() => PaginationFailureSchema.parse(failure)).not.toThrow();
      // The echoed reason is always the validated vocabulary, never raw.
      expect(PAGINATION_FAILURE_REASONS).toContain(failure!.reason);
    }
  });

  it("echoes the validated measurement-error vocabulary entry, never the message", () => {
    const failure = classifyPaginationFailure({
      kind: "measurement-error",
      message: "diagnostic only",
      ts: new Date().toISOString(),
    });
    expect(PAGINATION_FAILURE_REASONS).toContain(failure!.reason);
    expect(failure!.reason).toBe("measurement-error");
    expect(() => PaginationFailureSchema.parse(failure)).not.toThrow();
  });

  it("gives each failure a distinct static announce for the one status region", () => {
    const unpageable = classifyPaginationFailure(domFallback("oversized-block"));
    const processing = classifyPaginationFailure(domFallback("zero-progress"));
    expect(unpageable!.announce).not.toBe(processing!.announce);
    expect(unpageable!.announce.length).toBeGreaterThan(0);
    expect(processing!.announce.length).toBeGreaterThan(0);
  });
});
