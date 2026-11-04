// tests/e2e/pagination/diagnostic-trail.spec.ts
// Issue #255 — the opt-in pagination event trail must capture decisive,
// ordered evidence for the exact sequences CI-repair sessions misdiagnose:
// a manual turn (receipt → publication → anchor movement) and a reflow
// (repagination publication with a preserved canonical anchor). It also
// proves the export path: the trail attaches to failure artifacts through
// the shared harness helper.
//
// The trail is content-free (ids, sequence numbers, offsets, causes) — no
// article text, no notes — and it only records when enabled
// (enablePaginationTrail in beforeEach) in DEV builds.
import { expect, test } from "@playwright/test";
import { BASE } from "../_base";
import {
  attachPaginationTrail,
  enablePaginationTrail,
  markPaginationEpoch,
  openPaginated,
  readPaginationTrail,
  waitForPageSettled,
  waitForRepagination,
  waitForTurnAcknowledged,
} from "./_harness";

const FIXTURE = "essay-long-form";

test.beforeEach(async ({ page }) => {
  await enablePaginationTrail(page);
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    }),
  );
  await page.goto(`${BASE}/`);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("lem-reader");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await attachPaginationTrail(page);
  }
});

test.describe("pagination event trail diagnostics (#255)", () => {
  test("records the ordered evidence for a settled manual turn", async ({ page }) => {
    const before = await openPaginated(page, FIXTURE);
    expect(before.status).toBe("ok");

    const initial = await readPaginationTrail(page);
    expect(initial, "trail getter must exist once the surface mounted").not.toBeNull();
    expect(initial!.recording).toBe(true);
    expect(initial!.events[0]?.kind).toBe("trail-start");
    const initialPublication = initial!.events.find((e) => e.kind === "publication");
    expect(initialPublication?.cause).toBe("initial");
    expect(initialPublication?.status).toBe("ok");
    expect(initialPublication?.anchorOffset).toBe(before.anchorOffset);

    await page.getByRole("button", { name: "Next page" }).click();
    const after = await waitForTurnAcknowledged(page, before, "next");

    const trail = await readPaginationTrail(page);
    expect(trail!.recording).toBe(true);
    // Ordering is the point: the publication for the turn commits first,
    // then the guard's completed pass, then the turn receipt that pairs the
    // manual turn with its settled destination.
    const kinds = trail!.events.map((e) => e.kind);
    const turnPublicationIdx = kinds.lastIndexOf("publication");
    const overflowCheckIdx = kinds.indexOf("overflow-check", turnPublicationIdx);
    const receiptIdx = kinds.indexOf("turn-receipt", turnPublicationIdx);
    expect(overflowCheckIdx).toBeGreaterThan(turnPublicationIdx);
    expect(receiptIdx).toBeGreaterThan(overflowCheckIdx);

    const turnPublication = trail!.events[turnPublicationIdx];
    expect(turnPublication?.cause).toBe("turn");
    expect(turnPublication?.anchorMoved).toBe(true);
    // The receipt completes asynchronously AFTER the destination settles —
    // it is its own trail event carrying the turn identity (seq ordering
    // above proves it follows the publication + guard pass).
    const receipt = trail!.events[receiptIdx];
    expect(receipt?.turnDirection).toBe("next");
    expect(receipt?.turnSeq).toBeGreaterThanOrEqual(1);
    // The trail and the publication substrate agree on the same anchor.
    expect(turnPublication?.anchorOffset).toBe(after.anchorOffset);
    // Module-monotonic seq across all kinds.
    const seqs = trail!.events.map((e) => e.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });

  test("records a reflow publication with the canonical anchor preserved", async ({ page }) => {
    const dev0 = await openPaginated(page, FIXTURE);
    expect(dev0.status).toBe("ok");
    expect(dev0.pagesLength).toBeGreaterThanOrEqual(2);

    // Move to a mid-article passage, then trigger the reflow (viewport
    // resize) exactly like the repagination-anchor scenario.
    await page.getByRole("button", { name: "Next page" }).click();
    const settled = await waitForPageSettled(page, 1);
    expect(settled.anchorOffset).toBeGreaterThan(0);

    await markPaginationEpoch(page);
    await page.setViewportSize({ width: 480, height: 700 });
    const repaged = await waitForRepagination(page);
    expect(repaged.status).toBe("ok");

    const trail = await readPaginationTrail(page);
    const publications = trail!.events.filter((e) => e.kind === "publication");
    // The resize's reflow is the first publication after the pre-resize one;
    // at this viewport the guard may then legitimately correct the raw
    // engine output — its own publication, cause "overflow-correction",
    // each preceded by an overflow-correction event. The trail keeps the
    // reflow and the correction distinguishable; that is the point.
    const reflow = publications.find(
      (p) => p.cause === "repagination" && (p.publicationSeq ?? 0) > (settled.publicationSeq ?? 0),
    );
    expect(reflow, "the resize must record a repagination publication").toBeTruthy();
    expect(reflow?.status).toBe("ok");
    // The settled state is the LAST publication — reflow or correction.
    const final = publications.at(-1);
    expect(final?.anchorOffset).toBe(repaged.anchorOffset);
    expect(["repagination", "overflow-correction"]).toContain(final?.cause);
    if (final?.cause === "overflow-correction") {
      const correction = trail!.events.filter((e) => e.kind === "overflow-correction");
      expect(correction.length).toBeGreaterThan(0);
    }
    // The reflow is NOT a turn: no turn receipt after it.
    const receiptsAfterReflow = trail!.events.filter(
      (e) => e.kind === "turn-receipt" && (reflow ? e.seq > reflow.seq : false),
    );
    expect(receiptsAfterReflow).toEqual([]);
    expect(final?.anchorOffset).toBeGreaterThan(0);
    // Scope-stable reflow: the measurement window did not change.
    expect(reflow?.scopeChanged ?? false).toBe(false);
  });

  test("exports the trail as a test artifact through the shared helper", async ({ page }) => {
    await openPaginated(page, FIXTURE);
    await attachPaginationTrail(page, "pagination-trail-export.json");
    const attached = test.info().attachments.find((a) => a.name === "pagination-trail-export.json");
    expect(attached, "the export path must attach the bounded, content-free trail").toBeTruthy();
    expect(attached!.contentType).toBe("application/json");
  });
});
