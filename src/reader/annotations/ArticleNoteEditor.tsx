// src/reader/annotations/ArticleNoteEditor.tsx
// Issue #210 — the ONE article-note editing session, extracted from
// ArticleNotes.tsx so the cross-library Annotations review can edit article
// notes in place (the parent spec: "Edit article notes directly from
// review") with the ESTABLISHED editor, not a fork:
//
//   - plain-text system-sans textarea (the .highlight-popover-textarea
//     register — no rich text, no typography controls);
//   - automatic saving through the ONE editArticleNote store seam with
//     write-through recovery drafts (the store owns safe handling of
//     incomplete/empty drafts; a save failure keeps the writing visible
//     with Retry);
//   - the ALWAYS-VISIBLE annotation-tag field (issue #207/209): Enter/Add
//     commits, blur never does, commits ride the SAME persisted-vocabulary
//     routing as highlight tags (routeToStoredCasing) and the SAME save
//     queue as text writes;
//   - LAYERED ESCAPE, one layer per press: dismiss an open suggestion
//     list, clear uncommitted tag text, then close the editor through the
//     safe save/recovery behavior (the close drains the queue so every
//     accepted edit persists);
//   - deletion ONLY for saved notes, behind the explicit confirm;
//   - emptied saved notes never implicitly delete — the store preserves
//     the last saved content and the recoverable edit, and the status copy
//     says so.
//
// The component renders NO live region of its own: status copy routes to
// the HOST's one polite region via onStatusChange (issue #98 — one status
// region per surface seam; the drawer host mounts the section's region, the
// review host the page's). Hosts own focus return (they know the opening
// control) via onClosed.
//
// Pitfall 8: stored text renders as React text children / controlled value
// only — never raw HTML.
import { useLayoutEffect, useRef, useState } from "react";
import {
  deleteArticleNote,
  editArticleNote,
  type ArticleNote,
} from "../../persistence/articleNotesStore";
// Issue #209 — the article note's tag commits ride the SAME persisted-
// vocabulary routing as setHighlightTags (the ONE write-seam discipline:
// a stale or failed picker stats read can never stack a case twin on disk).
import { routeToStoredCasing } from "../../ingestion/library/tagsStore";
// Issue #209 — the ONE shared annotation-tag entry (normalization,
// suggestions, commit-per-change writes, layered Escape), the same seam the
// highlight panel mounts.
import { TagEntry } from "../TagEntry";

export interface ArticleNoteEditorProps {
  /** The value the session opens with — the saved row, a newer recovery
   * draft, or a fresh draft (it carries the articleId). The host owns the
   * recovery preference; the editor owns everything after mount. */
  initial: ArticleNote;
  /** Whether the host recovered a draft (drives the "Recovered draft"
   * status and the guarded close that re-persists recovered writing). */
  recovered: boolean;
  /** Whether a SAVED row already exists for this id (gates the Delete
   * control; the editor tracks saves landed during the session itself). */
  saved: boolean;
  /** Status copy routes to the HOST's one polite region (issue #98). */
  onStatusChange: (status: string) => void;
  /** Host guard while writing (the drawer's inert/scrim discipline).
   * Optional — inline hosts without chrome to disable omit it. */
  onEditingChange?: (editing: boolean) => void;
  /** After ANY landed write — the host refreshes its list/snapshot. */
  onSaved?: () => void;
  /** The session ended: a safe close (queue drained, every accepted edit
   * persisted) or a confirmed delete. The host closes and restores focus
   * to the opening control. */
  onClosed: (result: { deleted: boolean }) => void;
}

export function ArticleNoteEditor({
  initial,
  recovered: recoveredInitial,
  saved: savedInitial,
  onStatusChange,
  onEditingChange,
  onSaved,
  onClosed,
}: ArticleNoteEditorProps) {
  const [editor, setEditor] = useState<ArticleNote>(initial);
  const [status, setStatus] = useState(recoveredInitial ? "Recovered draft" : "");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // Issue #98 — the host owns the ONE polite region for this surface seam;
  // the local state exists only for the editor's own Retry gating.
  const report = (next: string) => {
    setStatus(next);
    onStatusChange(next);
  };
  const textarea = useRef<HTMLTextAreaElement>(null);
  const keepNote = useRef<HTMLButtonElement>(null);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const latest = useRef<ArticleNote | null>(initial);
  const recovered = useRef(recoveredInitial);
  // Whether a SAVED row exists for this id (the emptied-edit copy and the
  // Delete gate branch on it; the queue tasks read the ref, not render
  // state). A landed nonempty write makes it true — the store persists
  // exactly then (an emptied saved note keeps its saved row).
  const savedIds = useRef<Set<string>>(savedInitial ? new Set([initial.id]) : new Set());

  useLayoutEffect(() => {
    textarea.current?.focus({ preventScroll: true });
    onEditingChange?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only session start
  }, []);
  useLayoutEffect(() => {
    if (confirming) keepNote.current?.focus({ preventScroll: true });
  }, [confirming]);

  /** Advance the editor clock past every staged write and stage the result.
   *  The ONE definition of "the reader's next edit" (text keystroke and tag
   *  commit alike): monotonically distinct updatedAt, latest.current first,
   *  then the render state. */
  const stage = (base: ArticleNote, patch: Partial<ArticleNote>): ArticleNote => {
    const value = {
      ...base,
      ...patch,
      updatedAt: new Date(Math.max(Date.now(), Date.parse(base.updatedAt) + 1)).toISOString(),
    };
    latest.current = value;
    setEditor(value);
    return value;
  };
  /** The ONE persisted-write task body (the queue serializes text and tag
   *  writes; the write-through recovery draft is the store's job). Each task
   *  persists the FRESHEST staged editor state, not the caller's snapshot:
   *  a keystroke staged while an earlier task holds the queue (e.g. a tag
   *  commit's routing await) runs later, so rebasing at run time is what
   *  keeps its write from reverting that commit — the queue's last write
   *  always lands the full picture (newest text AND tags). Never throws —
   *  the boolean routes the guarded close. */
  const persist = async (value: ArticleNote): Promise<boolean> => {
    const staged = latest.current ?? value;
    try {
      await editArticleNote(staged);
      await onSaved?.();
      if (latest.current === staged) {
        recovered.current = false;
        if (staged.text.trim()) savedIds.current.add(staged.id);
        report(
          staged.text.trim()
            ? "Saved."
            : savedIds.current.has(staged.id)
              ? "Note text is required. Restore text or use Delete to remove a saved note. Your last saved text is preserved."
              : "Note text is required to save.",
        );
      }
      return true;
    } catch {
      if (latest.current === staged)
        report("Couldn't save the note. Your writing is still here. Try again.");
      return false;
    }
  };
  const write = (value: ArticleNote) => {
    queue.current = queue.current.then(() => persist(value));
    return queue.current;
  };
  /** Commit the tag editor's next selection onto THIS note (never the
   *  article's tags, never another annotation's). Routing reads the
   *  persisted vocabulary, so the whole commit is serialized through the
   *  save queue alongside text writes: a keystroke staged while the routing
   *  await holds the queue persists the commit too (persist rebases at run
   *  time), and a keystroke after carries the tags — a commit can never be
   *  silently reverted by an in-flight text write. */
  const applyTags = (next: string[]): Promise<void> => {
    const task = queue.current.then(async () => {
      const routed = await routeToStoredCasing(next);
      const current = latest.current;
      if (!current) return true;
      const value = stage(current, { tags: routed });
      report("Saving…");
      return persist(value);
    });
    queue.current = task;
    return task.then(() => undefined);
  };
  const close = async () => {
    if (busy) return;
    setBusy(true);
    // Tag controls can accept another commit while a pending save settles.
    // Drain the current tail before closing so every accepted edit persists.
    let pending: Promise<boolean>;
    let ok: boolean;
    do {
      pending = queue.current;
      ok = await pending;
      if ((!ok || recovered.current) && latest.current) {
        pending = write(latest.current);
        ok = await pending;
      }
    } while (pending !== queue.current);
    setBusy(false);
    if (!ok) return;
    latest.current = null;
    onEditingChange?.(false);
    onClosed({ deleted: false });
  };
  const remove = async () => {
    setBusy(true);
    await queue.current;
    try {
      await deleteArticleNote(editor.id);
      await onSaved?.();
      latest.current = null;
      onEditingChange?.(false);
      onClosed({ deleted: true });
    } catch {
      report("Couldn't delete this article note. Try again.");
    }
    setBusy(false);
  };
  const saved = savedIds.current.has(editor.id);
  return (
    <div
      className="article-note-editor"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (confirming) {
            setConfirming(false);
            textarea.current?.focus({ preventScroll: true });
          } else void close();
        }
      }}
    >
      <label htmlFor="article-note-text">Article note</label>
      <textarea
        className="highlight-popover-textarea"
        ref={textarea}
        id="article-note-text"
        value={editor.text}
        disabled={busy}
        onChange={(event) => {
          // Stage from the LATEST editor state (not the render snapshot):
          // a queued tag commit may have advanced it between renders, and
          // every write lands the full picture (text AND tags).
          const value = stage(latest.current ?? editor, {
            text: event.target.value,
          });
          report("Saving…");
          void write(value);
        }}
      />
      {/* Issue #209 — the annotation-tag field is ALWAYS VISIBLE while
          editing an article note (the issue #207 organization-area
          register): Enter/Add commits, blur never does, and Escape is
          layered one press at a time — suggestion list, uncommitted tag
          text, then the editor's own close. The write routes through
          applyTags so commits land on THIS note only: article tags and
          other annotations are never touched. */}
      {!confirming && (
        <section className="article-note-tags" aria-label="Article note tags">
          <TagEntry
            recordId={editor.id}
            tags={editor.tags ?? []}
            saveTags={applyTags}
            inputId="article-note-tags-input"
            dismissSuggestionsOnEscape
            clearDraftOnEscape
          />
        </section>
      )}
      {confirming ? (
        <div>
          <p>Delete this article note? This cannot be undone.</p>
          <button
            ref={keepNote}
            type="button"
            className="btn btn-quiet"
            disabled={busy}
            onClick={() => {
              setConfirming(false);
              textarea.current?.focus();
            }}
          >
            Keep note
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            disabled={busy}
            onClick={() => void remove()}
          >
            Confirm delete article note
          </button>
        </div>
      ) : (
        <div>
          <button
            type="button"
            className="btn btn-quiet"
            disabled={busy}
            onClick={() => void close()}
          >
            Done
          </button>
          {(status.startsWith("Couldn't save") || status === "Recovered draft") && (
            <button
              type="button"
              className="btn btn-quiet"
              disabled={busy}
              onClick={() => void write(editor)}
            >
              Retry save
            </button>
          )}
          {saved && (
            <button
              type="button"
              className="btn btn-quiet"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              Delete article note
            </button>
          )}
        </div>
      )}
    </div>
  );
}
