// src/reader/paginationTrail.ts
// Issue #255 — the opt-in, bounded DEV/test pagination event trail.
//
// WHY: CI-repair sessions once burned on confident-but-withdrawn starvation /
// event-delivery / remount theories before a turn/correction trace exposed
// the mechanism. The __lemPagination publication (Issue #254) answers "what
// is the state NOW"; it cannot answer "what happened, in what order, and
// why" across a turn → publication → anchor move → overflow correction
// sequence. This trail is that evidence: every event carries identity
// (articleId), ordering (module-monotonic `seq`), the publication/turn
// sequence numbers, the canonical anchor and its delta, and a cause where
// the emitting site knows one.
//
// OPT-IN, DEV-ONLY, BOUNDED — this is NOT production telemetry:
//   - Production builds never record (import.meta.env.DEV gate) and never
//     expose the window getter.
//   - Recording requires an explicit flag: the `lemPaginationTrail=1` URL
//     parameter (one session) or the `lem.paginationTrail=1` localStorage
//     key (persistent across reloads — how the e2e harness enables it via
//     addInitScript before the app boots).
//   - Retention is a ring buffer (capacity below); the snapshot reports
//     `droppedFromHead` and `firstEventSeq` so a consumer can SEE that older
//     events were evicted rather than never emitted.
//
// THE EXPOSURE RULE (acceptance criterion): an empty trail is not proof an
// event did not happen. A never-started trail reports `recording: false`
// plus a note naming the enable flags; a started one reports
// `initializedAt`. Consumers must treat absence of evidence as absence of
// instrumentation until recording is confirmed.
//
// PRIVACY: events carry ids, sequence numbers, offsets, page counts, and
// machine-readable causes ONLY. NEVER article text, titles, annotations, or
// user notes — the event shape below is the whitelist; do not widen it with
// free-form content fields.

/** Enable flags (DEV builds only). */
export const PAGINATION_TRAIL_QUERY_PARAM = "lemPaginationTrail";
export const PAGINATION_TRAIL_STORAGE_KEY = "lem.paginationTrail";

/** Ring capacity: enough for a turn/reflow diagnosis, bounded for memory. */
const TRAIL_CAPACITY = 128;

export type PaginationTrailEventKind =
  | "trail-start"
  | "publication"
  | "turn-receipt"
  | "overflow-check"
  | "overflow-correction"
  | "fallback";

/** Every cause an instrumented site currently knows. Open set — extend,
 * never invent near-synonyms for existing entries. */
export type PaginationTrailCause =
  | "initial"
  | "repagination"
  | "scope-change"
  | "turn"
  | "programmatic-jump"
  | "overflow-correction"
  | "fallback"
  | "unknown";

/** The whitelisted event shape (see PRIVACY above). */
export interface PaginationTrailEvent {
  /** Module-monotonic ordering across all kinds — stable across ring eviction. */
  seq: number;
  /** Wall-clock ms (Date.now) — ordering lives in `seq`, not `t`. */
  t: number;
  kind: PaginationTrailEventKind;
  articleId: string;
  cause?: PaginationTrailCause;
  status?: "ok" | "fallback";
  /** Engine/overflow-guard reason (machine-readable, e.g. "dom-fallback"). */
  reason?: string;
  publicationSeq?: number;
  turnSeq?: number;
  turnDirection?: "next" | "previous";
  pagesLength?: number;
  pageIndex?: number;
  /** Canonical passage (pageAnchorOffset, end-pin rule) for the publication. */
  anchorOffset?: number | null;
  /** The same article's previous publication anchor — null when none. */
  prevAnchorOffset?: number | null;
  /** anchorOffset !== prevAnchorOffset, comparable publications only. */
  anchorMoved?: boolean;
  scopeStartBlock?: number;
  scopeEndBlock?: number;
  /** The windowed measurement scope changed vs the previous publication. */
  scopeChanged?: boolean;
  note?: string;
}

export type PaginationTrailEventInput = Omit<PaginationTrailEvent, "seq" | "t">;

export interface PaginationTrailSnapshot {
  recording: boolean;
  /** When recording began (ms); null when never started. */
  initializedAt: number | null;
  /** Ring capacity — events.length can only be ≤ capacity. */
  capacity: number;
  /** Oldest + first: bounded retention made visible. */
  events: PaginationTrailEvent[];
  /** Events evicted from the ring's head since recording began. */
  droppedFromHead: number;
  /** `seq` of the oldest retained event — gaps mean eviction, not silence. */
  firstEventSeq: number | null;
  /** Present when not recording: names the enable flags (exposure rule). */
  note?: string;
}

interface TrailState {
  initializedAt: number;
  events: PaginationTrailEvent[];
  droppedFromHead: number;
  seq: number;
  lastAnchorByArticle: Map<string, number>;
  lastScopeByArticle: Map<string, string>;
}

let state: TrailState | null = null;

/** DEV-only opt-in check: the URL param (this session) or localStorage key. */
export function paginationTrailEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    const query = new URLSearchParams(window.location.search).get(PAGINATION_TRAIL_QUERY_PARAM);
    if (query === "1") return true;
    return window.localStorage.getItem(PAGINATION_TRAIL_STORAGE_KEY) === "1";
  } catch {
    // Unreachable location/localStorage (defensive) — treat as off.
    return false;
  }
}

/**
 * Begin recording when the opt-in flag is set (idempotent — the first call
 * emits the trail-start event; later calls are no-ops). Mount-time callers
 * may invoke this unconditionally in DEV: it never records unflagged.
 *
 * @returns whether recording is active.
 */
export function startPaginationTrail(): boolean {
  if (state) return true;
  if (!paginationTrailEnabled()) return false;
  state = {
    initializedAt: Date.now(),
    events: [],
    droppedFromHead: 0,
    seq: 0,
    lastAnchorByArticle: new Map(),
    lastScopeByArticle: new Map(),
  };
  // The e2e/component access seam: a live getter (never a stale snapshot).
  // DEV-only by construction — this function body cannot run otherwise.
  (window as unknown as Record<string, unknown>).__lemPaginationTrail = readPaginationTrail;
  record({ kind: "trail-start", articleId: "*", note: "pagination event trail recording" });
  return true;
}

/**
 * Append an event. No-op (never throws) when recording is off — call sites
 * must stay unconditional and cheap; the flag decides.
 */
export function recordTrailEvent(event: PaginationTrailEventInput): void {
  if (!state) return;
  record(event);
}

/**
 * The trail snapshot. When never started, reports `recording: false` with a
 * note naming the enable flags — an empty trail is absence of
 * instrumentation, never proof an event did not happen.
 */
export function readPaginationTrail(): PaginationTrailSnapshot {
  if (!state) {
    return {
      recording: false,
      initializedAt: null,
      capacity: TRAIL_CAPACITY,
      events: [],
      droppedFromHead: 0,
      firstEventSeq: null,
      note:
        "pagination event trail not enabled — an empty trail is not evidence an event did not happen; " +
        `enable with ?${PAGINATION_TRAIL_QUERY_PARAM}=1 or localStorage ${PAGINATION_TRAIL_STORAGE_KEY}=1 (DEV builds only)`,
    };
  }
  return {
    recording: true,
    initializedAt: state.initializedAt,
    capacity: TRAIL_CAPACITY,
    events: state.events.slice(),
    droppedFromHead: state.droppedFromHead,
    firstEventSeq: state.events[0]?.seq ?? null,
  };
}

/** Test-only: forget everything (unit tests reset between cells). */
export function resetPaginationTrailForTests(): void {
  state = null;
  try {
    delete (window as unknown as Record<string, unknown>).__lemPaginationTrail;
  } catch {
    // Non-window environment — nothing to clean.
  }
}

// ── internals ────────────────────────────────────────────────────────────────

function record(input: PaginationTrailEventInput): void {
  if (!state) return;
  state.seq += 1;
  const event: PaginationTrailEvent = enrich({ ...input, seq: state.seq, t: Date.now() });
  if (state.events.length >= TRAIL_CAPACITY) {
    state.events.shift();
    state.droppedFromHead += 1;
  }
  state.events.push(event);
}

/** Thread the per-article anchor/scope deltas that make reflow vs turn
 * distinguishable from the trail alone. */
function enrich(event: PaginationTrailEvent): PaginationTrailEvent {
  if (event.kind !== "publication") return event;
  const id = event.articleId;
  const priorAnchor = state?.lastAnchorByArticle.get(id);
  const priorScope = state?.lastScopeByArticle.get(id);
  const scopeKey =
    event.scopeStartBlock !== undefined && event.scopeEndBlock !== undefined
      ? `${event.scopeStartBlock}:${event.scopeEndBlock}`
      : undefined;
  const enriched: PaginationTrailEvent = { ...event };
  if (event.anchorOffset !== undefined) {
    enriched.prevAnchorOffset = priorAnchor === undefined ? null : priorAnchor;
    enriched.anchorMoved = priorAnchor !== undefined && priorAnchor !== event.anchorOffset;
    if (typeof event.anchorOffset === "number") {
      state?.lastAnchorByArticle.set(id, event.anchorOffset);
    }
  }
  if (scopeKey !== undefined) {
    enriched.scopeChanged = priorScope !== undefined && priorScope !== scopeKey;
    state?.lastScopeByArticle.set(id, scopeKey);
  }
  return enriched;
}
