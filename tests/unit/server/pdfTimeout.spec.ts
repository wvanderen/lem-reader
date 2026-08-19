// tests/unit/server/pdfTimeout.spec.ts
// Plan 13-05 Task 2 — the D13-11 fake-timers closure of the Phase 11
// acknowledged gap (11-VERIFICATION.md § Acknowledged Gaps): the
// `withPdfDocument` timeout-firing branch (30 s race → typed server-error +
// destroy-in-finally) had NO automated coverage. This spec proves the firing
// path by test alone — ZERO production changes (the gap's own closure terms).
//
// Mechanism (13-RESEARCH §Pattern 5): mock the unpdf document loader so it
// resolves a minimal stub proxy (numPages within the page cap, a destroy spy
// on loadingTask), run an operation promise that NEVER settles inside the
// race, then `vi.advanceTimersByTimeAsync` past PDF_EXTRACTION_TIMEOUT_MS and
// assert the typed rejection + the always-destroy finally. Import pattern
// follows the sibling `pdf-to-blocks.spec.ts`; fake-timers discipline follows
// the `tests/component/PageTurnControls.test.tsx` L64 precedent (real timers
// restored in afterEach).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDocumentProxy } from "unpdf";
import { withPdfDocument } from "../../../server/pdfToBlocks";
import { IngestionError } from "../../../server/errors";
import { PDF_EXTRACTION_TIMEOUT_MS } from "../../../server/limits";

vi.mock("unpdf", async (importOriginal) => {
  // Only the document loader is replaced; the rest of unpdf's surface stays
  // real so the module shape is unchanged for pdfToBlocks' other imports.
  const actual = await importOriginal<typeof import("unpdf")>();
  return { ...actual, getDocumentProxy: vi.fn() };
});

/** The minimal proxy surface withPdfDocument touches: numPages (checked by
 * assertPageCap BEFORE the race) + loadingTask.destroy (the always-destroy
 * finally). The operation receives whatever object the loader resolves, so
 * the stub needs no pdfjs machinery beyond these two members. */
function stubProxy(): {
  destroy: ReturnType<typeof vi.fn>;
  proxy: Awaited<ReturnType<typeof getDocumentProxy>>;
} {
  const destroy = vi.fn().mockResolvedValue(undefined);
  const proxy = { numPages: 1, loadingTask: { destroy } };
  return { destroy, proxy: proxy as unknown as Awaited<ReturnType<typeof getDocumentProxy>> };
}

/** Outcome capturer: attaches BOTH handlers immediately so the race rejection
 * is never unhandled between the timer firing and the assertion. */
function capture<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  return p.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

describe("withPdfDocument — 30s extraction-timeout firing path (D13-11)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getDocumentProxy).mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a never-settling operation rejects with IngestionError reason server-error and the exact timeout copy", async () => {
    const { proxy } = stubProxy();
    vi.mocked(getDocumentProxy).mockResolvedValue(proxy);
    // Bytes are never parsed — the loader is mocked; the value is inert.
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    const outcome = capture(
      withPdfDocument(bytes, () => new Promise<string>(() => {})),
    );
    // Flush the mocked loader's microtask first so the race timer is
    // installed at fake-time 0 BEFORE the clock advances past it.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(PDF_EXTRACTION_TIMEOUT_MS + 1);

    const result = await outcome;
    if (result.ok) {
      throw new Error("expected the timeout race to reject; it resolved instead");
    }
    const err = result.error;
    expect(err).toBeInstanceOf(IngestionError);
    expect((err as IngestionError).reason).toBe("server-error");
    expect((err as IngestionError).message).toBe(
      "PDF extraction timed out — the document was too complex to read safely.",
    );
  });

  it("calls loadingTask.destroy exactly once on the timeout path (always-destroy finally)", async () => {
    const { destroy, proxy } = stubProxy();
    vi.mocked(getDocumentProxy).mockResolvedValue(proxy);
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    const outcome = capture(
      withPdfDocument(bytes, () => new Promise<string>(() => {})),
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(PDF_EXTRACTION_TIMEOUT_MS + 1);

    const result = await outcome;
    expect(result.ok).toBe(false); // rejection observed first…
    expect(destroy).toHaveBeenCalledTimes(1); // …yet destroy already ran in the finally
  });

  it("control: a promptly-resolving operation wins the race without rejection and destroy still runs once", async () => {
    const { destroy, proxy } = stubProxy();
    vi.mocked(getDocumentProxy).mockResolvedValue(proxy);
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    const value = await withPdfDocument(bytes, async (pdf) => {
      expect(pdf.numPages).toBe(1); // the stub proxy is what reaches the operation
      return "assembled";
    });
    expect(value).toBe("assembled");
    expect(destroy).toHaveBeenCalledTimes(1); // race wiring intact both ways
  });
});
