import "@testing-library/jest-dom/vitest";

// jsdom does NOT implement IntersectionObserver (used by SectionAnnouncer in
// Plan 02-03). Polyfill a minimal stub so component tests that render
// ArticleView (which mounts SectionAnnouncer) don't crash. The stub records
// observed elements but never fires callbacks — the actual scroll-spy
// behavior is proven by tests/e2e/section-announce.spec.ts in real browsers
// (Pitfall 2 — jsdom is not authoritative for layout/intersection).
if (typeof globalThis.IntersectionObserver === "undefined") {
  class IntersectionObserverStub {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = "";
    readonly thresholds: ReadonlyArray<number> = [];
    private elements: Set<Element> = new Set();
    observe(el: Element) {
      this.elements.add(el);
    }
    unobserve(el: Element) {
      this.elements.delete(el);
    }
    disconnect() {
      this.elements.clear();
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  globalThis.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver;
}

// jsdom does NOT implement requestAnimationFrame either in some versions.
// Polyfill to ensure SectionAnnouncer's rAF-throttled scroll handler works.
if (typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    return setTimeout(() => cb(Date.now()), 16) as unknown as number;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => {
    clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
  }) as typeof cancelAnimationFrame;
}

// jsdom does NOT implement ResizeObserver (introduced in Phase 3 by
// src/measurement/triggers.ts). Polyfill a minimal stub so component tests
// that render ArticleView (which mounts useMeasurement → TriggerCoalescer)
// don't crash. The stub records observed elements but never fires callbacks
// — the actual measurement behavior is proven by tests/e2e/measurement/*
// in real browsers (Pitfall 2 — jsdom is not authoritative for layout).
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    private elements: Set<Element> = new Set();
    observe(el: Element) {
      this.elements.add(el);
    }
    unobserve(el: Element) {
      this.elements.delete(el);
    }
    disconnect() {
      this.elements.clear();
    }
  }
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom's document.fonts implementation is a stub FontFaceSet whose
// `loadingdone` event never fires. Phase 3's TriggerCoalescer registers a
// listener via addEventListener — defend against the event target not
// existing by leaving the registration in place (the stub accepts the call
// silently; real browsers deliver the event). No polyfill needed beyond
// jsdom's default FontFaceSet; this comment documents the contract.
