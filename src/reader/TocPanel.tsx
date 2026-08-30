// src/reader/TocPanel.tsx
// Phase 18 Plan 18-02 — the non-modal table-of-contents panel (ORNT-01/03/
// 04/05). The FIRST non-dialog overlay in the codebase (D18-01 deliberately
// breaks the 5-dialog precedent): a `popover="manual"` container — top-layer
// rendering with NO native light-dismiss, NO focus trap, NO inert backdrop,
// and — critically — NO dialog semantics claimed anywhere on the surface (no
// dialog role, no modal state, no popup hint attribute; Pitfall 3 — the
// NotePopover VoiceOver blocker history forbids claiming dialog semantics on
// a non-modal surface).
//
// Ownership split (UI-SPEC §Interaction rules 1-9):
//   - THIS component: rendering the labeled nav (`h2 Contents` + `nav
//     aria-label="Table of contents"`), the nested semantic list from
//     deriveToc depth transitions, the aria-current mapping (the shared
//     sectionSpy with the "h2, h3, h4, h5, h6" selector — D18-12), the
//     honest headingless note (D18-13), open-time focus + panel-owned
//     internal scroll (D18-15), and the hand-rolled Escape routing.
//   - The PARENT (ArticleView, the tag-popover seam adapted): the controlled
//     open state (showPopover/hidePopover sync), the ONE toggle-event close
//     seam (state reset + focus restore to the trigger), the width-scoped
//     outside-click policy, and the mode-aware jump handler.
//
// Entry honesty (ORNT-04): entry text renders as React text children
// (auto-escaped — T-18-01; content is already Zod- + DOMPurify-sanitized at
// ingest), duplicates render AS-IS with identical text (D18-11), and entries
// NEVER truncate — no ellipsis, no line clamp (hidden destination text would
// be silent garbage). Activations are ALWAYS intercepted (preventDefault on
// click + Enter — Pitfall 4: the hash router never re-parses; the
// fragment-only hrefs are defense-in-depth because the shipped fragment
// guard blocks non-#/ hashes from setView).
//
// Zero motion: open/close is an instant state change (A11Y-06 / UI-SPEC
// rule 15) — no transition/animation properties on any toc-* selector.

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CanonicalArticle } from "../content/types";
import { deriveToc } from "../content/toc";
import type { TocEntry } from "../content/toc";
import { useSectionSpy } from "./sectionSpy";

/** D18-13 copy for the headingless note (UI-SPEC §Copywriting verbatim). */
const HEADINGLESS_NOTE = "This article has no headings.";

export interface TocPanelProps {
  /** The canonical article whose headings derive the TOC (render-time only). */
  article: CanonicalArticle;
  /**
   * The rendered <article> element (the shared sectionSpy scope). Null until
   * the article mounts; the spy re-runs when it transitions to non-null.
   */
  articleEl: HTMLElement | null;
  /** Controlled open state (the parent's seam syncs showPopover/hidePopover). */
  open: boolean;
  /**
   * Entry activation (click or Enter). The parent closes the panel through
   * its seam and runs the mode-aware D5-11 jump — the panel itself never
   * navigates.
   */
  onActivate: (entry: TocEntry) => void;
}

/** One rendered TOC row: the derived entry plus its nested children. */
interface TocNode {
  entry: TocEntry;
  children: TocNode[];
}

/**
 * Build the render tree from depth transitions: a deeper entry becomes a
 * child of its nearest shallower ancestor; a SKIPPED level (h2→h5) simply
 * deepens the child ul's data-depth — with NO invented intermediate entries
 * (D18-10). The Top entry and the first body entry are depth-0 siblings
 * (toc.ts's sentinel contract).
 */
function buildTocTree(entries: TocEntry[]): TocNode[] {
  const roots: TocNode[] = [];
  // stack[i].entry.depth === i — the open-ancestor chain.
  const stack: TocNode[] = [];
  for (const entry of entries) {
    const node: TocNode = { entry, children: [] };
    while (
      stack.length > 0 &&
      stack[stack.length - 1]!.entry.depth >= entry.depth
    ) {
      stack.pop();
    }
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1]!.children.push(node);
    stack.push(node);
  }
  return roots;
}

/**
 * TocPanel — the non-modal TOC surface. See the module header for the
 * ownership split against the parent's controlled seam.
 */
export const TocPanel = forwardRef<HTMLDivElement, TocPanelProps>(
  function TocPanel({ article, articleEl, open, onActivate }, ref) {
    // Derived entries are computed, never persisted (Pitfall 9 — zero
    // Dexie/schema involvement; the D-05 substrate read is render-time).
    const entries = useMemo(() => deriveToc(article), [article]);
    const tree = useMemo(() => buildTocTree(entries), [entries]);

    // aria-current mapping (D18-12): the shared spy (the SAME detection the
    // announcer consumes — selector-parameterized, never forked) reports the
    // current heading ELEMENT; its data-block-index maps to the matching
    // entry. Before any heading passes the sentinel (and on headingless
    // articles), the Top entry carries aria-current.
    const [currentBlockIndex, setCurrentBlockIndex] = useState<number | null>(
      null,
    );
    useSectionSpy({
      articleEl,
      selector: "h2, h3, h4, h5, h6",
      onCurrent: (heading) => {
        const idx = Number(heading.dataset.blockIndex);
        if (Number.isFinite(idx)) setCurrentBlockIndex(idx);
      },
    });
    const currentKey = entries.some((e) => e.blockIndex === currentBlockIndex)
      ? (currentBlockIndex as number)
      : // Above the first heading (or no heading passed yet): Top is current.
        -1;

    // Internal ref for the panel element (Escape routing + open-focus +
    // open-scroll). Merged with the parent's forwarded ref so the parent's
    // seam can drive showPopover/hidePopover + the toggle listener.
    const panelRef = useRef<HTMLDivElement | null>(null);
    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        panelRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref)
          (ref as React.MutableRefObject<HTMLDivElement | null>).current =
            node;
      },
      [ref],
    );

    // Open behavior (UI-SPEC rules 9-10, D18-15): focus moves to the
    // aria-current entry (or the first entry), and the panel scrolls
    // INTERNALLY to bring that entry toward vertical center. The rAF defers
    // one frame so the parent's showPopover() commit (parent effects run
    // after child effects in the same commit) lands first — the entries are
    // focusable once the popover is in the top layer.
    //
    // D18-15: the scroll is offsetTop/scrollTop arithmetic on the panel
    // element ONLY — the element method that scrolls ANCESTORS is forbidden
    // here; opening the panel must never produce page-level scroll
    // side effects.
    useEffect(() => {
      if (!open) return;
      const rafId = requestAnimationFrame(() => {
        const panel = panelRef.current;
        if (!panel) return;
        const target =
          panel.querySelector<HTMLElement>('[aria-current="true"]') ??
          panel.querySelector<HTMLElement>("a");
        if (!target) return;
        target.focus();
        panel.scrollTop = Math.max(
          0,
          target.offsetTop - (panel.clientHeight - target.offsetHeight) / 2,
        );
      });
      return () => cancelAnimationFrame(rafId);
    }, [open]);

    // Manual Esc (UI-SPEC rule 3 — the ONLY hand-rolled key handling this
    // phase): popover="manual" gets no native light dismiss, so Escape is
    // routed through hidePopover() — every close path funnels into the
    // parent's ONE toggle-event seam (state reset + focus restore).
    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
          event.preventDefault();
          panelRef.current?.hidePopover();
        }
      },
      [],
    );

    /** One entry link — intercepted activation, aria-current token "true". */
    const renderEntry = (entry: TocEntry) => (
      <a
        href={`#toc-${entry.blockIndex}`}
        aria-current={entry.blockIndex === currentKey ? "true" : undefined}
        onClick={(event) => {
          // Link semantics without router side effects (Pitfall 4). The
          // fragment-only href never parses — activation is always ours.
          event.preventDefault();
          onActivate(entry);
        }}
        onKeyDown={(event) => {
          // Enter interception: preventing default on keydown suppresses the
          // browser's synthesized click, so exactly ONE activation fires.
          if (event.key === "Enter") {
            event.preventDefault();
            onActivate(entry);
          }
        }}
      >
        {entry.text}
      </a>
    );

    /** The nested ul list. Each li carries its entry's depth as data-depth —
     *  the per-depth indent hook (a skipped level indents deeper than a
     *  direct child, and mixed-depth siblings under one parent — h2→h5 then
     *  h3 — each get their exact depth; a single ul-level indent cannot
     *  express that). */
    const renderList = (nodes: TocNode[]): React.ReactNode => (
      <ul className="toc-list">
        {nodes.map((node) => (
          <li key={node.entry.blockIndex} data-depth={node.entry.depth}>
            {renderEntry(node.entry)}
            {node.children.length > 0 && renderList(node.children)}
          </li>
        ))}
      </ul>
    );

    return (
      <div
        ref={setRefs}
        popover="manual"
        className="toc-panel"
        onKeyDown={handleKeyDown}
      >
        <h2 className="toc-title">Contents</h2>
        {/* D18-13: the headingless article IS the empty state — the honest
            note below the title, same chrome, never a refusal. */}
        {entries.length === 1 && (
          <p className="toc-empty">{HEADINGLESS_NOTE}</p>
        )}
        <nav aria-label="Table of contents">{renderList(tree)}</nav>
      </div>
    );
  },
);
