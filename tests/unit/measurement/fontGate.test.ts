import { describe, expect, it } from "vitest";
import { AbortError, awaitFontsReady } from "../../../src/measurement/fontGate";

/**
 * Font gate (D3-06). No measurement result is trusted before
 * document.fonts.ready resolves. A font swap invalidates every predicted
 * line break (Pitfall 3 — RESEARCH §Common Pitfalls 3), so every measurement
 * pass must await `.ready` AFTER its trigger fires (the promise is re-
 * awaitable; it resolves fresh for each new font set).
 *
 * jsdom provides document.fonts as a FontFaceSet whose `.ready` is a
 * controllable promise — we stub it to drive both the resolve path and the
 * abort path deterministically.
 */

/** Stub document.fonts.ready with a controller so a test can resolve it. */
function stubFontsReady(): { ready: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const ready = new Promise<void>((r) => {
    resolve = r;
  });
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready },
  });
  return { ready, resolve };
}

describe("awaitFontsReady(signal)", () => {
  it("resolves only after document.fonts.ready resolves (D3-06)", async () => {
    const { resolve } = stubFontsReady();
    const controller = new AbortController();
    let resolved = false;
    const p = awaitFontsReady(controller.signal).then(() => {
      resolved = true;
    });
    // Give microtasks a flush — the gate should still be pending.
    await Promise.resolve();
    expect(resolved, "must NOT resolve before fonts.ready").toBe(false);
    resolve();
    await p;
    expect(resolved, "must resolve after fonts.ready").toBe(true);
  });

  it("throws AbortError when the signal is already aborted before the await", async () => {
    stubFontsReady();
    const controller = new AbortController();
    controller.abort();
    await expect(awaitFontsReady(controller.signal)).rejects.toBeInstanceOf(
      AbortError,
    );
  });

  it("throws AbortError when the signal aborts during the await", async () => {
    // Stub `.ready` to a promise that never resolves on its own, then abort
    // mid-flight. The gate must surface the abort as an AbortError.
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: new Promise<void>(() => {}) },
    });
    const controller = new AbortController();
    const p = awaitFontsReady(controller.signal);
    controller.abort();
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });
});

describe("AbortError", () => {
  it("is an Error subclass carrying the right name", () => {
    const e = new AbortError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("AbortError");
  });
});
