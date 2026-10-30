import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  deleteArticleNote,
  editArticleNote,
  loadArticleNotes,
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
import { StatusRegion } from "../../ui/StatusRegion";

/** Article-level reflection editor. No selectors, passage navigation, or reading-location writes. */
export function ArticleNotes({
  articleId,
  onEditingChange,
}: {
  articleId: string;
  onEditingChange: (editing: boolean) => void;
}) {
  const [notes, setNotes] = useState<ArticleNote[]>([]);
  const [drafts, setDrafts] = useState<ArticleNote[]>([]);
  const [editor, setEditor] = useState<ArticleNote | null>(null);
  const [status, setStatus] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const returnFocus = useRef(false);
  const originNoteId = useRef<string | null>(null);
  const section = useRef<HTMLElement>(null);
  const add = useRef<HTMLButtonElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const keepNote = useRef<HTMLButtonElement>(null);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const latest = useRef<ArticleNote | null>(null);
  const recovered = useRef(false);
  // Which notes have a SAVED row (the emptied-edit copy branches on it; the
  // queue tasks read the ref, not render state).
  const savedIds = useRef<Set<string>>(new Set());
  const refresh = async () => {
    const loaded = await loadArticleNotes(articleId);
    setNotes(loaded.notes);
    setDrafts(loaded.drafts);
    savedIds.current = new Set(loaded.notes.map((n) => n.id));
  };
  useEffect(() => {
    let active = true;
    void loadArticleNotes(articleId)
      .then((result) => {
        if (active) {
          setNotes(result.notes);
          setDrafts(result.drafts);
          savedIds.current = new Set(result.notes.map((n) => n.id));
        }
      })
      .catch(() => {
        if (active) setStatus("Couldn't load article notes. Reopen annotations to try again.");
      });
    return () => {
      active = false;
    };
  }, [articleId]);
  useEffect(() => {
    if (confirming) keepNote.current?.focus({ preventScroll: true });
  }, [confirming]);
  const editorId = editor?.id;
  useLayoutEffect(() => {
    if (editorId) textarea.current?.focus({ preventScroll: true });
    else if (returnFocus.current) {
      returnFocus.current = false;
      const entry = Array.from(
        section.current?.querySelectorAll<HTMLElement>("[data-article-note-id]") ?? [],
      )
        .find((item) => item.dataset.articleNoteId === originNoteId.current)
        ?.querySelector<HTMLElement>("button");
      (entry ?? add.current)?.focus({ preventScroll: true });
    }
  }, [editorId]);

  const open = (note?: ArticleNote) => {
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
    latest.current = value;
    recovered.current = Boolean(draft);
    setEditor(value);
    setConfirming(false);
    setStatus(draft ? "Recovered draft" : "");
    onEditingChange(true);
  };
  /** The ONE persisted-write task body (the queue serializes text and tag
   *  writes; the write-through recovery draft is the store's job). Never
   *  throws — the boolean routes the guarded close. */
  const persist = async (value: ArticleNote): Promise<boolean> => {
    try {
      await editArticleNote(value);
      await refresh();
      if (latest.current === value) {
        recovered.current = false;
        setStatus(
          value.text.trim()
            ? "Saved."
            : savedIds.current.has(value.id)
              ? "Note text is required. Restore text or use Delete to remove a saved note. Your last saved text is preserved."
              : "Note text is required to save.",
        );
      }
      return true;
    } catch {
      if (latest.current === value)
        setStatus("Couldn't save the note. Your writing is still here. Try again.");
      return false;
    }
  };
  const write = (value: ArticleNote) => {
    queue.current = queue.current.then(() => persist(value));
    return queue.current;
  };
  /** Issue #209 — commit the tag editor's next selection onto THIS note
   *  (never the article's tags, never another annotation's). Routing reads
   *  the persisted vocabulary, so the whole commit is serialized through the
   *  save queue alongside text writes: a keystroke during the routing await
   *  queues BEFORE this task (its snapshot then carries the new tags) and a
   *  keystroke after carries them too — a commit can never be silently
   *  reverted by an in-flight text write. */
  const applyTags = (next: string[]): Promise<void> => {
    const task = queue.current.then(async () => {
      const routed = await routeToStoredCasing(next);
      const current = latest.current;
      if (!current) return true;
      const value = {
        ...current,
        tags: routed,
        updatedAt: new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString(),
      };
      latest.current = value;
      setEditor(value);
      setStatus("Saving…");
      return persist(value);
    });
    queue.current = task;
    return task.then(() => undefined);
  };
  const close = async () => {
    if (busy) return;
    setBusy(true);
    let ok = await queue.current;
    if ((!ok || recovered.current) && latest.current) ok = await write(latest.current);
    setBusy(false);
    if (!ok) return;
    returnFocus.current = true;
    setEditor(null);
    latest.current = null;
    onEditingChange(false);
  };
  const remove = async () => {
    if (!editor) return;
    setBusy(true);
    await queue.current;
    try {
      await deleteArticleNote(editor.id);
      await refresh();
      originNoteId.current = null;
      returnFocus.current = true;
      setEditor(null);
      latest.current = null;
      onEditingChange(false);
    } catch {
      setStatus("Couldn't delete this article note. Try again.");
    }
    setBusy(false);
  };
  const saved = editor && notes.some((n) => n.id === editor.id);
  const entryLabel = (note: ArticleNote): string =>
    // Issue #209 — a tag-only draft (no text yet) still identifies itself in
    // the list so the reader can reopen the recoverable draft; its tag names
    // stand in for the empty text.
    note.text.trim() ? note.text : note.tags?.length ? `Tags: ${note.tags.join(", ")}` : note.text;
  return (
    <section ref={section} className="article-notes" aria-label="Article notes">
      <h3>Article notes</h3>
      {!editor && (
        <button ref={add} type="button" className="btn btn-quiet" onClick={() => open()}>
          Add article note
        </button>
      )}
      {editor ? (
        <div
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
              // Read the LATEST editor state (not the render snapshot): a
              // queued tag commit may have advanced it between renders, and
              // the newer text write must carry that commit's tags — the
              // queue's last write always wins with the full picture.
              const base = latest.current ?? editor;
              const value = {
                ...base,
                text: event.target.value,
                updatedAt: new Date(
                  Math.max(Date.now(), Date.parse(base.updatedAt) + 1),
                ).toISOString(),
              };
              latest.current = value;
              setEditor(value);
              setStatus("Saving…");
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
                    open(note);
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
