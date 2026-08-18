// src/reader/TagEntry.tsx
// Plan 08-04 — TagEntry (LIB-04 + D8-05 — tags edited WHILE reading, not while
// browsing). Mounted inside ArticleView's <header> as a sibling of the title /
// meta / source-link. Writes through to tagsStore.setArticleTags (Plan 02),
// which denormalizes the tag array on the Dexie article row.
//
// CRITICAL — Pitfall 8-5 (focus discipline): TagEntry is INERT at ArticleView
// mount. Do NOT call inputRef.current?.focus() in a mount-time effect. Do NOT
// set the React auto-focus prop on the input. The reader activates the input
// via Tab or click. Auto-focusing the tag input on mount would steal focus
// from the article body and break v1.0 e2e tests (open-every-fixture.spec.ts
// + v1-regression.spec.ts assert that the article body holds initial focus).
// The ONLY legitimate focus shift on mount is to the article body itself;
// TagEntry must defer to that.
//
// Threat register (08-04-PLAN.md `<threat_model>`):
//   - T-8-16 (Tampering/XSS, tag-name injection) → tag names render as React
//     text children; React escapes by default. Defensive trim/dedupe/empty-drop
//     before calling setArticleTags. No HTML parsing, no dangerouslySetInner.
//   - T-8-18 (Tampering, TagEntry steals focus on mount) → see Pitfall 8-5
//     above; verified by grep acceptance (no auto-focus prop, no .focus() in
//     any mount-time effect).
import { useState } from "react";
import { setArticleTags } from "../ingestion/library/tagsStore";

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
 * TagEntry — fieldset + legend + existing-tag chips (with × remove) + an
 * add-tag input + Add button. Renders INSIDE ArticleView's <header>.
 *
 * The input is controlled local state; add/remove writes through to
 * setArticleTags (Plan 02's idempotent Dexie update + empty-string filter).
 * Errors (Dexie write failure) surface in a small .status live region inside
 * the fieldset (mirrors IngestControl's discipline — A11Y-08).
 */
export function TagEntry({ articleId, tags, saveTags }: TagEntryProps) {
  const [draft, setDraft] = useState("");
  // Local mirror of the tag array so the UI updates immediately on add/remove
  // without waiting for the parent's next render. The Dexie write is fire-and-
  // forget (errors land in errorCopy); the parent does not need to re-fetch.
  const [localTags, setLocalTags] = useState<string[]>(tags);
  const [errorCopy, setErrorCopy] = useState<string | null>(null);

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

  function handleAdd() {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    if (localTags.includes(trimmed)) {
      // Dedupe: silently clear the draft (no error copy — the reader already
      // has this tag; the chip is visible above).
      setDraft("");
      return;
    }
    setDraft("");
    void commitTags([...localTags, trimmed]);
  }

  function handleRemove(name: string) {
    void commitTags(localTags.filter((t) => t !== name));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault(); // prevent form submission if the fieldset is in a form
      handleAdd();
    }
  }

  return (
    <fieldset className="tag-entry">
      <legend>Tags</legend>
      {localTags.length > 0 && (
        <ul className="tag-entry-list">
          {localTags.map((name) => (
            <li key={name}>
              <span className="tag-chip tag-chip-readonly">{name}</span>
              <button
                type="button"
                className="tag-chip-remove"
                aria-label={`Remove tag ${name}`}
                onClick={() => handleRemove(name)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="tag-entry-add-row">
        <label htmlFor="tag-entry-new" className="visually-hidden">
          Add a tag
        </label>
        <input
          id="tag-entry-new"
          className="tag-entry-input"
          type="text"
          value={draft}
          // NO auto-focus (Pitfall 8-5 — TagEntry is inert at mount).
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="tag-entry-add" onClick={handleAdd}>
          Add tag
        </button>
      </div>
      {/* .status live region mirrors IngestControl's discipline (A11Y-08 —
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
