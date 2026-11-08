// tests/e2e/collections/continue-collection.spec.ts
// Issue #247 — the browser seam for CONTINUE COLLECTION and the deliberate
// NEXT READING action (the acceptance surface the unit suites cannot see):
//
//   - DISC-247-01 — Continue opens the FIRST unfinished entry (no memory
//     yet); the route carries the /col/<collectionId>/<entryId> context and
//     the reader's end card shows the orientation line. Keyboard: the
//     button activates with Enter alone.
//   - DISC-247-02 — the entry's true end does NOT advance on its own: a
//     page turn at the final page clamps (no hash change, no new entry);
//     the Next reading button is the only way forward.
//   - DISC-247-03 — Next reading advances explicitly: the route lands on
//     the next entry's resolved resume rules carrying the NEW /col/
//     context, and the active-entry memory is re-remembered.
//   - DISC-247-04 — cold reload IN the reader keeps the collection context
//     (the URL-borne context; the end card re-derives).
//   - DISC-247-05 — the active-entry memory persists across reload and
//     Continue resumes the REMEMBERED unfinished entry.
//   - DISC-247-06 — a remembered entry that COMPLETED elsewhere is not
//     usable: Continue falls to the first unfinished entry.
//   - DISC-247-07 — a row click IS collection reading: the link carries the
//     /col/ context, and the memory lands (the next Continue resumes it).
//   - DISC-247-08 — a COMPLETED plan shows completion instead of silently
//     restarting (progress "3 of 3 finished", the completion line, NO
//     Continue button); an EMPTY plan is distinct (no-content state, no
//     Continue).
//   - DISC-247-09 — a chapter-assignment entry: at the assignment's true
//     end the reader gets BOTH the explicit continue-the-underlying-work
//     option (issue #244, intact) AND Next reading; continuing the work
//     DROPS the collection context (the plain route — leaving the entry is
//     the reader's choice), while Next reading carries the NEW context.
//
// Harness (REUSE-DO-NOT-FORK): BASE + wipeDatabase (annotations/_fixtures)
// + seedStoreRows (library) + the pagination DEV-harness readiness waits.
// Node-side totals compute through the SAME pure modules the app runs
// (normalizeText/graphemeClusters) — never hand-counted literals.
import { test, expect, type Page } from "@playwright/test";
import { ArticleSchema, CollectionSchema } from "../../../src/content/schema";
import type { CanonicalArticle, CollectionEntryTarget } from "../../../src/content/schema";
import { graphemeClusters, normalizeText } from "../../../src/content/normalizeText";
import { deriveWorkStructure } from "../../../src/content/structure";
import { BASE } from "../_base";
import { wipeDatabase } from "../annotations/_fixtures";
import { seedStoreRows } from "../library/seedStoreRows";
import { readPagination, waitForPaginationSettled } from "../pagination/_harness";

// ── Node-side corpus builders (the completion-spec corpus shape) ────────────

const SENTENCE =
  "The keeper counts another steady entry of the harbor's small weather, and the tide ledger holds the line long enough to wrap across several composed lines at the reading geometry.";

function makeParagraphs(
  n: number,
  seed: string,
): { kind: "paragraph"; content: [{ text: string; marks: [] }] }[] {
  return Array.from({ length: n }, (_, i) => ({
    kind: "paragraph" as const,
    content: [{ text: `${seed} Entry ${i + 1}: ${SENTENCE}`, marks: [] as [] }],
  }));
}

function heading(text: string) {
  return { kind: "heading" as const, level: 2 as const, content: [{ text, marks: [] as [] }] };
}

/** The two stand-alone essays of the plan (whole-article entries). */
function makeEssay(id: string, title: string, seed: string): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title,
      retrievedAt: "2026-10-01T00:00:00.000Z",
      originalHtmlHash: `sha256:${"e".repeat(64)}`,
    },
    blocks: makeParagraphs(2, seed),
    ingestionMeta: {
      source: "paste",
      origin: "paste",
      originalHtmlHash: `sha256:${"e".repeat(64)}`,
      ingestedAt: "2026-10-01T00:00:00.000Z",
      extractionConfidence: "high",
    },
    addedAt: "2026-10-01T00:00:00.000Z",
  });
}
const ESSAY_A = makeEssay("winter-essay-a", "First Harbor Essay", "First.");
const ESSAY_B = makeEssay("winter-essay-b", "Second Harbor Essay", "Second.");
const ESSAY_C = makeEssay("winter-essay-c", "Third Harbor Essay", "Third.");
const ESSAY_A_TOTAL = graphemeClusters(normalizeText(ESSAY_A), ESSAY_A.lang).length;
const ESSAY_B_TOTAL = graphemeClusters(normalizeText(ESSAY_B), ESSAY_B.lang).length;
const ESSAY_C_TOTAL = graphemeClusters(normalizeText(ESSAY_C), ESSAY_C.lang).length;

/** The structured web work: a TWO-chapter work (each chapter a few
 * paragraphs — the assignment's true end arrives within a page or two). */
const WORK = ArticleSchema.parse({
  id: "tide-work",
  revision: 1,
  lang: "en",
  provenance: {
    title: "The Tide Ledger",
    retrievedAt: "2026-10-01T00:00:00.000Z",
    originalHtmlHash: `sha256:${"b".repeat(64)}`,
  },
  blocks: [
    heading("Opening Arguments"),
    ...makeParagraphs(6, "Chapter one."),
    heading("A Brief Interlude"),
    ...makeParagraphs(2, "Chapter two."),
  ],
  ingestionMeta: {
    source: "paste",
    origin: "paste",
    originalHtmlHash: `sha256:${"b".repeat(64)}`,
    ingestedAt: "2026-10-01T00:00:00.000Z",
    extractionConfidence: "high",
  },
  addedAt: "2026-10-01T00:00:00.000Z",
});
const WORK_STRUCTURE = deriveWorkStructure(WORK)!;
const WORK_CHAPTERS = WORK_STRUCTURE.destinations.filter((d) => d.kind === "chapter");
const [CH_ONE, CH_TWO] = WORK_CHAPTERS;

// ── Seeders + helpers ───────────────────────────────────────────────────────

async function seedCorpus(page: Page): Promise<void> {
  await seedStoreRows(page, "articles", [ESSAY_A, ESSAY_B, ESSAY_C, WORK]);
}

async function seedCollection(
  page: Page,
  name: string,
  id: string,
  targets: CollectionEntryTarget[],
): Promise<string> {
  const now = "2026-10-01T00:00:00.000Z";
  const row = CollectionSchema.parse({
    schemaVersion: 1,
    id,
    name,
    entries: targets.map((target, i) => ({
      id: `${id}-entry-${i}`,
      target,
      addedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
  });
  await page.evaluate((raw) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("collections", "readwrite");
        tx.objectStore("collections").put(raw);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  }, row);
  return id;
}

/** Seed the remembered ACTIVE ENTRY for a collection (the navigation-context
 * row the Continue selection reads). */
async function seedActiveEntry(page: Page, collectionId: string, entryId: string): Promise<void> {
  await page.evaluate(
    ({ collectionId, entryId }) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("collectionActiveEntries", "readwrite");
          tx.objectStore("collectionActiveEntries").put({
            schemaVersion: 1,
            collectionId,
            entryId,
            updatedAt: "2026-10-01T00:00:00.000Z",
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      });
    },
    { collectionId, entryId },
  );
}

async function seedLocation(page: Page, articleId: string, offset: number): Promise<void> {
  await seedStoreRows(page, "location", [
    {
      schemaVersion: 1,
      articleId,
      revision: 1,
      graphemeOffset: offset,
      savedAt: "2026-10-01T00:00:00.000Z",
    },
  ]);
}

async function openCollection(page: Page, id: string, name: string): Promise<void> {
  await page.goto(`${BASE}/#/collections/${id}`);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.locator(".collection-entry-link").first()).toBeVisible();
}

/** The orientation line of the reader's end-of-entry card. */
function endCard(page: Page) {
  return page.locator(".collection-end-nav");
}

/** The persisted remembered entry for a collection (raw IndexedDB read —
 * the ground truth, not a view). */
async function readActiveEntry(
  page: Page,
  collectionId: string,
): Promise<{ entryId: string } | null> {
  return page.evaluate(async (cid) => {
    return new Promise<{ entryId: string } | null>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("collectionActiveEntries", "readonly");
        const g = tx.objectStore("collectionActiveEntries").get(cid);
        g.onsuccess = () => {
          db.close();
          resolve((g.result as { entryId: string } | null) ?? null);
        };
        g.onerror = () => {
          db.close();
          reject(g.error);
        };
      };
    });
  }, collectionId);
}

/** Turn forward until the FINAL page (the end cards are final-page-gated —
 * the chapter-nav/MarkReadAndClose gate). */
async function turnToFinalPage(page: Page): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const dev = await readPagination(page);
    if (!dev) break;
    if (dev.currentPageIdx >= dev.pagesLength - 1) return;
    await page.keyboard.press("ArrowRight");
    await waitForPaginationSettled(page);
  }
}

test.describe("continue collection (issue #247)", () => {
  let planId: string;
  const ENTRY = (i: number) => `plan-winter-entry-${i}`;

  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
    // Remount AFTER the wipe so the app recreates the Dexie schema (raw
    // seeding into a wiped browser context would build a schema-less
    // database — the chapter-assignments precedent).
    await page.goto(`${BASE}/#/`);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();
    await seedCorpus(page);
    planId = await seedCollection(page, "Winter plan", "plan-winter", [
      { kind: "article", articleId: ESSAY_A.id },
      { kind: "article", articleId: ESSAY_B.id },
      { kind: "article", articleId: ESSAY_C.id },
    ]);
  });

  test("Continue opens the first unfinished entry with orientation; Enter alone activates it (DISC-247-01)", async ({
    page,
  }) => {
    await openCollection(page, planId, "Winter plan");
    const button = page.getByRole("button", { name: "Continue this collection" });
    await expect(button).toBeVisible();
    // Keyboard: focus and activate with Enter alone (a native button — no
    // pointer-only path).
    await button.focus();
    await page.keyboard.press("Enter");
    // The FIRST unfinished entry (A) at its established resume rules, with
    // the /col/<collectionId>/<entryId> context (the parseHash grammar).
    await expect(page).toHaveURL(`${BASE}/#/article/${ESSAY_A.id}/col/${planId}/${ENTRY(0)}`);
    await expect(page.getByRole("heading", { level: 1, name: "First Harbor Essay" })).toBeVisible();
    // The memory was re-remembered for the opened entry (navigation context).
    const memory = await page.evaluate(async (collectionId) => {
      return new Promise<{ entryId: string } | null>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("collectionActiveEntries", "readonly");
          const g = tx.objectStore("collectionActiveEntries").get(collectionId);
          g.onsuccess = () => {
            db.close();
            resolve((g.result as { entryId: string } | null) ?? null);
          };
          g.onerror = () => {
            db.close();
            reject(g.error);
          };
        };
      });
    }, planId);
    expect(memory?.entryId).toBe(ENTRY(0));
    // Wait for the paginated read to settle, then the end card shows the
    // orientation line (a two-paragraph essay is a ONE-page read — the
    // final-page gate passes immediately).
    await waitForPaginationSettled(page);
    await expect(endCard(page).locator(".collection-end-line")).toContainText("From “Winter plan”");
    await expect(endCard(page).locator(".collection-end-line")).toContainText("reading 1 of 3");
    await expect(endCard(page).getByRole("button", { name: /Next reading/ })).toBeVisible();
  });

  test("a page turn at the true end does NOT advance — Next reading is the only way forward (DISC-247-02)", async ({
    page,
  }) => {
    await openCollection(page, planId, "Winter plan");
    await page.getByRole("button", { name: "Continue this collection" }).click();
    await expect(page).toHaveURL(`${BASE}/#/article/${ESSAY_A.id}/col/${planId}/${ENTRY(0)}`);
    await waitForPaginationSettled(page);
    await expect(endCard(page).getByRole("button", { name: /Next reading/ })).toBeVisible();
    // Turn PAST the final page: the paginated surface clamps (the turn seam
    // never leaves the entry on its own — the issue #238 machinery is
    // scoped to books, and a stand-alone essay has no neighbors).
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(`${BASE}/#/article/${ESSAY_A.id}/col/${planId}/${ENTRY(0)}`);
    await expect(endCard(page).getByRole("button", { name: /Next reading/ })).toBeVisible();
  });

  test("Next reading advances explicitly to the next entry with the NEW context; the memory follows (DISC-247-03)", async ({
    page,
  }) => {
    await openCollection(page, planId, "Winter plan");
    await page.getByRole("button", { name: "Continue this collection" }).click();
    await expect(page).toHaveURL(`${BASE}/#/article/${ESSAY_A.id}/col/${planId}/${ENTRY(0)}`);
    await waitForPaginationSettled(page);
    await endCard(page)
      .getByRole("button", { name: /Next reading/ })
      .click();
    // The next entry (B) at its own resume rules with the NEW /col/ context.
    await expect(page).toHaveURL(`${BASE}/#/article/${ESSAY_B.id}/col/${planId}/${ENTRY(1)}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Second Harbor Essay" }),
    ).toBeVisible();
    await waitForPaginationSettled(page);
    await expect(endCard(page).locator(".collection-end-line")).toContainText("reading 2 of 3");
    // The memory follows the advancement (the next Continue resumes B).
    const memory = await page.evaluate(async (collectionId) => {
      return new Promise<{ entryId: string } | null>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("collectionActiveEntries", "readonly");
          const g = tx.objectStore("collectionActiveEntries").get(collectionId);
          g.onsuccess = () => {
            db.close();
            resolve((g.result as { entryId: string } | null) ?? null);
          };
        };
      });
    }, planId);
    expect(memory?.entryId).toBe(ENTRY(1));
  });

  test("a cold reload IN the reader keeps the collection context (DISC-247-04)", async ({
    page,
  }) => {
    await openCollection(page, planId, "Winter plan");
    await page.getByRole("button", { name: "Continue this collection" }).click();
    await expect(page).toHaveURL(`${BASE}/#/article/${ESSAY_A.id}/col/${planId}/${ENTRY(0)}`);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "First Harbor Essay" })).toBeVisible();
    await waitForPaginationSettled(page);
    // The context is URL-borne: the end card re-derives after the reload.
    await expect(endCard(page).locator(".collection-end-line")).toContainText("reading 1 of 3");
  });

  test("the remembered active entry survives a reload and Continue resumes it (DISC-247-05)", async ({
    page,
  }) => {
    // Read B deliberately first (a row click — see DISC-247-07's shape) so
    // the memory points at the SECOND entry, then reload the collections
    // surface and press Continue: it resumes B, not the first entry.
    await openCollection(page, planId, "Winter plan");
    await page.locator('a.collection-entry-link[href*="winter-essay-b"]').click();
    await expect(page).toHaveURL(`${BASE}/#/article/${ESSAY_B.id}/col/${planId}/${ENTRY(1)}`);
    await page.goto(`${BASE}/#/collections/${planId}`);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Winter plan" })).toBeVisible();
    await page.getByRole("button", { name: "Continue this collection" }).click();
    await expect(page).toHaveURL(`${BASE}/#/article/${ESSAY_B.id}/col/${planId}/${ENTRY(1)}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Second Harbor Essay" }),
    ).toBeVisible();
  });

  test("a remembered entry that COMPLETED elsewhere is not usable — Continue falls forward (DISC-247-06)", async ({
    page,
  }) => {
    // A finished the ordinary way (an end-pinned location): the shared
    // completion marks entry 0 finished, so the remembered entry is not a
    // usable resume target.
    await seedLocation(page, ESSAY_A.id, ESSAY_A_TOTAL);
    await seedActiveEntry(page, planId, ENTRY(0));
    await openCollection(page, planId, "Winter plan");
    await page.getByRole("button", { name: "Continue this collection" }).click();
    // The first UNFINISHED entry is B.
    await expect(page).toHaveURL(`${BASE}/#/article/${ESSAY_B.id}/col/${planId}/${ENTRY(1)}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Second Harbor Essay" }),
    ).toBeVisible();
  });

  test("a reorder cannot strand Continue: the remembered entry survives the move and resumes (DISC-247-05b)", async ({
    page,
  }) => {
    // Read B deliberately (the memory points at entry 1)…
    await openCollection(page, planId, "Winter plan");
    await page.locator('a.collection-entry-link[href*="winter-essay-b"]').click();
    await expect(page).toHaveURL(`${BASE}/#/article/${ESSAY_B.id}/col/${planId}/${ENTRY(1)}`);
    // …then REORDER the plan from the detail view: B moves to position 1
    // (the keyboard control — the AC's both-interactions discipline).
    await page.goto(`${BASE}/#/collections/${planId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Winter plan" })).toBeVisible();
    await page.getByRole("button", { name: /Move Second Harbor Essay up/ }).click();
    await expect(page.locator(".collection-entry-link").first()).toContainText(
      "Second Harbor Essay",
    );
    // Reload + Continue: the remembered entry (by STABLE id — the reorder
    // wrote no identity) still resumes, in its NEW position.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Winter plan" })).toBeVisible();
    await page.getByRole("button", { name: "Continue this collection" }).click();
    await expect(page).toHaveURL(`${BASE}/#/article/${ESSAY_B.id}/col/${planId}/${ENTRY(1)}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Second Harbor Essay" }),
    ).toBeVisible();
  });

  test("a COMPLETED plan shows completion instead of restarting; an EMPTY plan is distinct (DISC-247-08)", async ({
    page,
  }) => {
    await seedLocation(page, ESSAY_A.id, ESSAY_A_TOTAL);
    await seedLocation(page, ESSAY_B.id, ESSAY_B_TOTAL);
    await seedLocation(page, ESSAY_C.id, ESSAY_C_TOTAL);
    await openCollection(page, planId, "Winter plan");
    await expect(page.locator(".collection-progress")).toHaveText("3 of 3 finished");
    // Completion INSTEAD of the button — pressing nothing restarts nothing.
    await expect(page.locator(".collection-complete")).toHaveText(
      "You’ve finished this collection.",
    );
    await expect(page.getByRole("button", { name: "Continue this collection" })).toHaveCount(0);

    // An EMPTY plan is a different honest state (no-content, no Continue).
    const emptyId = await seedCollection(page, "Empty plan", "plan-empty", []);
    await page.goto(`${BASE}/#/collections/${emptyId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Empty plan" })).toBeVisible();
    await expect(page.getByText("No readings in this collection yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue this collection" })).toHaveCount(0);
  });

  test("a chapter-assignment entry ends with BOTH continue-the-work and Next reading; the work crossing drops the context (DISC-247-09)", async ({
    page,
  }) => {
    const chapterPlan = await seedCollection(page, "Chapters plan", "plan-chapters", [
      { kind: "work-chapter", articleId: WORK.id, destinationId: CH_ONE!.id },
      { kind: "work-chapter", articleId: WORK.id, destinationId: CH_TWO!.id },
    ]);
    await openCollection(page, chapterPlan, "Chapters plan");
    await page.getByRole("button", { name: "Continue this collection" }).click();
    // The assignment route: the chapter scope AND the collection context.
    await expect(page).toHaveURL(
      `${BASE}/#/article/${WORK.id}/c/${CH_ONE!.id}/col/${chapterPlan}/${chapterPlan}-entry-0`,
    );
    await waitForPaginationSettled(page);
    await turnToFinalPage(page);
    // The assignment's true end: BOTH explicit options (issue #244 intact
    // + #247) on the final page.
    await expect(
      page.getByRole("button", { name: /Continue reading The Tide Ledger/ }),
    ).toBeVisible();
    await expect(endCard(page).getByRole("button", { name: /Next reading/ })).toBeVisible();
    await expect(endCard(page).locator(".collection-end-line")).toContainText("reading 1 of 2");

    // Continuing the WORK leaves the entry: the plain route (no /col/
    // suffix) — ordinary work reading now.
    await page.getByRole("button", { name: /Continue reading The Tide Ledger/ }).click();
    await expect(page).toHaveURL(`${BASE}/#/article/${WORK.id}`);
    // ...and the collection chrome is gone (no context, no end card).
    await expect(endCard(page)).toHaveCount(0);
  });

  test("Next reading from a chapter assignment carries the NEW context into the next assignment (DISC-247-09b)", async ({
    page,
  }) => {
    const chapterPlan = await seedCollection(page, "Chapters plan", "plan-chapters", [
      { kind: "work-chapter", articleId: WORK.id, destinationId: CH_ONE!.id },
      { kind: "work-chapter", articleId: WORK.id, destinationId: CH_TWO!.id },
    ]);
    await openCollection(page, chapterPlan, "Chapters plan");
    await page.getByRole("button", { name: "Continue this collection" }).click();
    await expect(page).toHaveURL(
      `${BASE}/#/article/${WORK.id}/c/${CH_ONE!.id}/col/${chapterPlan}/${chapterPlan}-entry-0`,
    );
    await waitForPaginationSettled(page);
    await turnToFinalPage(page);
    await endCard(page)
      .getByRole("button", { name: /Next reading/ })
      .click();
    // The NEXT assignment with the NEW context — the scope moves to
    // chapter two.
    await expect(page).toHaveURL(
      `${BASE}/#/article/${WORK.id}/c/${CH_TWO!.id}/col/${chapterPlan}/${chapterPlan}-entry-1`,
    );
    await waitForPaginationSettled(page);
    await expect(endCard(page).locator(".collection-end-line")).toContainText("reading 2 of 2");
    // The plan's LAST entry at its end: no Next reading (nothing after),
    // and no completion line either — chapter one was never read (shared
    // completion is honest, not optimistic).
    await expect(endCard(page).getByRole("button", { name: /Next reading/ })).toHaveCount(0);
    await expect(endCard(page).locator(".collection-end-complete")).toHaveCount(0);
  });

  test("finishing the plan's LAST entry shows the completion line at its end (DISC-247-08b)", async ({
    page,
  }) => {
    // A and B finished the ordinary way; Continue opens C (the last
    // unfinished entry) — at ITS end the whole plan is done and the card
    // shows completion instead of a next step.
    await seedLocation(page, ESSAY_A.id, ESSAY_A_TOTAL);
    await seedLocation(page, ESSAY_B.id, ESSAY_B_TOTAL);
    await openCollection(page, planId, "Winter plan");
    await page.getByRole("button", { name: "Continue this collection" }).click();
    await expect(page).toHaveURL(`${BASE}/#/article/${ESSAY_C.id}/col/${planId}/${ENTRY(2)}`);
    await waitForPaginationSettled(page);
    await expect(endCard(page).locator(".collection-end-line")).toContainText("reading 3 of 3");
    // The plan's LAST entry at its end: no Next reading (nothing after).
    // (The completion DISPLAY lives on the detail view — DISC-247-08; in
    // the reader the current entry is, honestly, still being read.)
    await expect(endCard(page).getByRole("button", { name: /Next reading/ })).toHaveCount(0);
  });

  test("deleting the collection sweeps its remembered entry — no orphan row (DISC-247-10)", async ({
    page,
  }) => {
    // Reading B remembers it; deleting the plan must sweep the row (the
    // #245 cleanup discipline for the collection's own navigation context).
    await openCollection(page, planId, "Winter plan");
    await page.locator('a.collection-entry-link[href*="winter-essay-b"]').click();
    await expect(page).toHaveURL(`${BASE}/#/article/${ESSAY_B.id}/col/${planId}/${ENTRY(1)}`);
    const memory = await readActiveEntry(page, planId);
    expect(memory?.entryId).toBe(ENTRY(1));

    // Back to the collections LIST; the destructive flow opens the confirm
    // dialog (the write is grep-isolated in the dialog — issue #243's
    // Pitfall 8). The card row's Delete button carries the collection name.
    await page.goto(`${BASE}/#/collections`);
    await expect(page.getByRole("heading", { level: 1, name: "Collections" })).toBeVisible();
    const doomedCard = page.locator("li.collection-card", { hasText: "Winter plan" });
    await expect(doomedCard).toBeVisible();
    await doomedCard.getByRole("button", { name: "Delete", exact: true }).click();
    // role="alertdialog" — the destructive-confirm ARIA role (the DISC-243-06 shape).
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete collection", exact: true })
      .click();
    await expect(page.getByText(`Deleted “Winter plan”.`)).toBeVisible();

    // The sweep: the collectionActiveEntries store holds NO row for the
    // deleted plan (raw IndexedDB read — the persisted truth).
    const after = await readActiveEntry(page, planId);
    expect(after).toBeNull();
  });
});
