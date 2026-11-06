// tests/e2e/pagination/failure-classes.spec.ts
// Issue #240 — the distinction proof: ordinary length/capacity continuation
// is SUCCESS, never a failure. A work whose giant prose exhausts window
// capacity advances through bounded continuations while the diagnostic bus
// records NO dom-fallback events and no banner ever mounts — the reader
// sees pages, not explanations. (The failure classes themselves — real
// unpageable elements and processing errors — are covered by
// giant-prose.spec.ts's giant-code test and fallback-banner.spec.ts.)
//
// Observable readiness only: the __lemPagination DEV publication, the DEV
// DiagnosticBus hook, and the shared harness waits — never fixed sleeps.
import { test, expect, type Page } from "@playwright/test";
import { giantProseArticle } from "../../fixtures/giantProse";
import { prepareFreshPage, seedRows } from "../portability/_portability";
import { waitForPaginationSettled } from "./_harness";
import { BASE } from "../_base";

const article = giantProseArticle();

// Continuation turns cross window seams; give the walk a generous budget.
test.setTimeout(120_000);

interface Dev {
  status: string;
  anchorOffset: number | null;
  publicationSeq: number;
  pagesLength: number;
}

async function readDev(page: Page): Promise<Dev> {
  return page.evaluate(() => {
    const dev = (window as unknown as { __lemPagination?: Dev }).__lemPagination;
    return {
      status: dev?.status ?? "absent",
      anchorOffset: dev?.anchorOffset ?? null,
      publicationSeq: dev?.publicationSeq ?? 0,
      pagesLength: dev?.pagesLength ?? 0,
    };
  });
}

async function failureEvents(page: Page): Promise<{ kind: string; reason?: string }[]> {
  return page.evaluate(() => {
    const bus = (
      window as unknown as {
        __lemDiagnosticBus?: { recent: () => { kind: string; reason?: string }[] };
      }
    ).__lemDiagnosticBus;
    return (bus?.recent() ?? [])
      .filter((e) => e.kind === "dom-fallback" || e.kind === "measurement-error")
      .map((e) => ({ kind: e.kind, reason: e.reason }));
  });
}

test.beforeEach(async ({ page }) => {
  await prepareFreshPage(page);
  await seedRows(page, { articles: [article] });
});

test.describe("capacity continuation is never a failure (issue #240)", () => {
  test("ordinary length continuation advances with zero failure events and no banner", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 700 });
    await page.goto(`${BASE}/#/article/${article.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: article.provenance.title }),
    ).toBeVisible();
    await waitForPaginationSettled(page);
    const first = await readDev(page);
    expect(first.status).toBe("ok");

    // Turn through the first window's pages and across the first capacity
    // seam — ordinary exhausted window capacity, the continuation path.
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("ArrowRight");
      await waitForPaginationSettled(page);
    }
    const advanced = await readDev(page);
    expect(advanced.status).toBe("ok");
    expect(advanced.publicationSeq).toBeGreaterThan(first.publicationSeq);
    expect(advanced.anchorOffset).not.toBeNull();
    expect(advanced.anchorOffset).not.toBe(first.anchorOffset);

    // The distinction: NO failure events anywhere in the bus, NO banner.
    expect(await failureEvents(page)).toEqual([]);
    await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);

    // Reverse crosses the seam back — still success, still silent.
    await page.keyboard.press("ArrowLeft");
    await waitForPaginationSettled(page);
    expect(await failureEvents(page)).toEqual([]);
    await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
  });
});
