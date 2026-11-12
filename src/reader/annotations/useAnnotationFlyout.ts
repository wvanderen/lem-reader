import { useLayoutEffect, type RefObject } from "react";
import { currentViewportRect, NOTE_EDITOR_EDGE_GUTTER } from "./notePlacement";
import { effectiveZoom } from "./anchorPosition";

/** A descendant of the modal in the native top layer: no panel reflow or clipping. */
export function useAnnotationFlyout(
  open: boolean,
  trigger: RefObject<HTMLElement | null>,
  surface: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    const element = surface.current;
    const button = trigger.current;
    if (!open || !element || !button || !element.showPopover) return;
    element.showPopover();
    const place = () => {
      const viewport = currentViewportRect();
      const edge = NOTE_EDITOR_EDGE_GUTTER;
      const zoom = effectiveZoom();
      element.style.maxHeight = `${Math.max(0, viewport.height - 2 * edge) / zoom}px`;
      element.style.maxWidth = `${Math.max(0, viewport.width - 2 * edge) / zoom}px`;
      const anchor = button.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const panel = button.closest("dialog");
      const controls = panel?.querySelector(".annotation-panel-organization");
      // Never cover the slot row or footer. Prefer the space above those
      // controls (over writing if necessary), otherwise below the panel.
      // Cap and scroll the flyout on its chosen side instead of clamping a
      // growing tag editor across Done or its own trigger.
      const protectedTop = Math.min(
        anchor.top,
        controls?.getBoundingClientRect().top ?? anchor.top,
      );
      const panelBottom = panel?.getBoundingClientRect().bottom ?? anchor.bottom;
      const aboveSpace = Math.max(0, protectedTop - viewport.top - 2 * edge);
      const belowSpace = Math.max(0, viewport.top + viewport.height - panelBottom - 2 * edge);
      const above = box.height <= aboveSpace || aboveSpace >= belowSpace;
      element.style.maxHeight = `${(above ? aboveSpace : belowSpace) / zoom}px`;
      const height = element.getBoundingClientRect().height;
      const top = above ? protectedTop - edge - height : panelBottom + edge;
      element.style.left = `${Math.max(viewport.left + edge, Math.min(anchor.right - box.width, viewport.left + viewport.width - edge - box.width)) / zoom}px`;
      element.style.top = `${Math.max(viewport.top + edge, top) / zoom}px`;
    };
    place();
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        place();
      });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    observer.observe(button);
    element.querySelectorAll(".tag-entry").forEach((child) => observer.observe(child));
    const panel = button.closest("dialog");
    const panelObserver = new MutationObserver(schedule);
    if (panel) panelObserver.observe(panel, { attributes: true, attributeFilter: ["style"] });
    panel?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      observer.disconnect();
      panelObserver.disconnect();
      panel?.removeEventListener("scroll", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      element.hidePopover();
    };
  }, [open, trigger, surface]);
}
