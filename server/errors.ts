// server/errors.ts
// Plan 07-03 Task 1 — the typed ingestion error class. Every safeFetch
// refusal (and every later pipeline stage failure) throws IngestionError with
// a `reason` drawn from the IngestionFailureReasonEnum catalog
// (src/ingestion/types.ts — 11 honest-failure reasons). The client
// (src/ingestion/IngestionClient.ts, lands in 07-06) maps each reason to a
// calm DOC-06 phrase in the `.status` live region (D7-04).
//
// The `.reason` field is the CONTRACT — it lets the caller distinguish refusal
// causes without parsing Error.message (which is human-readable, not stable).
// `instanceof IngestionError` is the second discriminator (V5 boundary
// discipline — the client treats any non-IngestionError throw as `server-error`).
import type { IngestionFailureReason } from "../src/ingestion/types";

/**
 * IngestionError — thrown by /server pipeline stages on any anticipated
 * refusal. Carries a typed `.reason` drawn from IngestionFailureReasonEnum so
 * the client can map it to a calm status phrase without parsing the message.
 */
export class IngestionError extends Error {
  readonly reason: IngestionFailureReason;

  constructor(reason: IngestionFailureReason, message?: string) {
    super(message ?? reason);
    this.reason = reason;
    this.name = "IngestionError";
    // Restore the prototype chain across the ES5-ish Error subclass quirks
    // (defensive — Node 22 preserves it, but bundled runtimes may not).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
