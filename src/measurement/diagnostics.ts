// src/measurement/diagnostics.ts
// In-memory diagnostic bus for the D3-05 substrate. Phase 3 RECORDS events
// but does NOT show them to the reader (D3-04: measurement is invisible by
// default; the `.status` live region in ArticleView is RESERVED for
// consequential fallback events, not routine re-measurement chatter —
// surfacing is Phase 4's PAGE-09 job).
//
// Shape is versioned (DiagnosticEventSchema in types.ts) so Phase 4's UI
// extends emission rather than the schema — all six kinds are defined now
// even though Plan 01 only emits `late-epoch-drop` and `measurement-error`.
//
// V5 (Input Validation — RESEARCH §Security Domain): every emit is Zod-
// validated at the bus boundary. Phase 4's UI will re-validate at the
// consume boundary. Never accept a `DiagnosticEvent` of unknown shape.
//
// NOT persisted to IndexedDB — STACK.md forbids persisting derived
// geometry; diagnostics are session-scoped telemetry. An in-memory ring
// buffer retains the last N events for Phase 4 inspection.

import type { DiagnosticEvent } from "./types";
import { DiagnosticEventSchema } from "./types";

/** How many recent events the ring buffer retains for Phase 4 inspection. */
const RING_BUFFER_CAPACITY = 100;

/**
 * DiagnosticBus — pub-sub with V5 boundary validation + an in-memory ring
 * buffer. Subscribers are plain functions; subscribe() returns an
 * unsubscribe closure (mirrors the project's listener+cleanup convention
 * from SettingsContext / useScrollSave).
 */
export class DiagnosticBus {
  private subscribers = new Set<(event: DiagnosticEvent) => void>();
  private ring: DiagnosticEvent[] = [];

  /**
   * Validate `event` against DiagnosticEventSchema (V5 — emit boundary) and
   * forward to every active subscriber. A malformed payload throws (never
   * silently swallows an unknown kind — that would let an injection into
   * the Phase 4 UI pass undetected).
   */
  emit(event: DiagnosticEvent): void {
    const parsed = DiagnosticEventSchema.parse(event);
    if (this.ring.length >= RING_BUFFER_CAPACITY) {
      this.ring.shift();
    }
    this.ring.push(parsed);
    for (const handler of this.subscribers) {
      handler(parsed);
    }
  }

  /**
   * Register a subscriber. Returns an unsubscribe closure that stops
   * further delivery (mirrors the listener+cleanup pattern in
   * SettingsContext L154–165 and useScrollSave L172–174).
   */
  subscribe(handler: (event: DiagnosticEvent) => void): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  /**
   * Snapshot of the last N emitted events (oldest first). Phase 4's PAGE-09
   * UI consumes this; Phase 3 has no reader-facing consumer.
   */
  recent(): readonly DiagnosticEvent[] {
    return this.ring.slice();
  }
}
