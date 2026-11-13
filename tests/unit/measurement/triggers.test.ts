// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { TriggerCoalescer } from "../../../src/measurement/triggers";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";

describe("measurement scheduling", () => {
  afterEach(() => vi.useRealTimers());

  it("measures a requested navigation scope now, without waiting for a pending settings burst", () => {
    vi.useFakeTimers();
    const snapshots: number[] = [];
    const coalescer = new TriggerCoalescer({
      articleEl: document.createElement("article"),
      getSettings: () => DEFAULT_SETTINGS,
      onTrigger: (constraints) => snapshots.push(constraints.size),
    });
    try {
      coalescer.notifySettingsChange();
      coalescer.measureScopeNow();
      expect(snapshots).toEqual([18]);
      vi.advanceTimersByTime(400);
      expect(snapshots).toEqual([18]);
      coalescer.notifySettingsChange();
      vi.advanceTimersByTime(399);
      expect(snapshots).toEqual([18]);
      vi.advanceTimersByTime(1);
      expect(snapshots).toEqual([18, 18]);
      coalescer.disconnect();
      coalescer.measureScopeNow();
      expect(snapshots).toEqual([18, 18]);
    } finally {
      coalescer.disconnect();
    }
  });
});
