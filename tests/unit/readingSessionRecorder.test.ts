// tests/unit/readingSessionRecorder.test.ts
// Issue #34 — the reading-session accumulator truth tables (pure domain
// logic, injectable clock — no DOM, no Dexie, no fake timers):
//   - accrual: time between activity pulses credits; begin seeds the idle
//     window so the open itself is the first heartbeat
//   - idle cap: activity-free time beyond IDLE_CAP_MS stops accruing and is
//     never credited retroactively (a parked tab does not inflate the count)
//   - resume: a pulse after an idle gap re-arms the window
//   - offsets: the first pulse confirms startOffset; endOffset tracks the
//     last pulse
//   - dormancy: no pulse AND no credited time (the StrictMode twin-mount
//     signal — decided BEFORE the terminal credit, the endActive ordering
//     contract)
//   - identity + row shape: one stable visit id across every snapshot;
//     activeSeconds floors; schemaVersion literal
import { describe, expect, it } from "vitest";
import {
  ReadingSessionRecorder,
  IDLE_CAP_MS,
} from "../../src/reader/readingSessionRecorder";

/** A manually-advanced clock: deterministic truth tables without timers. */
function manualClock(startAt = 0): { now(): number; advance(ms: number): void } {
  let t = startAt;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function makeRecorder(
  clock: ReturnType<typeof manualClock>,
  overrides: { idleCapMs?: number; uuid?: () => string } = {},
): ReadingSessionRecorder {
  const rec = new ReadingSessionRecorder("session-article", {
    now: clock.now,
    idleCapMs: overrides.idleCapMs,
    uuid: overrides.uuid,
  });
  rec.begin({ initialOffset: 0 });
  return rec;
}

describe("ReadingSessionRecorder — accrual (issue #34)", () => {
  it("credits the time between activity pulses", () => {
    const clock = manualClock();
    const rec = makeRecorder(clock);

    clock.advance(10_000);
    rec.activity(100); // pulse at t=10s
    clock.advance(15_000);
    rec.activity(200); // pulse at t=25s
    rec.creditToNow();

    expect(rec.toRecord().activeSeconds).toBe(25);
  });

  it("begin seeds the idle window — silent time right after the open accrues", () => {
    const clock = manualClock();
    const rec = makeRecorder(clock);

    clock.advance(20_000); // no pulse at all — just the seeded window
    rec.creditToNow();

    expect(rec.toRecord().activeSeconds).toBe(20);
  });

  it("idle time past the cap stops accruing (a parked tab does not inflate)", () => {
    const clock = manualClock();
    const rec = makeRecorder(clock);

    clock.advance(30_000);
    rec.activity(50); // last heartbeat at t=30s
    clock.advance(300_000); // parked for 5 minutes
    rec.creditToNow();

    // Credited: 30s before the pulse + the 60s cap window — never the
    // remaining 270s of parking.
    expect(rec.toRecord().activeSeconds).toBe(30 + IDLE_CAP_MS / 1000);
  });

  it("idle time is never credited retroactively — a later flush cannot resurrect it", () => {
    const clock = manualClock();
    const rec = makeRecorder(clock);

    clock.advance(10_000);
    rec.activity(10);
    clock.advance(120_000); // idle past the cap
    rec.creditToNow(); // first flush lands AFTER the parking
    const afterIdle = rec.toRecord().activeSeconds;

    clock.advance(120_000); // still parked
    rec.creditToNow(); // a second flush must add nothing

    expect(afterIdle).toBe(10 + IDLE_CAP_MS / 1000);
    expect(rec.toRecord().activeSeconds).toBe(10 + IDLE_CAP_MS / 1000);
  });

  it("a pulse after an idle gap re-arms the window and accrues again", () => {
    const clock = manualClock();
    const rec = makeRecorder(clock);

    clock.advance(10_000);
    rec.activity(10);
    clock.advance(120_000); // parked past the cap
    rec.activity(20); // the reader returns — heartbeat at t=130s
    clock.advance(30_000);
    rec.activity(30);
    rec.creditToNow();

    expect(rec.toRecord().activeSeconds).toBe(10 + IDLE_CAP_MS / 1000 + 30);
  });

  it("activeSeconds floors fractional credit", () => {
    const clock = manualClock();
    const rec = makeRecorder(clock);

    clock.advance(1_499);
    rec.creditToNow();

    expect(rec.toRecord().activeSeconds).toBe(1);
  });
});

describe("ReadingSessionRecorder — offsets (issue #34)", () => {
  it("the first pulse confirms startOffset, superseding the begin seed", () => {
    const clock = manualClock();
    const rec = new ReadingSessionRecorder("session-article", { now: clock.now });
    rec.begin({ initialOffset: 0 });

    clock.advance(5_000);
    rec.activity(4_210); // a restore jump lands the reader at 4210

    expect(rec.toRecord().startOffset).toBe(4_210);
  });

  it("startOffset stays at the first pulse while endOffset tracks the last", () => {
    const clock = manualClock();
    const rec = makeRecorder(clock);

    rec.activity(100);
    clock.advance(1_000);
    rec.activity(500);
    clock.advance(1_000);
    rec.activity(900);

    const record = rec.toRecord();
    expect(record.startOffset).toBe(100);
    expect(record.endOffset).toBe(900);
  });

  it("a pulseless visit keeps the begin offsets", () => {
    const clock = manualClock();
    const rec = new ReadingSessionRecorder("session-article", { now: clock.now });
    rec.begin({ initialOffset: 320 });

    clock.advance(2_000);
    rec.creditToNow();

    const record = rec.toRecord();
    expect(record.startOffset).toBe(320);
    expect(record.endOffset).toBe(320);
  });
});

describe("ReadingSessionRecorder — dormancy + write discipline (issue #34)", () => {
  it("a pulseless, uncredited session is dormant; the terminal credit ordering keeps it so", () => {
    const clock = manualClock();
    const rec = makeRecorder(clock);

    // The endActive ordering contract: dormancy is decided BEFORE the
    // terminal creditToNow — the seeded idle window would otherwise credit
    // a sub-tick sliver and flip the flag (breaking the StrictMode
    // twin-mount coalescing).
    clock.advance(5);
    expect(rec.isDormant()).toBe(true);

    // After a credit the recorder honestly reports non-dormancy (credited
    // time exists) — which is exactly why endActive checks first.
    rec.creditToNow();
    expect(rec.isDormant()).toBe(false);
    expect(rec.toRecord().activeSeconds).toBe(0);
  });

  it("any pulse ends dormancy; credited time ends dormancy", () => {
    const clock = manualClock();
    const pulsed = makeRecorder(clock);
    pulsed.activity(0);
    expect(pulsed.isDormant()).toBe(false);

    const clock2 = manualClock();
    const ticked = makeRecorder(clock2);
    clock2.advance(15_000);
    ticked.creditToNow(); // a ticker flush landed real credit
    expect(ticked.isDormant()).toBe(false);
  });

  it("the visit id is stable across every snapshot (the upsert key)", () => {
    const clock = manualClock();
    const ids: string[] = [];
    let n = 0;
    const rec = makeRecorder(clock, { uuid: () => `visit-${(n += 1)}` });
    ids.push(rec.id, rec.toRecord().id);
    clock.advance(1_000);
    rec.activity(5);
    ids.push(rec.toRecord().id);

    expect(ids).toEqual(["visit-1", "visit-1", "visit-1"]);
  });

  it("dirty tracks writes: begin is dirty, markWritten cleans, pulses re-dirty", () => {
    const clock = manualClock();
    const rec = makeRecorder(clock);

    expect(rec.dirtySinceWrite()).toBe(true);
    rec.markWritten();
    expect(rec.dirtySinceWrite()).toBe(false);

    // The parked-tab write-churn shape: the cap window after the last
    // heartbeat credits ONCE (the flush that lands the capped totals), and
    // every later idle flush adds nothing — no dirty, no write.
    clock.advance(10_000);
    rec.activity(7);
    rec.markWritten();
    clock.advance(60_000); // idle past the cap
    rec.creditToNow();
    expect(rec.dirtySinceWrite()).toBe(true); // capped totals land once
    rec.markWritten();
    clock.advance(600_000); // still parked
    rec.creditToNow();
    expect(rec.dirtySinceWrite()).toBe(false); // no write churn
    clock.advance(1_000);
    rec.activity(9);
    expect(rec.dirtySinceWrite()).toBe(true);
  });

  it("the record snapshot carries the schemaVersion literal and ISO timestamps", () => {
    const clock = manualClock(1_758_000_000_000);
    const rec = makeRecorder(clock);
    clock.advance(1_000);
    rec.activity(3);
    const record = rec.toRecord();

    expect(record.schemaVersion).toBe(1);
    expect(record.articleId).toBe("session-article");
    expect(record.startedAt).toBe("2025-09-16T05:20:00.000Z");
    expect(new Date(record.endedAt).getTime()).toBeGreaterThan(
      new Date(record.startedAt).getTime(),
    );
    expect(record.activeSeconds).toBe(1);
  });
});
