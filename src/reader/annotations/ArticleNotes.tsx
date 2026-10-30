import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  deleteArticleNote,
  editArticleNote,
  loadArticleNotes,
  type ArticleNote,
} from "../../persistence/articleNotesStore";
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
  const write = (value: ArticleNote) => {
    queue.current = queue.current.then(async () => {
      try {
        await editArticleNote(value);
        await refresh();
        if (latest.current === value) {
          recovered.current = false;
          setStatus(
            value.text.trim()
              ? "Saved."
              : "Note text is required. Restore text or use Delete to remove a saved note. Your last saved text is preserved.",
          );
        }
        return true;
      } catch {
        if (latest.current === value)
          setStatus("Couldn't save the note. Your writing is still here. Try again.");
        return false;
      }
    });
    return queue.current;
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
              const value = {
                ...editor,
                text: event.target.value,
                updatedAt: new Date(
                  Math.max(Date.now(), Date.parse(editor.updatedAt) + 1),
                ).toISOString(),
              };
              latest.current = value;
              setEditor(value);
              setStatus("Saving…");
              void write(value);
            }}
          />
          <StatusRegion>{status}</StatusRegion>
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
                  {note.text}
                </button>
              </li>
            ))}
        </ol>
      )}
      {!editor && status && <StatusRegion>{status}</StatusRegion>}
    </section>
  );
}
