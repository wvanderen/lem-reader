// src/routes/collections/continueCollection.ts
// Issue #247 — the ONE Continue-collection selection algebra. Pure
// functions, zero React, zero Dexie (the collectionEntries.ts store-seam
// discipline — the caller hands in the entries and the ONE entry resolution
// (resolveCollectionEntry over the settled snapshot); this module owns the
// selection rules over them).
//
// The model (issue #247 AC + ADR 0011 — navigation context, not a second
// reading position):
//   - "Continue collection opens the last active unfinished entry; if none
//     is usable, open the first unfinished entry in the current order."
//     USABLE means all three, evaluated against the collection's CURRENT
//     row and the settled snapshot at press time: the remembered entry
//     EXISTS (addressed by the STABLE entry id — a reorder can never strand
//     it, a membership edit can), is UNFINISHED (the shared completion
//     truth — reading elsewhere and explicit corrections both count), and
//     is OPENABLE (its target still resolves to a route — a deleted work
//     renders the row unlinked).
//   - "Completed collections show completion instead of silently
//     restarting": a fully-finished plan resolves to the `complete`
//     outcome — never back to entry 1. An EMPTY collection is its own
//     outcome, distinct from a completed nonempty plan. An unfinished plan
//     whose unfinished entries are all unopenable is `blocked`, and the
//     outcome NAMES the blocker (honest refusal, not a dead link).
//   - "Use current collection order and shared completion after edits or
//     reading elsewhere": everything re-derives from the entries array and
//     the resolutions the caller passes — the algebra holds no state, so a
//     stale Continue can never outlive the row it was computed from.
//   - The reader's explicit Next reading advances to the next OPENABLE
//     entry in CURRENT order, skipping unopenable ones (the button names
//     its destination — nothing is silently dropped in front of the
//     reader), or null at the plan's end (no silent wraparound).
import type { Collection, CollectionEntry } from "../../content/schema";
import type { CollectionEntryLookup, EntryResolution } from "./collectionEntries";
import { resolveCollectionEntry } from "./collectionEntries";

/** Everything an entry → resolution derivation needs. A thin alias over the
 * ONE collectionEntries lookup (tests hand-build resolutions directly). */
export type EntryResolver = (entry: CollectionEntry) => EntryResolution;

/** The resolver built from the ONE snapshot lookup (the same folds the
 * views render from — rows, progress line, and Continue can never disagree
 * about finished/openable). */
export function entryResolverFrom(lookup: CollectionEntryLookup): EntryResolver {
  return (entry: CollectionEntry) => resolveCollectionEntry(entry, lookup);
}

/**
 * The outcome of one Continue-collection press, evaluated at press time.
 * `resume` and `first` carry the entry AND its resolved route (the
 * established whole-work/chapter resume rules — the href the detail rows
 * render); `complete` carries the counts for the honest completion line;
 * `blocked` names the first unfinished (unopenable) entry; `empty` is the
 * no-content plan.
 */
export type ContinueCollectionTarget =
  | { kind: "resume"; entry: CollectionEntry; href: string }
  | { kind: "first"; entry: CollectionEntry; href: string }
  | { kind: "complete"; finished: number; total: number }
  | { kind: "blocked"; entry: CollectionEntry }
  | { kind: "empty" };

/**
 * continueCollectionTarget — the Continue selection (issue #247 AC). Pure:
 * the caller re-derives at press time from the CURRENT row + snapshot, so
 * edits and reading elsewhere can never strand the outcome.
 */
export function continueCollectionTarget(
  entries: readonly CollectionEntry[],
  activeEntryId: string | null,
  resolve: EntryResolver,
): ContinueCollectionTarget {
  if (entries.length === 0) return { kind: "empty" };

  // The remembered entry resumes only while it is CURRENT (present by
  // stable id), UNFINISHED (shared completion), and OPENABLE (target still
  // resolves to a route). Removed, completed, deleted, or invalidated
  // memories all fall through to the first-unfinished fallback.
  const remembered =
    activeEntryId !== null ? entries.find((entry) => entry.id === activeEntryId) : undefined;
  if (remembered !== undefined) {
    const resolution = resolve(remembered);
    if (resolution.href !== null && !resolution.finished) {
      return { kind: "resume", entry: remembered, href: resolution.href };
    }
  }

  // The fallback: the FIRST unfinished, openable entry in CURRENT order.
  for (const entry of entries) {
    const resolution = resolve(entry);
    if (resolution.href !== null && !resolution.finished) {
      return { kind: "first", entry, href: resolution.href };
    }
  }

  // Nothing unfinished and openable: either everything finished (complete —
  // show completion, never restart) or the unfinished remainder is all
  // unopenable (blocked — name the blocker).
  const unfinished = entries.find((entry) => !resolve(entry).finished);
  if (unfinished === undefined) {
    return { kind: "complete", finished: countFinished(entries, resolve), total: entries.length };
  }
  return { kind: "blocked", entry: unfinished };
}

/**
 * The next entry the reader's explicit "Next reading" advances to: the
 * first OPENABLE entry strictly after the current one in CURRENT order.
 * Unopenable entries are skipped (the button names its destination — the
 * reader sees where they are going), and the plan's end resolves to null
 * (no silent wraparound). The current entry is found by its STABLE id.
 */
export function nextCollectionEntry(
  entries: readonly CollectionEntry[],
  currentEntryId: string,
  resolve: EntryResolver,
): { entry: CollectionEntry; href: string; title: string | null } | null {
  const index = entries.findIndex((entry) => entry.id === currentEntryId);
  if (index === -1) return null;
  for (let i = index + 1; i < entries.length; i += 1) {
    const entry = entries[i]!;
    const resolution = resolve(entry);
    if (resolution.href !== null) {
      return { entry, href: resolution.href, title: resolution.title };
    }
  }
  return null;
}

/**
 * What the READER's end-of-entry card renders from (orientation + the Next
 * reading action), re-derived from the CURRENT collection row and snapshot
 * on every change. Null when the anchor entry is gone from the CURRENT
 * collection — a stale context degrades to plain reading (the collection
 * detail view and Continue remain the way back in).
 */
export interface CollectionReadingContext {
  /** The collection the open came from (name for the orientation line). */
  collectionName: string;
  /** The anchor entry (the stable id the URL carried). */
  entry: CollectionEntry;
  /** 1-based position of the anchor in the CURRENT order, and the plan's
   * entry count — the "reading k of n" orientation line. */
  position: number;
  count: number;
  /** The next openable entry in CURRENT order (the Next reading target),
   * or null at the plan's end. */
  next: { entry: CollectionEntry; href: string; title: string | null } | null;
  /** Shared completion over the whole plan — the "You've finished this
   * collection" line when every entry is done. */
  allFinished: boolean;
}

/** Finished entries over the plan (the resolver is the ONE completion
 * truth this algebra has — the shared-completion algebra's own output). */
function countFinished(entries: readonly CollectionEntry[], resolve: EntryResolver): number {
  let finished = 0;
  for (const entry of entries) {
    if (resolve(entry).finished) finished += 1;
  }
  return finished;
}

/**
 * deriveCollectionReadingContext — the reader's collection context, derived
 * from the CURRENT collection row + the ONE entry resolver. Null when the
 * anchor entry no longer exists in the collection (removed while reading —
 * the context degrades honestly; no chrome can point at a row that is not
 * there).
 */
export function deriveCollectionReadingContext(
  collection: Collection,
  anchorEntryId: string,
  resolve: EntryResolver,
): CollectionReadingContext | null {
  const index = collection.entries.findIndex((entry) => entry.id === anchorEntryId);
  if (index === -1) return null;
  return {
    collectionName: collection.name,
    entry: collection.entries[index]!,
    position: index + 1,
    count: collection.entries.length,
    next: nextCollectionEntry(collection.entries, anchorEntryId, resolve),
    allFinished: countFinished(collection.entries, resolve) === collection.entries.length,
  };
}
