// src/reader/readingSessionRecorder.ts
// Issue #34 — the reading-session accumulator: pure domain logic behind the
// useReadingSession hook. ONE recorder instance per visit; it turns a stream
// of activity pulses into { startOffset, endOffset, activeSeconds } for the
// append-only ReadingSessionRecord (decision #24).
//
// Accrual model (idle-capped active time):
//   - `begin` seeds the activity clock — the open itself is the first
//     heartbeat, so the first idleCapMs of a visit accrue unconditionally
//     (a reader who silently reads a short article is not punished for
//     generating no events).
//   - Every `activity` pulse credits elapsed time up to NOW bounded by the
//     PREVIOUS pulse's idle cap, then re-arms the cap. Time beyond the cap
//     (a parked tab) is skipped forward — never credited retroactively.
//     The identical model runs in both reading modes because the mode layer
//     (the hook) supplies the pulses: scroll in scrolling mode, page turns
//     via onAnchorChange in paginated mode.
//   - `creditToNow` is the same credit step without a pulse — the flush
//     ticker and the terminal flush call it so persisted totals stay fresh.
//
// Flush discipline lives in the hook; the recorder is read-only truth: it
// builds the row snapshot (`toRecord`), reports whether anything changed
// since the last write (`dirtySinceWrite`), and reports dormancy
// (`isDormant` — no pulse AND no credited time) so the hook can coalesce
// React StrictMode's twin mount/unmount into ONE visit instead of two rows.
//
// PURE domain logic — no DOM, no React, no Dexie. `now` and `uuid` are
// injectable so truth-table tests are deterministic without fake timers.
import type { ReadingSessionRecord } from "../content/schema";

/** Idle cap (ms): activity-free time beyond this window stops accruing —
 * a parked tab never inflates activeSeconds (issue #34 AC 2). */
export const IDLE_CAP_MS = 60_000;

export interface ReadingSessionRecorderDeps {
  /** Injectable clock (ms epoch). Defaults to Date.now. */
  now?: () => number;
  /** Idle-cap override (tests). Defaults to IDLE_CAP_MS. */
  idleCapMs?: number;
  /** Injectable per-visit identity. Defaults to crypto.randomUUID with a
   * Math.random fallback for non-secure contexts. */
  uuid?: () => string;
}

export interface ReadingSessionBeginInput {
  /** The canonical offset the visit opens at (0 on a fresh open; the hook
   * reads the live anchor). The FIRST activity pulse supersedes it — the
   * honest "where the visit started" is the first position actually seen
   * (e.g. a restore jump lands before the first pulse). */
  initialOffset: number;
}

function defaultUuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // Non-secure-context fallback — collision risk is negligible for a
  // single-user local library.
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * ReadingSessionRecorder — one visit's accrual state. The hook owns the
 * lifecycle: begin on article-ready, activity pulses from reader input,
 * creditToNow + toRecord at flush points, end via the hook (dormant sessions
 * are stashed by the hook for the rebegin guard — never flushed as rows).
 */
export class ReadingSessionRecorder {
  readonly articleId: string;
  private readonly now: () => number;
  private readonly idleCapMs: number;
  private readonly uuid: () => string;
  private readonly visitId: string;

  private startedAtMs = 0;
  private lastActivityAtMs: number | null = null;
  private creditedUntilMs = 0;
  private creditedMs = 0;
  private startOffset = 0;
  private startOffsetConfirmed = false;
  private lastOffset = 0;
  private activityCount = 0;
  private dirty = true;

  constructor(articleId: string, deps: ReadingSessionRecorderDeps = {}) {
    this.articleId = articleId;
    this.now = deps.now ?? Date.now;
    this.idleCapMs = deps.idleCapMs ?? IDLE_CAP_MS;
    this.uuid = deps.uuid ?? defaultUuid;
    // The visit identity is generated ONCE per recorder — every row
    // snapshot of this visit carries the same primary key (the append-only
    // upsert discipline: one row per visit, refined in place).
    this.visitId = this.uuid();
  }

  /** Begin the visit. Seeds the idle window (the open is a heartbeat). */
  begin(input: ReadingSessionBeginInput): void {
    const t = this.now();
    this.startedAtMs = t;
    this.lastActivityAtMs = t;
    this.creditedUntilMs = t;
    this.startOffset = Math.max(0, Math.floor(input.initialOffset) || 0);
    this.startOffsetConfirmed = false; // the first pulse supersedes this seed
    this.lastOffset = this.startOffset;
    this.activityCount = 0;
    this.dirty = true;
  }

  /** The per-visit identity stamped into every row snapshot. */
  get id(): string {
    return this.visitId;
  }

  /**
   * One reader-input pulse (scroll, page turn, pointer/key presence,
   * visibility-visible). Credits elapsed time bounded by the PREVIOUS
   * pulse's idle cap, then re-arms the window. `offset` (canonical D-05)
   * updates the end position and — on the first pulse — the start position.
   */
  activity(offset?: number): void {
    this.creditToNow();
    const t = this.now();
    this.lastActivityAtMs = t;
    this.creditedUntilMs = Math.max(this.creditedUntilMs, t);
    this.activityCount += 1;
    this.dirty = true;
    if (offset !== undefined && Number.isFinite(offset) && offset >= 0) {
      const o = Math.floor(offset);
      this.lastOffset = o;
      if (!this.startOffsetConfirmed) {
        this.startOffset = o;
        this.startOffsetConfirmed = true;
      }
    }
  }

  /**
   * Credit accrued time up to NOW without re-arming the idle window (the
   * flush ticker / terminal flush). Bounded by the idle cap exactly like the
   * pulse path; the uncredited idle tail is skipped forward so a later
   * flush can never retroactively count it.
   */
  creditToNow(): void {
    if (this.lastActivityAtMs === null) return;
    const t = this.now();
    const capEnd = this.lastActivityAtMs + this.idleCapMs;
    const bound = Math.min(t, capEnd);
    if (bound > this.creditedUntilMs) {
      this.creditedMs += bound - this.creditedUntilMs;
      this.dirty = true;
    }
    this.creditedUntilMs = Math.max(this.creditedUntilMs, t);
  }

  /**
   * Dormant = the visit produced no reader-input pulse AND no credited
   * time. The hook stashes dormant sessions instead of flushing them and
   * revives the stash when the same article reopens within the rebegin
   * guard — a StrictMode twin mount (or a bounce-remount) is ONE visit,
   * not two rows.
   */
  isDormant(): boolean {
    return this.activityCount === 0 && this.creditedMs === 0;
  }

  /** True if credit/activity changed since the last markWritten — the flush
   * ticker skips no-op writes (idle tabs write nothing). */
  dirtySinceWrite(): boolean {
    return this.dirty;
  }

  /** Called by the flusher after a successful put (the dirty reset). */
  markWritten(): void {
    this.dirty = false;
  }

  /**
   * Snapshot the current row (creditToNow first if you need fresh totals —
   * the flusher does). endedAt is the snapshot moment: the row is upserted
   * per flush, so endedAt reads "last flushed moment of the visit".
   */
  toRecord(): ReadingSessionRecord {
    const endedMs = this.now();
    return {
      schemaVersion: 1,
      id: this.visitId,
      articleId: this.articleId,
      startedAt: new Date(this.startedAtMs).toISOString(),
      endedAt: new Date(endedMs).toISOString(),
      startOffset: this.startOffset,
      endOffset: this.lastOffset,
      activeSeconds: Math.floor(this.creditedMs / 1000),
    };
  }
}
