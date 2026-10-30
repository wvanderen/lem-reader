// tests/e2e/annotations/article-note-tags.spec.ts
// Issue #209 — article notes carry their OWN annotation tags through the
// shared, always-visible controls established for highlights (issue #207).
// Targeted coverage at the issue's agreed seams:
//   1. Commitment + persistence (both reading modes): the field mounts with
//      the article-note editor, Enter commits, the Dexie note row carries the
//      tag across a full reload, Done returns focus to the entry without
//      moving reading position.
//   2. A tag-only NEW draft stays recoverable but saves no article note; the
//      status explains that note text is required. Writing text saves the
//      note WITH its committed tags.
//   3. Emptying a saved note preserves the last saved content AND the draft
//      tags (raw store reads); nothing is silently deleted.
//   4. Layered Escape, one layer per press: suggestion list → uncommitted
//      tag text → editor closure (focus back on the entry).
//   5. Tag edits never touch the article's tags or another annotation's tags.
//   6. Narrow screen + magnified UI: the field wraps/stacks, actions stay
//      usable, no horizontal overflow.
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  drawerTrigger,
  modeToggle,
  waitForReadingSurface,
} from "./_fixtures";
import { makeArticle, seedRows } from "../portability/_portability";

const FIXTURE = FIXTURES[0]!; // essay-long-form

interface NoteRow {
  id: string;
  text: string;
  tags?: string[];
}
interface NoteRows {
  notes: NoteRow[];
  drafts: NoteRow[];
}

/** Read the article-note stores straight from Dexie (raw IndexedDB). */
async function readNoteRows(
  page: Page,
  store: "articleNotes" | "articleNoteDrafts",
): Promise<NoteRow[]> {
  return await page.evaluate(
    (storeName) =>
      new Promise<NoteRow[]>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, "readonly");
          const rows: NoteRow[] = [];
          const cursor = tx.objectStore(storeName).openCursor();
          cursor.onsuccess = () => {
            const c = cursor.result;
            if (c) {
              rows.push(c.value as NoteRow);
              c.continue();
            } else {
              resolve(rows);
              db.close();
            }
          };
          cursor.onerror = () => reject(cursor.error);
        };
        req.onerror = () => reject(req.error);
      }),
    store,
  );
}

async function readNoteStores(page: Page): Promise<NoteRows> {
  const [notes, drafts] = await Promise.all([
    readNoteRows(page, "articleNotes"),
    readNoteRows(page, "articleNoteDrafts"),
  ]);
  return { notes, drafts };
}

/** Read the article row's own tags (the namespace tag edits must never touch). */
async function readArticleTags(page: Page, articleId: string): Promise<string[] | undefined> {
  return await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const row = await new Promise<{ tags?: string[] } | undefined>((resolve, reject) => {
      const tx = db.transaction("articles", "readonly");
      const req = tx.objectStore("articles").get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return row?.tags;
  }, articleId);
}

/** Open the drawer and its article-note editor. */
async function openNoteEditor(page: Page, entry?: string) {
  await drawerTrigger(page).click();
  const section = page.getByRole("region", { name: "Article notes", exact: true });
  if (entry) {
    await section.getByRole("button", { name: entry, exact: true }).click();
  } else {
    await section.getByRole("button", { name: "Add article note" }).click();
  }
  const editor = section.getByRole("region", { name: "Article note tags" });
  const text = page.getByRole("textbox", { name: "Article note", exact: true });
  const tagInput = editor.locator("input#article-note-tags-input");
  await expect(tagInput).toBeVisible();
  const status = section.locator(":scope > [role=status]");
  return { section, editor, text, tagInput, status };
}

for (const mode of ["paginated", "scrolling"] as const) {
  test(`${mode}: Enter commits a tag onto the note; it survives reload; Done keeps position`, async ({
    page,
  }) => {
    await wipeDatabase(page);
    await openArticle(page, FIXTURE);
    // The suggestion universe reads the LIBRARY vocabulary (loadTagStats
    // folds Dexie article rows) — bundled fixtures carry no Dexie row, so
    // seed one tagged row as the suggestion universe.
    await seedRows(page, {
      articles: [
        {
          ...makeArticle({
            id: "vocab-seed",
            title: "Vocabulary",
            paragraphs: ["Seed vocabulary row."],
          }),
          tags: ["philosophy"],
        },
      ],
    });
    if (mode === "scrolling") {
      await modeToggle(page).click();
      await waitForReadingSurface(page);
      await page.evaluate(() => window.scrollTo(0, 600));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    }
    const scrollY = await page.evaluate(() => window.scrollY);

    await drawerTrigger(page).click();
    const section = page.getByRole("region", { name: "Article notes", exact: true });
    await section.getByRole("button", { name: "Add article note" }).click();
    const text = page.getByRole("textbox", { name: "Article note", exact: true });
    const tagInput = section.locator("input#article-note-tags-input");
    await expect(tagInput).toBeVisible();
    // No expansion step — the field is already there.
    expect(await section.getByRole("button", { name: "Tags", exact: true }).count()).toBe(0);

    await text.fill("A reflection on the whole piece");
    // Type-to-filter over the library vocabulary, pick with Enter.
    await tagInput.fill("phil");
    await section.getByRole("option", { name: "philosophy" }).click();
    await expect(section.locator(".tag-picker-pill-text")).toHaveText("philosophy");
    await expect(section.locator(":scope > [role=status]")).toHaveText("Saved.");

    await section.getByRole("button", { name: "Done", exact: true }).click();
    await expect(section.getByRole("button", { name: "Add article note" })).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);

    // The saved row carries the note's OWN tags…
    await expect.poll(async () => (await readNoteStores(page)).notes).toHaveLength(1);
    expect((await readNoteStores(page)).notes[0]?.tags).toEqual(["philosophy"]);
    // …and the ARTICLE's tags are untouched.
    expect(await readArticleTags(page, "vocab-seed")).toEqual(["philosophy"]);

    // Full reload → the chip renders from the persisted record; a second tag
    // commits and lands beside the first.
    await page.reload();
    await waitForReadingSurface(page);
    const reopened = await openNoteEditor(page, "A reflection on the whole piece");
    await expect(reopened.editor.locator(".tag-picker-pill-text")).toHaveText("philosophy");
    await reopened.tagInput.fill("to-revisit");
    await reopened.tagInput.press("Enter");
    await expect(reopened.editor.locator(".tag-picker-pill-text")).toHaveText([
      "philosophy",
      "to-revisit",
    ]);
    await reopened.section.getByRole("button", { name: "Done", exact: true }).click();
    await expect
      .poll(async () => (await readNoteStores(page)).notes[0]?.tags)
      .toEqual(["philosophy", "to-revisit"]);
  });
}

test("a tag-only new draft stays recoverable, saves no note, and explains that text is required", async ({
  page,
}) => {
  await wipeDatabase(page);
  await openArticle(page, FIXTURE);
  await drawerTrigger(page).click();
  const section = page.getByRole("region", { name: "Article notes", exact: true });
  await section.getByRole("button", { name: "Add article note" }).click();
  const tagInput = section.locator("input#article-note-tags-input");
  const status = section.locator(":scope > [role=status]");

  await tagInput.fill("essays");
  await tagInput.press("Enter");
  await expect(section.locator(".tag-picker-pill-text")).toHaveText("essays");
  // The honest register — the draft is NOT claimed saved as a note.
  await expect(status).toHaveText("Note text is required to save.");

  // Closing keeps the draft recoverable (list entry identifies it)…
  await section.getByRole("button", { name: "Done", exact: true }).click();
  await expect(section.getByRole("button", { name: "Tags: essays", exact: true })).toBeVisible();
  // …creates NO saved article note…
  expect(await readNoteRows(page, "articleNotes")).toEqual([]);
  // …but the draft row (with the tags) persists.
  const drafts = await readNoteRows(page, "articleNoteDrafts");
  expect(drafts).toHaveLength(1);
  expect(drafts[0]?.tags).toEqual(["essays"]);

  // Reopening restores text + tags as a recovered draft; writing text saves
  // the note WITH its committed tags.
  await section.getByRole("button", { name: "Tags: essays", exact: true }).click();
  const text = page.getByRole("textbox", { name: "Article note", exact: true });
  await expect(text).toHaveValue("");
  await expect(section.locator(".tag-picker-pill-text")).toHaveText("essays");
  await expect(status).toHaveText("Recovered draft");
  await text.fill("Now it has text");
  await expect(status).toHaveText("Saved.");
  const saved = await readNoteRows(page, "articleNotes");
  expect(saved).toHaveLength(1);
  expect(saved[0]?.tags).toEqual(["essays"]);
  expect(await readNoteRows(page, "articleNoteDrafts")).toEqual([]);
});

test("emptying a saved note preserves the saved content and the draft tags", async ({ page }) => {
  await wipeDatabase(page);
  await openArticle(page, FIXTURE);
  await drawerTrigger(page).click();
  const section = page.getByRole("region", { name: "Article notes", exact: true });
  await section.getByRole("button", { name: "Add article note" }).click();
  const text = page.getByRole("textbox", { name: "Article note", exact: true });
  const tagInput = section.locator("input#article-note-tags-input");
  const status = section.locator(":scope > [role=status]");
  await text.fill("A saved reflection");
  await tagInput.fill("essays");
  await tagInput.press("Enter");
  await expect(status).toHaveText("Saved.");

  // Empty the note: the saved row survives untouched, the recovery draft
  // keeps the emptied edit AND its tags, and nothing is deleted.
  await text.fill("");
  await expect(status).toContainText("last saved text is preserved");
  const rows = await readNoteStores(page);
  expect(rows.notes).toHaveLength(1);
  expect(rows.notes[0]?.text).toBe("A saved reflection");
  expect(rows.notes[0]?.tags).toEqual(["essays"]);
  expect(rows.drafts).toHaveLength(1);
  expect(rows.drafts[0]?.tags).toEqual(["essays"]);

  // Reload → reopen: the recovered empty edit (with its tags) comes back.
  await page.reload();
  await waitForReadingSurface(page);
  const reopened = await openNoteEditor(page, "A saved reflection");
  await expect(reopened.text).toHaveValue("");
  await expect(reopened.editor.locator(".tag-picker-pill-text")).toHaveText("essays");
  await expect(reopened.status).toHaveText("Recovered draft");
  // Restoring the text lands it with the tags intact.
  await reopened.text.fill("A saved reflection");
  await expect(reopened.status).toHaveText("Saved.");
  await expect.poll(async () => (await readNoteStores(page)).drafts).toEqual([]);
  expect((await readNoteStores(page)).notes[0]?.tags).toEqual(["essays"]);
});

test("layered Escape: suggestion list, then uncommitted tag text, then editor closure", async ({
  page,
}) => {
  await wipeDatabase(page);
  await openArticle(page, FIXTURE);
  await seedRows(page, {
    articles: [
      {
        ...makeArticle({
          id: "vocab-seed",
          title: "Vocabulary",
          paragraphs: ["Seed vocabulary row."],
        }),
        tags: ["philosophy"],
      },
    ],
  });
  await page.evaluate(() => window.scrollTo(0, 400));
  const scrollY = await page.evaluate(() => window.scrollY);
  await drawerTrigger(page).click();
  const section = page.getByRole("region", { name: "Article notes", exact: true });
  await section.getByRole("button", { name: "Add article note" }).click();
  const tagInput = section.locator("input#article-note-tags-input");

  await tagInput.fill("phil");
  await expect(section.getByRole("listbox")).toBeVisible();
  // Layer 1 — dismiss the list; the draft text and the editor survive.
  await page.keyboard.press("Escape");
  await expect(section.getByRole("listbox")).not.toBeVisible();
  await expect(tagInput).toHaveValue("phil");
  await expect(section.getByRole("button", { name: "Done", exact: true })).toBeVisible();
  // Layer 2 — clear the uncommitted draft text; the editor survives.
  await page.keyboard.press("Escape");
  await expect(tagInput).toHaveValue("");
  await expect(section.getByRole("button", { name: "Done", exact: true })).toBeVisible();
  // Layer 3 — close the editor; focus returns to the Add control.
  await page.keyboard.press("Escape");
  await expect(section.getByRole("button", { name: "Add article note" })).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  // Nothing was committed by any layer.
  expect(await readNoteRows(page, "articleNotes")).toEqual([]);
  expect(await readNoteRows(page, "articleNoteDrafts")).toEqual([]);
});

test("tag edits stay on their note: another note's tags and the article's tags are untouched", async ({
  page,
}) => {
  await wipeDatabase(page);
  await openArticle(page, FIXTURE);
  await seedRows(page, {
    articles: [
      {
        ...makeArticle({
          id: "tagged-article",
          title: "Tagged article",
          paragraphs: ["Seed article row."],
        }),
        tags: ["philosophy"],
      },
    ],
  });
  await drawerTrigger(page).click();
  const section = page.getByRole("region", { name: "Article notes", exact: true });

  // Two independent notes; the first carries a tag.
  await section.getByRole("button", { name: "Add article note" }).click();
  let text = page.getByRole("textbox", { name: "Article note", exact: true });
  await text.fill("First note");
  await expect(section.locator(":scope > [role=status]")).toHaveText("Saved.");
  await section.getByRole("button", { name: "Done", exact: true }).click();
  await section.getByRole("button", { name: "Add article note" }).click();
  text = page.getByRole("textbox", { name: "Article note", exact: true });
  await text.fill("Second note");
  const tagInput = section.locator("input#article-note-tags-input");
  await tagInput.fill("to-revisit");
  await tagInput.press("Enter");
  await expect(section.locator(":scope > [role=status]")).toHaveText("Saved.");
  await section.getByRole("button", { name: "Done", exact: true }).click();

  // Edit the SECOND note's tags.
  await section.getByRole("button", { name: "Second note", exact: true }).click();
  await expect(tagInput).toBeVisible();
  await tagInput.fill("essays");
  await tagInput.press("Enter");
  await expect(section.locator(":scope > [role=status]")).toHaveText("Saved.");
  await section.getByRole("button", { name: "Done", exact: true }).click();

  await expect.poll(async () => (await readNoteStores(page)).notes).toHaveLength(2);
  const rows = await readNoteStores(page);
  const first = rows.notes.find((n) => n.text === "First note");
  const second = rows.notes.find((n) => n.text === "Second note");
  expect(first?.tags ?? []).toEqual([]);
  expect(second?.tags).toEqual(["to-revisit", "essays"]);
  // The article's own tag namespace is untouched by note-tag commits.
  expect(await readArticleTags(page, "tagged-article")).toEqual(["philosophy"]);
});

test("narrow screen and magnified UI keep the tag field and actions usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await wipeDatabase(page);
  await openArticle(page, FIXTURE);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await drawerTrigger(page).click();
  const section = page.getByRole("region", { name: "Article notes", exact: true });
  await section.getByRole("button", { name: "Add article note" }).click();
  const text = page.getByRole("textbox", { name: "Article note", exact: true });
  const tagInput = section.locator("input#article-note-tags-input");
  await expect(tagInput).toBeVisible();

  // Two tags wrap into the sheet; the editor and actions stay inside the
  // viewport (the writing surface keeps its height, Done stays a touch
  // target, and nothing overflows horizontally).
  await tagInput.fill("phone-tag");
  await tagInput.press("Enter");
  await tagInput.fill("second-tag");
  await tagInput.press("Enter");
  await expect(section.locator(".tag-picker-pill-text")).toHaveText(["phone-tag", "second-tag"]);
  await text.fill("A reflection at high magnification.");
  await expect(section.locator(":scope > [role=status]")).toHaveText("Saved.");

  const viewport = page.viewportSize()!;
  const done = section.getByRole("button", { name: "Done", exact: true });
  await expect(done).toBeVisible();
  expect((await done.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  for (const locator of [text, tagInput, done]) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // The editor still closes; the saved note entry lists it.
  await done.click();
  await expect(
    section.getByRole("button", { name: "A reflection at high magnification.", exact: true }),
  ).toBeVisible();
});

test("Enter commits from an unused suggestion-free draft; blur never creates a tag", async ({
  page,
}) => {
  await wipeDatabase(page);
  await openArticle(page, FIXTURE);
  await drawerTrigger(page).click();
  const section = page.getByRole("region", { name: "Article notes", exact: true });
  await section.getByRole("button", { name: "Add article note" }).click();
  const text = page.getByRole("textbox", { name: "Article note", exact: true });
  const tagInput = section.locator("input#article-note-tags-input");

  await text.fill("Blur discipline");
  // Uncommitted text + blur (focus the note textarea) → no tag.
  await tagInput.fill("never-on-blur");
  await text.focus();
  await expect(section.locator(".tag-picker-pill-text")).toHaveCount(0);
  // Explicit Add action (the create option) commits; Enter commits too.
  await tagInput.fill("brand-new-tag");
  await section.getByRole("option", { name: /Add “brand-new-tag”/ }).click();
  await expect(section.locator(".tag-picker-pill-text")).toHaveText("brand-new-tag");
  await tagInput.fill("typed-in");
  await tagInput.press("Enter");
  await expect(section.locator(".tag-picker-pill-text")).toHaveText(["brand-new-tag", "typed-in"]);
  await expect(section.locator(":scope > [role=status]")).toHaveText("Saved.");
  await expect
    .poll(async () => (await readNoteStores(page)).notes[0]?.tags)
    .toEqual(["brand-new-tag", "typed-in"]);
});
