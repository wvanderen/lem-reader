import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Secondary actions stay inside the annotation dialog's modal boundary. */
export function AnnotationActions({
  triggerRef,
  onTabForward,
  disabled,
  onCopy,
  onDelete,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onTabForward: () => void;
  disabled: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initialItemRef = useRef(0);
  useLayoutEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]");
    if (items?.length) items[(initialItemRef.current + items.length) % items.length]?.focus();
  }, [open]);
  const focusItem = (index: number) => {
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]");
    items?.[(index + items.length) % items.length]?.focus();
  };
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  return (
    <div
      className="annotation-panel-more"
      ref={rootRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="highlight-controls-button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (open) close();
          else {
            initialItemRef.current = 0;
            setOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            initialItemRef.current = event.key === "ArrowUp" ? -1 : 0;
            setOpen(true);
          }
        }}
      >
        More actions
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Highlight actions"
          className="annotation-panel-menu"
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              // macOS WebKit may skip buttons in native sequential navigation.
              // Keep the menu's exit contract independent of that preference.
              event.preventDefault();
              close();
              if (!event.shiftKey) onTabForward();
              return;
            }
            const items = Array.from(event.currentTarget.querySelectorAll("[role=menuitem]"));
            const index = items.indexOf(document.activeElement as HTMLElement);
            const next =
              event.key === "ArrowDown"
                ? index + 1
                : event.key === "ArrowUp"
                  ? index - 1
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? -1
                      : null;
            if (next !== null) {
              event.preventDefault();
              focusItem(next);
            }
          }}
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="highlight-controls-button"
            onClick={() => {
              close();
              onCopy();
            }}
          >
            Copy
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="highlight-controls-button highlight-controls-delete"
            onClick={() => {
              close();
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
