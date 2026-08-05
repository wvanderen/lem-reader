import { describe, expect, it } from "vitest";
import { Epoch } from "../../../src/measurement/epoch";

/**
 * Epoch invariant (PAGE-07 + D3-07). A monotonic counter paired with an
 * AbortController so each new trigger cancels in-flight work for older
 * constraints and only the newest epoch ever wins at the commit guard.
 *
 * Guards: bump() is strictly increasing; each bump aborts the previous
 * signal; isCurrent() is true only for the newest epoch.
 */

describe("Epoch.bump()", () => {
  it("returns a strictly-increasing epoch number starting at 1", () => {
    const e = new Epoch();
    const a = e.bump();
    const b = e.bump();
    const c = e.bump();
    expect(a.epoch).toBe(1);
    expect(b.epoch).toBe(2);
    expect(c.epoch).toBe(3);
    expect(b.epoch - a.epoch).toBe(1);
    expect(c.epoch - b.epoch).toBe(1);
  });

  it("returns a fresh AbortSignal per bump", () => {
    const e = new Epoch();
    const a = e.bump();
    const b = e.bump();
    expect(a.signal).not.toBe(b.signal);
  });

  it("aborts the previous signal on each bump (D3-07 — cancel in-flight)", () => {
    const e = new Epoch();
    const first = e.bump();
    const second = e.bump();
    expect(first.signal.aborted, "first signal must abort after second bump").toBe(
      true,
    );
    // The newest signal stays live until the next bump.
    expect(second.signal.aborted, "newest signal must remain live").toBe(false);
    const third = e.bump();
    expect(second.signal.aborted, "second signal aborts after third bump").toBe(true);
    expect(third.signal.aborted).toBe(false);
  });
});

describe("Epoch.isCurrent(candidate)", () => {
  it("is true for the newest bumped epoch and false for any earlier one (PAGE-07)", () => {
    const e = new Epoch();
    const a = e.bump();
    const b = e.bump();
    expect(e.isCurrent(a.epoch), "older epoch must NOT be current").toBe(false);
    expect(e.isCurrent(b.epoch), "newest epoch must be current").toBe(true);
    const c = e.bump();
    expect(e.isCurrent(b.epoch), "previously-current is now stale").toBe(false);
    expect(e.isCurrent(c.epoch)).toBe(true);
  });

  it("is false for an epoch number that was never issued", () => {
    const e = new Epoch();
    e.bump(); // epoch 1
    e.bump(); // epoch 2
    expect(e.isCurrent(0)).toBe(false);
    expect(e.isCurrent(99)).toBe(false);
    expect(e.isCurrent(-1)).toBe(false);
  });
});

describe("Epoch.current()", () => {
  it("returns 0 before any bump and the latest epoch number after", () => {
    const e = new Epoch();
    expect(e.current()).toBe(0);
    e.bump();
    expect(e.current()).toBe(1);
    e.bump();
    e.bump();
    expect(e.current()).toBe(3);
  });
});
