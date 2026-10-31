import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadArticleNotes, type ArticleNote } from "../../persistence/articleNotesStore";
import { StatusRegion } from "../../ui/StatusRegion";
// Issue #210 — the ONE article-note editing session (plain-text editor,
// save/recovery rules, always-visible tags, layered Escape) lives in the
// shared ArticleNoteEditor; this list host owns its entries, the Add
// control, and focus return to the originating entry.
import { ArticleNoteEditor } from "./ArticleNoteEditor";

/** Article-level reflection list + editing host. No selectors, passage
 * navigation, or reading-location writes. The editing session itself is the
 * shared ArticleNoteEditor (issue #210 — the cross-library review hosts the
 * same session); this host forwards session status to its ONE section live
 * region (issue #98) and restores focus to the originating entry on close. */
export function ArticleNotes({
  articleId,
  onEditingChange,
}: {
  articleId: string;
  onEditingChange: (editing: boolean) => void;
}) {
  const [notes, setNotes] = useState<ArticleNote[]>([]);
  const [drafts, setDrafts] = useState<ArticleNote[]>([]);
  const [session, setSession] = useState<{
    initial: ArticleNote;
    recovered: boolean;
    saved: boolean;
  } | null>(null);
  const [status, setStatus] = useState("");
  const returnFocus = useRef(false);
  const originNoteId = useRef<string | null>(null);
  const section = useRef<HTMLElement>(null);
  const add = useRef<HTMLButtonElement>(null);
  const refresh = async () => {
    const loaded = await loadArticleNotes(articleId);
    setNotes(loaded.notes);
    setDrafts(loaded.drafts);
  };
  useEffect(() => {
    let active = true;
    void loadArticleNotes(articleId)
      .then((result) => {
        if (active) {
          setNotes(result.notes);
          setDrafts(result.drafts);
        }
      })
      .catch(() => {
        if (active) setStatus("Couldn't load article notes. Reopen annotations to try again.");
      });
    return () => {
      active = false;
    };
  }, [articleId]);
  useLayoutEffect(() => {
    if (session === null && returnFocus.current) {
      returnFocus.current = false;
      const entry = Array.from(
        section.current?.querySelectorAll<HTMLElement>("[data-article-note-id]") ?? [],
      )
        .find((item) => item.dataset.articleNoteId === originNoteId.current)
        ?.querySelector<HTMLElement>("button");
      (entry ?? add.current)?.focus({ preventScroll: true });
    }
  }, [session]);

  const open = (note?: ArticleNote, savedNote = false) => {
    originNoteId.current = note?.id ?? null;
    const time = new Date().toISOString();
    const draft = note && drafts.find((d) => d.id === note.id && d.updatedAt >= note.updatedAt);
    const value = draft ||
      note || {
        schemaVersion: 1 as const,
        id: crypto.randomUUID(),
        articleId,
        text: "",
        createdAt: time,
        updatedAt: time,
      };
    setStatus(draft ? "Recovered draft" : "");
    onEditingChange(true);
    setSession({
      initial: value,
      recovered: Boolean(draft),
      // A saved row exists iff the opened entry is one of the loaded saved
      // notes (tag-only draft entries open unsaved).
      saved: savedNote,
    });
  };
  /** Entry list → editor open: saved rows pass their saved state so the
   *  Delete control gates correctly. */
  const openEntry = (entry: ArticleNote) => {
    open(
      entry,
      notes.some((n) => n.id === entry.id),
    );
  };
  const entryLabel = (note: ArticleNote): string =>
    // Issue #209 — a tag-only draft (no text yet) still identifies itself in
    // the list so the reader can reopen the recoverable draft; its tag names
    // stand in for the empty text.
    note.text.trim() ? note.text : note.tags?.length ? `Tags: ${note.tags.join(", ")}` : note.text;
  return (
    <section ref={section} className="article-notes" aria-label="Article notes">
      <h3>Article notes</h3>
      {!session && (
        <button ref={add} type="button" className="btn btn-quiet" onClick={() => open()}>
          Add article note
        </button>
      )}
      {session ? (
        <ArticleNoteEditor
          key={session.initial.id}
          initial={session.initial}
          recovered={session.recovered}
          saved={session.saved}
          onStatusChange={setStatus}
          onEditingChange={onEditingChange}
          onSaved={refresh}
          onClosed={({ deleted }) => {
            // After a delete the originating entry is gone — focus falls to
            // the Add control (the originNoteId discipline below).
            if (deleted) originNoteId.current = null;
            returnFocus.current = true;
            setSession(null);
          }}
        />
      ) : (
        <ol className="article-note-list">
          {[...notes, ...drafts.filter((draft) => !notes.some((note) => note.id === draft.id))]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
            .map((note) => (
              <li key={note.id} data-article-note-id={note.id}>
                <button
                  type="button"
                  className="btn btn-quiet drawer-entry"
                  onClick={(event) => {
                    event.currentTarget.focus();
                    openEntry(note);
                  }}
                >
                  {entryLabel(note)}
                </button>
              </li>
            ))}
        </ol>
      )}
      <StatusRegion>{status}</StatusRegion>
    </section>
  );
}
