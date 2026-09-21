// tests/unit/server/ingest-transcript-paste.spec.ts
// The paste-transcript fallback end-to-end through the shared pipeline
// (pastedTranscriptToBlocks → ArticleSchema.parse → assertRoundTripAnchor →
// deriveConfidence → stamp). The branch is OFFLINE by construction — no
// fetch mock, no DNS mock: the pasted text never touches the network, which
// is exactly the point of the youtube-bot-check fallback.
//
// Pinned here: the yt-<hash> identity shared with the fetched path (a later
// successful fetch dedupe-refuses against the paste), the "pasted"
// captionSource + "low" confidence floor (never a silent upgrade to
// trusted), the no-timestamps shape (no fabricated transcript meta), and
// the exactly-one-of variant invariant.
import { describe, it, expect } from "vitest";
import { ingest } from "../../../server/ingest";
import { normalizeText } from "../../../src/content/normalizeText";

const PANEL = [
  "0:00",
  "Welcome to the lecture on calm reading interfaces",
  "0:12",
  "Today we explore stable reading positions and predictable navigation",
  "0:25",
  "Pagination keeps orientation calm for accessibility readers",
  "0:40",
  "The scrolling twin carries annotations across both modes",
  "0:55",
  "Thanks for watching this walkthrough of the reader",
].join("\n");

// The reader-provided title — REQUIRED since the no-silent-"Transcript"
// change: the request schema refuses a missing/blank one, and the pipeline
// stamps it as the canonical provenance title verbatim.
const PASTE_TITLE = "Calm Reading Interfaces Lecture";

describe("timestamped paste + YouTube URL", () => {
  it("ingests into a youtube-sourced article with pasted transcript meta", async () => {
    const response = await ingest({
      transcript: { text: PANEL, title: PASTE_TITLE, url: "https://www.youtube.com/watch?v=aircAruvnKk" },
    });
    expect(response.ok).toBe(true);
    if (!response.ok || !("article" in response)) return;
    const article = response.article;
    expect(article.ingestionMeta?.source).toBe("youtube");
    expect(article.id).toMatch(/^yt-[0-9a-f]{12}$/);
    // Canonical provenance: the watch-form URL and the READER-PROVIDED
    // title (the paste is named at ingest — never a fabricated neutral).
    expect(article.provenance.sourceUrl).toBe("https://www.youtube.com/watch?v=aircAruvnKk");
    expect(article.provenance.title).toBe(PASTE_TITLE);
    expect(article.lang).toBe("und");
    const transcript = article.ingestionMeta?.transcript;
    expect(transcript).toBeDefined();
    expect(transcript!.videoId).toBe("aircAruvnKk");
    expect(transcript!.captionSource).toBe("pasted");
    expect(transcript!.captionLanguage).toBe("und");
    expect(transcript!.durationSeconds).toBe(55);
    // Every paragraph block carries a real, ordered clock anchor.
    expect(transcript!.segments).toHaveLength(article.blocks.length);
    expect(transcript!.segments[0]).toEqual({ blockIndex: 0, startMs: 0 });
    // The pasted disclosure rides extractionWarnings (never silent).
    expect(article.ingestionMeta?.extractionWarnings.join(" ")).toContain("pasted manually");
  });

  it("stamps low confidence — a pasted transcript is never a silent upgrade to trusted", async () => {
    const response = await ingest({
      transcript: { text: PANEL, title: PASTE_TITLE, url: "https://youtu.be/aircAruvnKk" },
    });
    expect(response.ok).toBe(true);
    if (!response.ok || !("article" in response)) return;
    expect(response.article.ingestionMeta?.extractionConfidence).toBe("low");
    expect(response.confidence).toEqual({ state: "low" });
  });

  it("derives the SAME yt-<hash> id from every URL form (watch / youtu.be / shorts)", async () => {
    const watch = await ingest({
      transcript: { text: PANEL, title: PASTE_TITLE, url: "https://www.youtube.com/watch?v=aircAruvnKk" },
    });
    const shortForm = await ingest({
      transcript: { text: PANEL, title: PASTE_TITLE, url: "https://youtu.be/aircAruvnKk?t=7" },
    });
    const shorts = await ingest({
      transcript: { text: PANEL, title: PASTE_TITLE, url: "https://www.youtube.com/shorts/aircAruvnKk" },
    });
    if (!watch.ok || !("article" in watch)) return expect.unreachable();
    if (!shortForm.ok || !("article" in shortForm)) return expect.unreachable();
    if (!shorts.ok || !("article" in shorts)) return expect.unreachable();
    expect(shortForm.article.id).toBe(watch.article.id);
    expect(shorts.article.id).toBe(watch.article.id);
  });

  it("round-trips selectors over text with no timestamps in it (decision #26)", async () => {
    const response = await ingest({
      transcript: { text: PANEL, title: PASTE_TITLE, url: "https://www.youtube.com/watch?v=aircAruvnKk" },
    });
    expect(response.ok).toBe(true);
    if (!response.ok || !("article" in response)) return;
    const text = normalizeText(response.article);
    expect(text).toContain("calm reading interfaces");
    expect(text).not.toContain("0:12");
    expect(text).not.toContain("startMs");
  });
});

describe("plain-text paste (no timestamps)", () => {
  const PLAIN = [
    "A transcript pasted from somewhere without timestamps.",
    "",
    "The second paragraph talks about calm, stable reading.",
    "It continues across a couple of lines.",
  ].join("\n");

  it("with a YouTube URL keeps the yt- identity but emits NO fabricated timings", async () => {
    const response = await ingest({
      transcript: { text: PLAIN, title: PASTE_TITLE, url: "https://www.youtube.com/watch?v=aircAruvnKk" },
    });
    expect(response.ok).toBe(true);
    if (!response.ok || !("article" in response)) return;
    const article = response.article;
    expect(article.id).toMatch(/^yt-[0-9a-f]{12}$/);
    expect(article.ingestionMeta?.transcript).toBeUndefined();
    // Still low confidence + still disclosed.
    expect(article.ingestionMeta?.extractionConfidence).toBe("low");
    expect(article.ingestionMeta?.extractionWarnings.join(" ")).toContain("pasted manually");
  });

  it("without any URL it is a plain pasted article (content-hash id, no sourceUrl)", async () => {
    const response = await ingest({ transcript: { text: PLAIN, title: PASTE_TITLE } });
    expect(response.ok).toBe(true);
    if (!response.ok || !("article" in response)) return;
    const article = response.article;
    expect(article.id).toMatch(/^paste-[0-9a-f]{12}$/);
    expect(article.ingestionMeta?.source).toBe("paste");
    expect(article.ingestionMeta?.origin).toBe("paste");
    expect(article.provenance.sourceUrl).toBeUndefined();
    expect(article.provenance.title).toBe(PASTE_TITLE);
    expect(article.ingestionMeta?.transcript).toBeUndefined();
  });

  it("identical plain pastes derive the same content-hash id (dedupe by construction)", async () => {
    const one = await ingest({ transcript: { text: PLAIN, title: PASTE_TITLE } });
    const two = await ingest({ transcript: { text: PLAIN, title: PASTE_TITLE } });
    if (!one.ok || !("article" in one)) return expect.unreachable();
    if (!two.ok || !("article" in two)) return expect.unreachable();
    expect(two.article.id).toBe(one.article.id);
  });
});

describe("variant invariants", () => {
  it("refuses a multi-variant body (transcript + html) — exactly one of", async () => {
    await expect(
      // The cast is deliberate: the request schema can never produce this
      // shape; ingest()'s Stage-0 count is the programming-error guard.
      ingest({ transcript: { text: PANEL, title: PASTE_TITLE }, html: "<p>x</p>" } as never),
    ).rejects.toMatchObject({ reason: "server-error" });
  });

  it("refuses a whitespace-only paste as extraction-unsupported (never an empty article)", async () => {
    const response = await ingest({ transcript: { text: "   \n  ", title: PASTE_TITLE } });
    expect(response).toEqual({ ok: false, reason: "extraction-unsupported" });
  });
});
