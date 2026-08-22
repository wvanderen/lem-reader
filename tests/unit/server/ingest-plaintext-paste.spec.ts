// tests/unit/server/ingest-plaintext-paste.spec.ts
// Quick task 260821-ov7 — the plain-text paste reroute suite. Prod-confirmed
// root cause (.planning/todos/pending/2026-08-21-fix-prod-ui-paste-ingest-flow.md):
// the paste textarea receives RENDERED text (a <textarea> holds text, and
// copying an article from a browser page yields rendered text, not HTML
// source); the html branch's isProbablyReaderable pre-check refuses tag-less
// content → ingest() returned {ok:false, reason:"extraction-unsupported"} →
// the UI showed the calm "Couldn't reliably read this page." refusal for
// every plain-text paste.
//
// Suite scope: the looksLikePlainText reroute predicate + the reroute
// behavior through the REAL ingest() orchestrator with zero mocks (the
// tests/unit/server/ingest-pdf.spec.ts convention). The html-path-unchanged
// proofs live in tests/unit/server/normalization.spec.ts (full v1.0 fixture
// HTML via ingest({html}) → ok:true through the html pipeline; "<p>short</p>"
// → thin-content refusal — both inputs contain tag openers, so they are never
// rerouted; cited here, not duplicated).
//
// Locked decisions (260821-ov7-PLAN.md): D1 plain text is first-class via the
// EXISTING markdown intake; D2 server-side reroute in ONE place; D3 the title
// follows the EXISTING markdown-path D8-17 fallback (no filename → "Markdown
// document" — no new title machinery); D4 markdownToBlocks internals +
// pdf/epub/url paths untouched; D5 this suite + the existing contract specs
// are the verification (no deploy in the executor).
import { describe, expect, it } from "vitest";
import { ingest, looksLikePlainText } from "../../../server/ingest";

/** A realistic rendered-article paste: four blank-line-separated
 * multi-sentence paragraphs, zero HTML tags — exactly what a reader gets
 * when copying article text out of a browser page into the paste box. */
const PLAIN_TEXT_PASTE = [
  "Reading on a screen asks for a particular kind of patience. The page does not end; it scrolls, and the eye loses the quiet certainty of knowing where it is. A reader moving through long-form writing needs stable landmarks more than they need speed.",
  "The first comfort is a measure — a line length that lets the eye travel from the start of a line to its end without losing its place. The second is a rhythm the reader can predict: paragraphs that begin and end, pages that turn, progress that can be felt rather than guessed.",
  "Typography carries much of this weight quietly. A comfortable size, generous leading, and margins that hold the text away from the edges of the screen give the page a calm, booklike presence. When these details are right, the reader stops noticing the device and starts noticing the writing.",
  "The rest is orientation. Where am I in this essay, and how much remains? A reading surface that answers those two questions without demanding attention gives the reader permission to stay inside the text for a long time.",
].join("\n\n");

// ── The reroute predicate ────────────────────────────────────────────────────
describe("looksLikePlainText (260821-ov7 reroute predicate)", () => {
  it("tag-less multi-paragraph rendered text → true (reroutes onto the markdown intake)", () => {
    expect(
      looksLikePlainText("First paragraph.\n\nSecond paragraph.\n\nThird paragraph."),
    ).toBe(true);
  });

  it("whitespace-only content → true (reroutes; refused downstream for zero blocks — integration case 3)", () => {
    expect(looksLikePlainText("   \n\t ")).toBe(true);
  });

  it("non-tag angle brackets → true (a '<' followed by a space is prose, not markup)", () => {
    expect(looksLikePlainText("count: 5 < 6 and 6 > 5")).toBe(true);
  });

  it("an inline tag → false (stays on the byte-stable html path)", () => {
    expect(looksLikePlainText("<b>hi</b>")).toBe(false);
  });

  it("tagged paragraphs → false", () => {
    expect(looksLikePlainText("<p>para one</p><p>para two</p>")).toBe(false);
  });

  it("a full HTML document → false", () => {
    expect(looksLikePlainText("<!DOCTYPE html><html><body></body></html>")).toBe(false);
  });

  it("an HTML comment → false (the '!' opener counts as markup)", () => {
    expect(looksLikePlainText("see the <!-- note --> here")).toBe(false);
  });

  it("prose MENTIONING a tag → false (conservative boundary: when in doubt, keep the html path)", () => {
    expect(looksLikePlainText("you can use <br> in HTML")).toBe(false);
  });
});

// ── The reroute through the REAL orchestrator (no mocks) ────────────────────
describe("ingest — plain-text paste reroute (260821-ov7)", () => {
  it("admits a tag-less multi-paragraph paste as a markdown-intake article (happy path)", async () => {
    const response = await ingest({ html: PLAIN_TEXT_PASTE });

    expect(response.ok).toBe(true);
    // Two ok-variants since Phase 12 — narrow on the article key.
    if (!response.ok || !("article" in response)) {
      throw new Error("expected ok:true article envelope");
    }

    const article = response.article;
    // Blank-line-separated paragraphs → paragraph blocks only (≥ 3 keeps the
    // markdown branch's own readerability bar satisfied).
    expect(article.blocks.length).toBeGreaterThanOrEqual(3);
    expect(article.blocks.every((b) => b.kind === "paragraph")).toBe(true);
    // D8-18 content-hash id — the markdown branch's md-<hash> shape (NOT the
    // paste-<hash> shape: proves the reroute landed in the markdown branch).
    expect(article.id).toMatch(/^md-[0-9a-f]{12}$/);
    // Stage-1 metadata: the EXISTING markdown branch's channel values.
    expect(article.ingestionMeta?.source).toBe("markdown");
    expect(article.ingestionMeta?.origin).toBe("upload");
    // Locked decision 3 — the EXISTING D8-17 no-filename fallback title; no
    // new title machinery for pasted text.
    expect(article.provenance.title).toBe("Markdown document");
    // D7-08 — no source URL: "open original" stays hidden.
    expect(article.provenance.sourceUrl).toBeUndefined();
    // ING-06 — admitted articles are confident|low, never unsupported (that
    // state is refused upstream).
    expect(["confident", "low"]).toContain(response.confidence.state);
  });

  it("produces the SAME md-<content-hash> id as the .md upload of the identical text (D8-18 identity)", async () => {
    const viaPaste = await ingest({ html: PLAIN_TEXT_PASTE });
    const viaUpload = await ingest({ markdown: PLAIN_TEXT_PASTE });

    expect(viaPaste.ok).toBe(true);
    expect(viaUpload.ok).toBe(true);
    if (
      viaPaste.ok &&
      viaUpload.ok &&
      "article" in viaPaste &&
      "article" in viaUpload
    ) {
      // The same bytes through either door → ONE article (dedupe-refuse on
      // repeat — the intended save-once semantics).
      expect(viaPaste.article.id).toBe(viaUpload.article.id);
      expect(viaPaste.article.id).toMatch(/^md-[0-9a-f]{12}$/);
    }
  });

  it("whitespace-only paste still refuses honestly with extraction-unsupported (zero blocks)", async () => {
    const response = await ingest({ html: "   \n  " });
    expect(response).toEqual({ ok: false, reason: "extraction-unsupported" });
  });

  it("a single tagged fragment still refuses honestly (stays on the html path)", async () => {
    const response = await ingest({ html: "<b>hi</b>" });
    expect(response).toEqual({ ok: false, reason: "extraction-unsupported" });
  });

  it("plain text containing a non-tag angle bracket admits with paragraph blocks", async () => {
    const response = await ingest({
      html: "count: 5 < 6\n\nSecond paragraph.\n\nThird paragraph.",
    });

    expect(response.ok).toBe(true);
    if (!response.ok || !("article" in response)) {
      throw new Error("expected ok:true article envelope");
    }
    // CommonMark treats "< 6" as literal text (a "<" followed by a space
    // never opens a tag), and D8-16 escapes any residual html-ish mdast node
    // to inert text — so every block is a plain paragraph.
    expect(response.article.blocks.every((b) => b.kind === "paragraph")).toBe(true);
  });
});
