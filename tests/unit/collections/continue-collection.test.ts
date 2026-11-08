// tests/unit/collections/continue-collection.test.ts
// Issue #247 — the ONE Continue-collection selection algebra (pure, zero
// React, zero Dexie — the collectionEntries.ts store-seam discipline). The
// acceptance surface this pins:
//
//   - "Continue collection opens the last active unfinished entry; if none
//     is usable, open the first unfinished entry in the current order."
//     Usable = EXISTS in the collection's CURRENT entries (addressed by the
//     stable entry id, so reorders cannot strand it) AND unfinished AND
//     openable (its target still resolves to a route).
//   - "If the remembered entry was removed, completed, deleted, or
//     invalidated, fall back safely to the first valid unfinished entry."
//   - "Completed collections show completion instead of silently
//     restarting" — a fully-finished plan resolves to the complete outcome,
//     never to entry 1.
//   - An EMPTY collection is distinct from a completed nonempty plan.
//   - An unfinished-but-unopenable plan is blocked, and the outcome names
//     the blocker.
//   - "Use current collection order and shared completion": the first-
//     unfinished fallback walks the CURRENT array order; completion derives
//     from the shared EntryResolution (the #246 algebra), never membership.
//   - The reader's Next reading advances to the next OPENABLE entry in
//     order (skipping unopenable ones — the button names its destination),
//     or null at the end.
import { describe, expect, it } from "vitest";
import type { CollectionEntry, CollectionEntryTarget } from "../../../src/content/schema";
import type { EntryResolution } from "../../../src/routes/collections/collectionEntries";
import {
  continueCollectionTarget,
  deriveCollectionReadingContext,
  nextCollectionEntry,
} from "../../../src/routes/collections/continueCollection";

// ── Fixtures ────────────────────────────────────────────────────────────────

function entry(id: string, articleId: string): CollectionEntry {
  return {
    id,
    target: { kind: "article", articleId } as CollectionEntryTarget,
    addedAt: "2026-10-01T00:00:00.000Z",
  };
}

/** Resolution table: id → openable? + finished? (the EntryResolution the
 * view derives from the snapshot; tests hand-build it). */
type ResolutionSpec = { href: string | null; finished: boolean };

function resolveWith(spec: Record<string, ResolutionSpec>) {
  return (entry: CollectionEntry): EntryResolution => {
    const r = spec[entry.id] ?? { href: `#/article/x`, finished: false };
    return { href: r.href, title: `T:${entry.id}`, kindLine: "Article", finished: r.finished };
  };
}

// ── Continue selection ──────────────────────────────────────────────────────

describe("continueCollectionTarget (issue #247)", () => {
  it("resumes the remembered entry while it is unfinished and openable", () => {
    const entries = [entry("e1", "a1"), entry("e2", "a2"), entry("e3", "a3")];
    const target = continueCollectionTarget(
      entries,
      "e2",
      resolveWith({
        e1: { href: "#/article/a1", finished: true },
        e2: { href: "#/article/a2", finished: false },
      }),
    );
    expect(target).toEqual({
      kind: "resume",
      entry: entries[1],
      href: "#/article/a2",
    });
  });

  it("falls back to the first unfinished entry when nothing is remembered", () => {
    const entries = [entry("e1", "a1"), entry("e2", "a2")];
    const target = continueCollectionTarget(
      entries,
      null,
      resolveWith({
        e1: { href: "#/article/a1", finished: true },
        e2: { href: "#/article/a2", finished: false },
      }),
    );
    expect(target).toEqual({ kind: "first", entry: entries[1], href: "#/article/a2" });
  });

  it("falls back when the remembered entry is completed — it is not usable", () => {
    const entries = [entry("e1", "a1"), entry("e2", "a2")];
    const target = continueCollectionTarget(
      entries,
      "e2",
      resolveWith({
        e1: { href: "#/article/a1", finished: false },
        e2: { href: "#/article/a2", finished: true },
      }),
    );
    expect(target.kind).toBe("first");
    expect(target.kind === "first" ? target.entry.id : "").toBe("e1");
  });

  it("falls back when the remembered entry was REMOVED from the collection", () => {
    const entries = [entry("e1", "a1"), entry("e2", "a2")];
    const target = continueCollectionTarget(
      entries,
      "e9",
      resolveWith({ e1: { href: "#/article/a1", finished: true } }),
    );
    expect(target).toEqual({ kind: "first", entry: entries[1], href: "#/article/x" });
  });

  it("falls back when the remembered entry was INVALIDATED (unopenable) — and skips it", () => {
    const entries = [entry("e1", "a1"), entry("e2", "a2")];
    const target = continueCollectionTarget(
      entries,
      "e1",
      resolveWith({ e1: { href: null, finished: false } }),
    );
    expect(target).toEqual({ kind: "first", entry: entries[1], href: "#/article/x" });
  });

  it("uses the CURRENT order for the fallback — an earlier entry becoming unfinished wins", () => {
    const entries = [entry("e1", "a1"), entry("e2", "a2"), entry("e3", "a3")];
    const target = continueCollectionTarget(
      entries,
      "e3",
      resolveWith({
        // The remembered e3 finished elsewhere → fallback walks CURRENT
        // order: e1 is the first unfinished entry.
        e1: { href: "#/article/a1", finished: false },
        e2: { href: "#/article/a2", finished: true },
        e3: { href: "#/article/a3", finished: true },
      }),
    );
    expect(target).toEqual({ kind: "first", entry: entries[0], href: "#/article/a1" });
  });

  it("resolves to COMPLETE when every entry is finished — never silently restarts", () => {
    const entries = [entry("e1", "a1"), entry("e2", "a2")];
    const target = continueCollectionTarget(
      entries,
      null,
      resolveWith({
        e1: { href: "#/article/a1", finished: true },
        e2: { href: "#/article/a2", finished: true },
      }),
    );
    expect(target).toEqual({ kind: "complete", finished: 2, total: 2 });
  });

  it("resolves to EMPTY for a collection with no entries — distinct from complete", () => {
    const target = continueCollectionTarget([], null, resolveWith({}));
    expect(target).toEqual({ kind: "empty" });
  });

  it("resolves to BLOCKED, naming the first unfinished entry, when nothing unfinished is openable", () => {
    const entries = [entry("e1", "a1"), entry("e2", "a2")];
    const target = continueCollectionTarget(
      entries,
      null,
      resolveWith({
        e1: { href: "#/article/a1", finished: true },
        e2: { href: null, finished: false }, // unfinished AND unopenable
      }),
    );
    expect(target).toEqual({ kind: "blocked", entry: entries[1] });
  });

  it("counts unopenable FINISHED entries in the complete outcome honestly", () => {
    const entries = [entry("e1", "a1"), entry("e2", "a2")];
    const target = continueCollectionTarget(
      entries,
      "e1",
      resolveWith({
        e1: { href: "#/article/a1", finished: true },
        e2: { href: null, finished: true }, // finished though unlinked
      }),
    );
    expect(target).toEqual({ kind: "complete", finished: 2, total: 2 });
  });
});

// ── Next reading (the reader's explicit advancement) ───────────────────────

describe("nextCollectionEntry (issue #247)", () => {
  const entries = [entry("e1", "a1"), entry("e2", "a2"), entry("e3", "a3")];

  it("returns the next OPENABLE entry in order, labeled with its title", () => {
    const next = nextCollectionEntry(entries, "e1", resolveWith({}));
    expect(next).toEqual({ entry: entries[1], href: "#/article/x", title: "T:e2" });
  });

  it("skips an unopenable next entry — the button names its destination, never a dead link", () => {
    const next = nextCollectionEntry(
      entries,
      "e1",
      resolveWith({ e2: { href: null, finished: false } }),
    );
    expect(next).toEqual({ entry: entries[2], href: "#/article/x", title: "T:e3" });
  });

  it("returns null when the current entry is last — no silent wraparound", () => {
    expect(nextCollectionEntry(entries, "e3", resolveWith({}))).toBeNull();
  });

  it("returns null when every later entry is unopenable", () => {
    const next = nextCollectionEntry(
      entries,
      "e1",
      resolveWith({ e2: { href: null, finished: false }, e3: { href: null, finished: false } }),
    );
    expect(next).toBeNull();
  });

  it("finds the current entry by its STABLE id, not array position", () => {
    // The current entry sits LAST in the array under an earlier id —
    // position-based scanning would miss it.
    const reordered = [entries[1]!, entries[2]!, entries[0]!];
    const next = nextCollectionEntry(reordered, "e1", resolveWith({}));
    expect(next).toBeNull();
  });
});

// ── The reader's collection context (orientation + the end card input) ──────

describe("deriveCollectionReadingContext (issue #247)", () => {
  const entries = [entry("e1", "a1"), entry("e2", "a2"), entry("e3", "a3")];
  const collection = {
    schemaVersion: 1 as const,
    id: "col-1",
    name: "Winter plan",
    entries,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };

  it("derives the anchor entry, its 1-based position, and the current order count", () => {
    const context = deriveCollectionReadingContext(collection, "e2", resolveWith({}));
    expect(context).not.toBeNull();
    expect(context?.entry.id).toBe("e2");
    expect(context?.position).toBe(2);
    expect(context?.count).toBe(3);
    expect(context?.collectionName).toBe("Winter plan");
  });

  it("derives the next openable entry and whether the plan is fully finished", () => {
    const context = deriveCollectionReadingContext(
      collection,
      "e2",
      resolveWith({ e1: { href: "#/article/a1", finished: true } }),
    );
    expect(context?.next).toEqual({ entry: entries[2], href: "#/article/x", title: "T:e3" });
    expect(context?.allFinished).toBe(false);
  });

  it("reports allFinished when shared completion marks every entry", () => {
    const context = deriveCollectionReadingContext(
      collection,
      "e3",
      resolveWith({
        e1: { href: "#/article/a1", finished: true },
        e2: { href: "#/article/a2", finished: true },
        e3: { href: "#/article/a3", finished: true },
      }),
    );
    expect(context?.allFinished).toBe(true);
    expect(context?.next).toBeNull();
  });

  it("returns null when the anchor entry is gone from the CURRENT collection (stale context degrades to plain reading)", () => {
    expect(deriveCollectionReadingContext(collection, "e9", resolveWith({}))).toBeNull();
  });
});
