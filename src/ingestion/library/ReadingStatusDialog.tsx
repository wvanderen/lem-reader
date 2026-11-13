import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CanonicalArticle, CompletionRecord } from "../../content/schema";
import { listWorkChapterTargets, resolveWorkChapterTarget } from "../../content/chapterTargets";
import { completionTargetKey } from "../../content/completion";
import { recordCompletion } from "../../persistence/completionsStore";
import { effectiveTitle } from "./effectiveMetadata";
import { ReadingStateButton } from "./ReadingStateButton";

/** Secondary correction session, independent of collection membership and
 * canonical passage position. The library snapshot remains display truth;
 * ReadingStateButton bridges each write/reload with its existing optimistic,
 * pending and honest-error behavior. No chapter is inferred from position. */
export function ReadingStatusDialog({
  article,
  wholeFinished,
  completions,
  onChanged,
  returnFocusTo,
  onClose,
}: {
  article: CanonicalArticle;
  wholeFinished: boolean;
  completions: ReadonlyMap<string, CompletionRecord>;
  onChanged: () => void;
  returnFocusTo: HTMLElement | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [saving, setSaving] = useState(false);
  const chapters = useMemo(
    () => (article.ingestionMeta?.bookId === undefined ? listWorkChapterTargets(article) : []),
    [article],
  );

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // WebKit does not necessarily focus a pointer-activated button. The
    // opener owns this target; activeElement may still be the body/search.
    const trigger = returnFocusTo;
    dialog.showModal();
    closeRef.current?.focus();
    return () => {
      dialog.close();
      if (trigger?.isConnected) trigger.focus();
      else document.getElementById("main")?.focus();
    };
  }, [returnFocusTo]);

  const correct = async (destinationId: string | null, finished: boolean) => {
    // A stale destination never writes a fabricated chapter completion.
    if (destinationId !== null && resolveWorkChapterTarget(article, destinationId) === null) {
      throw new Error("Chapter is no longer available");
    }
    setSaving(true);
    try {
      await recordCompletion(
        destinationId === null
          ? { kind: "article", articleId: article.id }
          : { kind: "work-chapter", articleId: article.id, destinationId },
        finished,
        "reader",
      );
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={ref}
      className="reading-status"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div className="reading-status-inner">
        <div className="reading-status-heading">
          <h2 id={titleId}>Reading status</h2>
          <button
            ref={closeRef}
            type="button"
            className="btn btn-quiet"
            disabled={saving}
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p id={descriptionId} className="meta">
          {effectiveTitle(article)}. Changes keep your saved place.
        </p>
        <fieldset className="reading-status-controls" disabled={saving}>
          <legend className="visually-hidden">Finished readings and chapters</legend>
          <div className="reading-status-row">
            <span>Whole reading</span>
            <ReadingStateButton
              title="Whole reading"
              isRead={wholeFinished}
              variant="text"
              labels={{ mark: "Mark finished", unmark: "Mark unfinished" }}
              onChange={(finished) => correct(null, finished)}
            />
          </div>
          <h3>Chapters</h3>
          <ul className="reading-status-chapters">
            {chapters.map((chapter) => {
              const finished =
                completions.get(
                  completionTargetKey({
                    kind: "work-chapter",
                    articleId: article.id,
                    destinationId: chapter.id,
                  }),
                )?.finished === true;
              return (
                <li className="reading-status-row" key={chapter.id}>
                  <span>{chapter.title}</span>
                  <ReadingStateButton
                    title={chapter.title}
                    isRead={finished}
                    variant="text"
                    labels={{ mark: "Mark finished", unmark: "Mark unfinished" }}
                    onChange={(next) => correct(chapter.id, next)}
                  />
                </li>
              );
            })}
          </ul>
        </fieldset>
      </div>
    </dialog>
  );
}
