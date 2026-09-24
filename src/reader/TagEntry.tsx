// src/reader/TagEntry.tsx
// Plan 08-04 — TagEntry (LIB-04 + D8-05 — tags edited WHILE reading, not while
// browsing). Mounted inside ArticleView's tag popover (a sibling of the title
// / meta / source-link region it used to render beside directly) and in
// BookRow's expanded region. Writes through to tagsStore.setArticleTags (Plan
// 02), which denormalizes the tag array on the Dexie article row.
//
// Issue #75 (decision #71) — the entry converges on the ONE shared
// TagPicker (variant A refined): same mental model as the library-row
// popover and the Add dialog. The picker replaces the hand-rolled
// chips + input + Add-button anatomy; commit-per-change write-through is
// unchanged, and the case-insensitive routing lives in the picker now.
//
// Suggestion stats: loaded LAZILY on first focus inside the fieldset (the
// host surfaces mount this inertly — an eager load would tax every article
// open for suggestions the reader may never use) and refreshed after each
// successful commit so a freshly created tag is routable next time. A
// stats failure is non-critical chrome: the picker degrades to create-only
// (no suggestions), never an error surface.
//
// CRITICAL — Pitfall 8-5 (focus discipline): TagEntry is INERT at ArticleView
// mount. Do NOT call inputRef.current?.focus() in a mount-time effect. Do NOT
// set the React auto-focus prop (banned by lint). NO focusOnMount reaches the
// picker from this host. The reader activates the input via Tab or click.
// Auto-focusing the tag input on mount would steal focus from the article
// body and break v1.0 e2e tests (open-every-fixture.spec.ts +
// v1-regression.spec.ts assert that the article body holds initial focus).
// The ONLY legitimate focus shift on mount is to the article body itself;
// TagEntry must defer to that.
//
// Threat register (08-04-PLAN.md `<threat_model>`):
//   - T-8-16 (Tampering/XSS, tag-name injection) → tag names render as React
//     text children; React escapes by default. The picker + commit path keep
//     the trim/dedupe/empty-drop discipline. No HTML parsing, no
//     dangerouslySetInnerHTML.
//   - T-8-18 (Tampering, TagEntry steals focus on mount) → see Pitfall 8-5
//     above; verified by grep acceptance (no auto-focus prop, no .focus() in
//     any mount-time effect).
import { useEffect, useRef, useState } from "react";
import type { TagStat } from "../ingestion/library/tagsStore";
import { loadTagStats, setArticleTags } from "../ingestion/library/tagsStore";
import { TagPicker } from "../ui/TagPicker";

interface TagEntryProps {
  /** The article whose tags are being edited. */
  articleId: string;
  /** The current tag array on the article row. */
  tags: string[];
  /**
   * Optional persistence override (Plan 12-05 — D12-04 book tags). When
   * present, commitTags writes through THIS callback instead of
   * setArticleTags; BookRow passes `(tags) => setBookTags(book.id, tags)`
   * so tags persist on the BOOK record (db.articles.update(bookId, …)
   * would be a silent no-op — no article carries a book id). Default
   * callers (ArticleView) are unaffected: the prop is absent and the
   * setArticleTags path runs exactly as before.
   */
  saveTags?: (tags: string[]) => Promise<void>;
}

/**
 * TagEntry — fieldset + legend + the shared TagPicker + a small .status
 * live region. Renders INSIDE ArticleView's tag popover / BookRow's
 * expanded region. INERT at mount (Pitfall 8-5).
 */
export function TagEntry({ articleId, tags, saveTags }: TagEntryProps) {
  // Local mirror of the tag array so the UI updates immediately on
  // add/remove without waiting for the parent's next render. The Dexie
  // write is fire-and-forget (errors land in errorCopy); the parent does
  // not need to re-fetch.
  const [localTags, setLocalTags] = useState<string[]>(tags);
  const [errorCopy, setErrorCopy] = useState<string | null>(null);
  // Suggestion stats — lazy (first focus) + refresh-after-commit (see the
  // module comment). The loaded flag keeps the focus-capture idempotent
  // (a StrictMode twin pass loads once too).
  const [stats, setStats] = useState<TagStat[]>([]);
  const statsLoadedRef = useRef(false);

  useEffect(() => {
    if (!statsLoadedRef.current) return;
    let cancelled = false;
    loadTagStats()
      .then((next) => {
        if (!cancelled) setStats(next);
      })
      .catch(() => {
        /* suggestions are non-critical chrome — keep the last read */
      });
    return () => {
      cancelled = true;
    };
  }, [localTags]);

  function ensureStats() {
    if (statsLoadedRef.current) return;
    statsLoadedRef.current = true;
    loadTagStats()
      .then(setStats)
      .catch(() => {
        /* the picker degrades to create-only; never an error surface */
      });
  }

  /**
   * commitTags — write the new tag array through setArticleTags and update
   * localTags. Catches Dexie errors and routes to the .status live region;
   * never throws to the caller. The calm voice (D7-04) is preserved — no
   * jargon in the error copy.
   */
  async function commitTags(next: string[]) {
    setErrorCopy(null);
    setLocalTags(next);
    try {
      // Plan 12-05 — the optional override routes BOOK tag commits to
      // setBookTags (D12-04); the default path is byte-identical to the
      // Phase 8 article-tag write.
      if (saveTags) {
        await saveTags(next);
      } else {
        await setArticleTags(articleId, next);
      }
    } catch {
      // Dexie write failure — the article row stays unchanged on disk; the
      // local mirror may diverge until the next ArticleView mount. Calm voice.
      setErrorCopy("Couldn't save tag.");
    }
  }

  return (
    <fieldset className="tag-entry" onFocusCapture={ensureStats}>
      <legend>Tags</legend>
      <label htmlFor="tag-entry-input" className="visually-hidden">
        Add or search a tag
      </label>
      <TagPicker
        stats={stats}
        selected={localTags}
        onChange={(next) => void commitTags(next)}
        inputId="tag-entry-input"
      />
      {/* .status live region mirrors the add dialog's discipline (A11Y-08 —
          readers using AT hear about save failures). aria-atomic so the SR
          re-announces the whole phrase on every change. */}
      {errorCopy !== null && (
        <div
          className="status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <p>{errorCopy}</p>
        </div>
      )}
    </fieldset>
  );
}
