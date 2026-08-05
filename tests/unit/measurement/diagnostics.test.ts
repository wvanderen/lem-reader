import { describe, expect, it } from "vitest";
import { DiagnosticBus } from "../../../src/measurement/diagnostics";
import { DiagnosticEventSchema } from "../../../src/measurement/types";
import type { DiagnosticEvent } from "../../../src/measurement/types";

/**
 * Diagnostic substrate (D3-05 + V5 boundary validation). The 6-kind
 * discriminated union is the versioned shape Phase 4's PAGE-09 UI consumes;
 * in Plan 01 only the staleness/error kinds (late-epoch-drop,
 * measurement-error) are emitted, but ALL six kinds must be defined now so
 * Phase 4 extends emission rather than the shape (PATTERNS §diagnostics.ts).
 *
 * Guards:
 *   - DiagnosticEventSchema.parse accepts a valid event of each of the 6 kinds.
 *   - DiagnosticEventSchema.parse rejects an unknown `kind` literal (V5
 *     tampering defense at the consume boundary).
 *   - DiagnosticEventSchema.parse rejects malformed shapes (missing required
 *     field, wrong-type field).
 *   - DiagnosticBus.emit forwards to every active subscriber.
 *   - subscribe() returns an unsubscribe that stops further delivery.
 *   - DiagnosticBus.emit validates the payload (V5 at emit boundary).
 */

const baseTs = "2026-08-05T12:00:00.000Z";

const validEachKind: Array<{ label: string; event: DiagnosticEvent }> = [
  { label: "drift-exceedance", event: { kind: "drift-exceedance", ts: baseTs } },
  { label: "dom-fallback", event: { kind: "dom-fallback", ts: baseTs } },
  {
    label: "late-epoch-drop",
    event: { kind: "late-epoch-drop", captured: 3, current: 7, ts: baseTs },
  },
  { label: "calibration-failure", event: { kind: "calibration-failure", ts: baseTs } },
  {
    label: "runtime-guard-downgrade",
    event: {
      kind: "runtime-guard-downgrade",
      "kind-downgraded": "paragraph",
      heightDriftPx: 4.5,
      ts: baseTs,
    },
  },
  {
    label: "measurement-error",
    event: { kind: "measurement-error", message: "boom", ts: baseTs },
  },
];

describe("DiagnosticEventSchema.parse accepts each of the 6 kinds (D3-05)", () => {
  it.each(validEachKind)("parses a valid $label event", ({ event }) => {
    expect(() => DiagnosticEventSchema.parse(event)).not.toThrow();
  });

  it("preserves the discriminant kind on parse", () => {
    for (const { event } of validEachKind) {
      expect(DiagnosticEventSchema.parse(event).kind).toBe(event.kind);
    }
  });
});

describe("DiagnosticEventSchema.parse rejects malformed shapes (V5)", () => {
  it("rejects an unknown kind literal (tampering defense)", () => {
    expect(() =>
      DiagnosticEventSchema.parse({ kind: "totally-fake-kind", ts: baseTs }),
    ).toThrow();
  });

  it.each([
    [
      "late-epoch-drop missing captured",
      { kind: "late-epoch-drop", current: 7, ts: baseTs },
    ],
    [
      "late-epoch-drop missing current",
      { kind: "late-epoch-drop", captured: 3, ts: baseTs },
    ],
    [
      "runtime-guard-downgrade missing kind-downgraded",
      { kind: "runtime-guard-downgrade", heightDriftPx: 1, ts: baseTs },
    ],
    [
      "measurement-error missing message",
      { kind: "measurement-error", ts: baseTs },
    ],
    ["missing kind discriminant entirely", { ts: baseTs }],
    ["missing ts", { kind: "drift-exceedance" }],
    ["ts is not an ISO datetime", { kind: "drift-exceedance", ts: "yesterday" }],
    [
      "captured is not a number",
      { kind: "late-epoch-drop", captured: "3", current: 7, ts: baseTs },
    ],
  ])("rejects %s", (_label, bad) => {
    expect(() => DiagnosticEventSchema.parse(bad)).toThrow();
  });
});

describe("DiagnosticBus", () => {
  it("emit forwards to every active subscriber", () => {
    const bus = new DiagnosticBus();
    const received: DiagnosticEvent[] = [];
    const a = (e: DiagnosticEvent) => received.push(e);
    const b = (e: DiagnosticEvent) => received.push(e);
    bus.subscribe(a);
    bus.subscribe(b);
    bus.emit({ kind: "measurement-error", message: "x", ts: baseTs });
    expect(received).toHaveLength(2);
  });

  it("subscribe returns an unsubscribe that stops further delivery", () => {
    const bus = new DiagnosticBus();
    const received: DiagnosticEvent[] = [];
    const unsub = bus.subscribe((e) => received.push(e));
    bus.emit({ kind: "measurement-error", message: "first", ts: baseTs });
    expect(received).toHaveLength(1);
    unsub();
    bus.emit({ kind: "measurement-error", message: "second", ts: baseTs });
    expect(received, "no delivery after unsubscribe").toHaveLength(1);
  });

  it("emit validates the payload via DiagnosticEventSchema.parse (V5 emit boundary)", () => {
    const bus = new DiagnosticBus();
    bus.subscribe(() => {
      /* no-op */
    });
    expect(
      () => bus.emit({ kind: "not-a-real-kind", ts: baseTs } as unknown as DiagnosticEvent),
    ).toThrow();
  });

  it("delivers to subscribers added after earlier emits but not before", () => {
    const bus = new DiagnosticBus();
    const seen: string[] = [];
    bus.emit({ kind: "measurement-error", message: "before-sub", ts: baseTs });
    bus.subscribe((e) => seen.push(e.kind));
    bus.emit({ kind: "late-epoch-drop", captured: 1, current: 2, ts: baseTs });
    expect(seen).toEqual(["late-epoch-drop"]);
  });
});
