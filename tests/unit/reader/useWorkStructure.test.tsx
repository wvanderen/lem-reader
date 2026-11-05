// tests/unit/reader/useWorkStructure.test.tsx
// Issue #236 — the reader's structure seam: a SAVED snapshot (validated
// against canonical content) is FROZEN — preferred over re-derivation so a
// generator update or a typography change can never renumber an established
// work. A record without one derives immediately (reading never blocks on
// persistence) and persists lazily, ONCE per article revision, never for
// bundled fixtures (they have no Dexie row), with the outcome disclosed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { ArticleSchema, type CanonicalArticle } from "../../../src/content/schema";
import { deriveWorkStructure } from "../../../src/content/structure";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

async function wipeDatabase(): Promise<void> {
  await new Promise<void>((resolve) => {
    const idb = (globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB;
    if (!idb) return resolve();
    const req = idb.deleteDatabase("lem-reader");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

async function loadDb() {
  return await import("../../../src/persistence/db");
}

const makeArticle = (overrides: Partial<CanonicalArticle> = {}): CanonicalArticle =>
  ArticleSchema.parse({
    id: "hook-article",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/hook",
      title: "Hook Article",
      retrievedAt: "2026-10-01T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "5".repeat(64),
    },
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "One", marks: [] }] },
      { kind: "paragraph", content: [{ text: "Prose.", marks: [] }] },
      { kind: "heading", level: 2, content: [{ text: "Two", marks: [] }] },
      { kind: "paragraph", content: [{ text: "More prose.", marks: [] }] },
    ],
    footnotes: [],
    ...overrides,
  });

/** Harness: expose the hook's state to the test. */
let latest: {
  structure: ReturnType<typeof deriveWorkStructure> | null;
  origin: string | null;
  saveOutcome: string | null;
} | null = null;

async function renderHook(article: CanonicalArticle | null): Promise<void> {
  const { useWorkStructure } = await import("../../../src/reader/useWorkStructure");
  latest = null;
  function Harness(): ReactNode {
    const state = useWorkStructure(article);
    latest = state;
    return null;
  }
  render(<Harness />);
}

describe("useWorkStructure (issue #236)", () => {
  beforeEach(async () => {
    await wipeDatabase();
    const { db } = await loadDb();
    if (!db.isOpen()) await db.open();
    vi.restoreAllMocks();
  });

  it("a record without a snapshot derives immediately and persists lazily (saved on next read)", async () => {
    const { db } = await loadDb();
    const article = makeArticle();
    await db.articles.put(article);
    await renderHook(article);
    // Derivation is synchronous — orientation exists in the FIRST commit.
    expect(latest?.origin).toBe("derived");
    expect(latest?.structure).toEqual(deriveWorkStructure(article));
    // The lazy write lands without any reader action.
    await waitFor(async () => {
      const row = await db.articles.get(article.id);
      expect(row?.structure).toBeDefined();
    });
    await waitFor(() => expect(latest?.saveOutcome).toBe("saved"));
  });

  it("a valid saved snapshot is FROZEN — preferred over re-derivation", async () => {
    const { db } = await loadDb();
    const article = makeArticle();
    const derived = deriveWorkStructure(article)!;
    // An ESTABLISHED snapshot with a different generator version (a future
    // generator renumbered parts): the reader must keep it, not re-derive.
    const frozen = {
      ...derived,
      generatorVersion: 99,
      destinations: [
        { ...derived.destinations[0]!, title: "Renamed by a newer generator" },
        ...derived.destinations.slice(1),
      ],
    };
    await db.articles.put({ ...article, structure: frozen });
    // The reader opens the record as loaded from the store (snapshot in).
    await renderHook({ ...article, structure: frozen });
    expect(latest?.origin).toBe("saved");
    expect(latest?.structure).toEqual(frozen);
    // No lazy rewrite of an established snapshot.
    await new Promise((r) => setTimeout(r, 20));
    expect(latest?.saveOutcome).toBeNull();
  });

  it("an INVALID saved snapshot falls back to derivation", async () => {
    const { db } = await loadDb();
    const article = makeArticle();
    const derived = deriveWorkStructure(article)!;
    const broken = {
      ...derived,
      destinations: derived.destinations.map((d, i) =>
        i === 0 ? { ...d, endOffset: d.endOffset + 3 } : d,
      ),
    };
    await db.articles.put({ ...article, structure: broken });
    await renderHook(article);
    expect(latest?.origin).toBe("derived");
    expect(latest?.structure).toEqual(derived);
  });

  it("bundled fixtures derive but never persist (no phantom rows)", async () => {
    const { bundledFixtures } = await import("../../../src/fixtures");
    const fixture = bundledFixtures[0]!;
    const { db } = await loadDb();
    await renderHook(fixture);
    expect(latest?.origin).toBe("derived");
    await new Promise((r) => setTimeout(r, 20));
    expect(await db.articles.get(fixture.id)).toBeUndefined();
    expect(latest?.saveOutcome).toBeNull();
  });

  it("a persistence failure is disclosed without blocking the structure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db } = await loadDb();
    const article = makeArticle();
    await db.articles.put(article);
    db.close(); // storage unavailable after the seed
    await renderHook(article);
    expect(latest?.structure).not.toBeNull(); // reading is never blocked
    await waitFor(() => expect(latest?.saveOutcome).toBe("write-failed"));
    expect(warn).toHaveBeenCalled();
  });

  it("a revision-stale write is disclosed, and the derived structure stays usable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db } = await loadDb();
    const article = makeArticle();
    // The re-ingest race, from the deterministic side: the ROW already
    // carries the newer revision (a re-ingest landed) while the reader still
    // holds the revision-1 record — the save must refuse, not stamp old
    // ranges onto new content.
    await db.articles.put({ ...article, revision: 2 });
    await renderHook(article);
    await waitFor(() => expect(latest?.saveOutcome).toBe("revision-changed"));
    expect(warn).toHaveBeenCalled();
    expect(latest?.structure).toEqual(deriveWorkStructure(article));
    const row = await db.articles.get(article.id);
    expect(row?.revision).toBe(2);
    expect(row?.structure).toBeUndefined();
  });
});
