// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { TriggerCoalescer } from "../../../src/measurement/triggers";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";

describe("measurement scheduling", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps an immediately measured scope stable through initial and height-only resize deliveries", () => {
    vi.useFakeTimers();
    let resized = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const articleEl = document.createElement("article");
    let width = 328;
    let height = 5000;
    vi.spyOn(articleEl, "getBoundingClientRect").mockImplementation(
      () => ({ width, height }) as DOMRect,
    );
    const onTrigger = vi.fn();
    const coalescer = new TriggerCoalescer({
      articleEl,
      getSettings: () => DEFAULT_SETTINGS,
      onTrigger,
    });
    try {
      coalescer.measureScopeNow();
      resized(); // ResizeObserver always delivers once after observe().
      vi.advanceTimersByTime(400);
      expect(onTrigger).toHaveBeenCalledTimes(1);
      height = 6000; // projection/asset height is not a line-wrap constraint
      resized();
      vi.advanceTimersByTime(400);
      expect(onTrigger).toHaveBeenCalledTimes(1);
      width = 400;
      resized();
      vi.advanceTimersByTime(399);
      expect(onTrigger).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(onTrigger).toHaveBeenCalledTimes(2);
      expect(onTrigger.mock.calls[1]![0].viewportWidthPx).toBe(400);
      articleEl.dispatchEvent(new Event("load"));
      vi.advanceTimersByTime(400);
      expect(onTrigger).toHaveBeenCalledTimes(3); // explicit image loads still invalidate
      coalescer.notifySettingsChange();
      vi.advanceTimersByTime(400);
      expect(onTrigger).toHaveBeenCalledTimes(4);
    } finally {
      coalescer.disconnect();
    }
  });

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
