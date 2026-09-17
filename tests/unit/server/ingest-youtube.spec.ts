// tests/unit/server/ingest-youtube.spec.ts
// Issue #39 — the ingest orchestrator's YouTube branch, end-to-end through
// the shared pipeline (transcript fetch → transcriptToBlocks →
// ArticleSchema.parse → assertRoundTripAnchor → deriveConfidence → stamp).
//
// Mocking mirrors tests/unit/server/youtube-transcript.spec.ts: node:dns via
// vi.mock, fetch via vi.stubGlobal, ONE recording router serving the captured
// fixtures under youtube/fixtures/. The four YouTube-state refusals, the
// ingestionMeta.transcript shape, the videoId-derived id stability across URL
// forms, and the ASR → "low" confidence floor (decision #26 — never a silent
// upgrade to trusted) are all pinned here.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ingest } from "../../../server/ingest";
import { normalizeText } from "../../../src/content/normalizeText";

vi.mock("node:dns", () => ({
  default: {
    promises: {
      resolve4: vi.fn(),
      resolve6: vi.fn(),
    },
  },
}));

import dns from "node:dns";

const resolve4Mock = dns.promises.resolve4 as unknown as ReturnType<typeof vi.fn>;
const resolve6Mock = dns.promises.resolve6 as unknown as ReturnType<typeof vi.fn>;

const FIXTURES = path.join(__dirname, "youtube", "fixtures");
const fixture = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), "utf8");

const PLAYER_OK = fixture("player.ok.dQw4w9WgXcQ.json");
const CAPTIONS_SRV1 = fixture("captions.dQw4w9WgXcQ.en.srv1.xml");

// The captured rickroll caption body is REAL lyric text whose chorus repeats
// verbatim — the ingest round-trip anchor gate honestly refuses it
// (round-trip-anchor-failed; decision #26 accepts exactly this for repetitive
// ASR text, no special-casing). The happy-path specs below therefore serve a
// SYNTHESIZED caption body with unique cue text (still the srv1 shape the
// client parses), keeping the real captured player/next envelope shapes.
const CUES: string[] = Array.from({ length: 40 }, (_, i) => {
  const words = [
    "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel",
    "india", "juliett", "kilo", "lima", "mike", "november", "oscar", "papa",
  ];
  const shifted = words.slice(i % words.length).concat(words.slice(0, i % words.length));
  return `cue ${String(i).padStart(3, "0")} ${shifted.join(" ")} drifts ${i * 7} units apart`;
});

function srv1Xml(cues: string[]): string {
  return `<transcript>${cues
    .map((text, i) => `<text start="${i}.36" dur="1.0">${text}</text>`)
    .join("")}</transcript>`;
}

function nextWithChapters(chapters: { title: string; clock: string }[]): string {
  return JSON.stringify({
    engagementPanels: [
      {
        engagementPanelSectionListRenderer: {
          panelIdentifier: "engagement-panel-macro-markers-description-chapters",
          content: {
            macroMarkersListRenderer: {
              contents: chapters.map((c) => ({
                macroMarkersListItemRenderer: {
                  title: { simpleText: c.title },
                  timeDescription: { simpleText: c.clock },
                },
              })),
            },
          },
        },
      },
    ],
  });
}

/** The happy-path chapter set — within the synthetic transcript's 40s span so
 * every chapter lands inside the caption range (rule 5 drops only true
 * beyond-the-end markers). "Chapter Zero" deliberately does NOT restate the
 * video title, so rule 3 keeps it. */
const CHAPTERS = [
  { title: "Chapter Zero", clock: "0:00" },
  { title: "Middle Mark", clock: "0:15" },
  { title: "Tail Section", clock: "0:30" },
];

type FetchCall = { url: string; init?: RequestInit };

let fetchCalls: FetchCall[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

function fakeResponse(opts: {
  status?: number;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
}): Response {
  const status = opts.status ?? 200;
  return {
    status,
    ok: status >= 200 && status < 300,
    url: opts.url ?? "https://www.youtube.com/unused",
    headers: new Headers(opts.headers ?? {}),
    text: async () => opts.body ?? "",
  } as Response;
}

function installRouter(fixtures: {
  player?: string;
  next?: string;
  caption?: string;
}): void {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    if (url === "https://www.youtube.com/youtubei/v1/player") {
      return fakeResponse({
        headers: { "content-type": "application/json" },
        body: fixtures.player ?? "{}",
      });
    }
    if (url === "https://www.youtube.com/youtubei/v1/next") {
      if (fixtures.next === undefined) throw new Error("next blew up");
      return fakeResponse({
        headers: { "content-type": "application/json" },
        body: fixtures.next,
      });
    }
    if (url.startsWith("https://www.youtube.com/api/timedtext")) {
      return fakeResponse({
        url,
        headers: { "content-type": "text/xml; charset=UTF-8" },
        body: fixtures.caption ?? CAPTIONS_SRV1,
      });
    }
    return fakeResponse({ status: 404 });
  });
}

/** playerWithTracks — a player fixture whose captionTracks are narrowed to
 * the given filter (used to force the ASR-only selection deterministically). */
function playerWithTracks(predicate: (track: { kind?: string }) => boolean): string {
  const player = JSON.parse(PLAYER_OK) as {
    captions: { playerCaptionsTracklistRenderer: { captionTracks: { kind?: string }[] } };
  };
  player.captions.playerCaptionsTracklistRenderer.captionTracks =
    player.captions.playerCaptionsTracklistRenderer.captionTracks.filter(predicate);
  return JSON.stringify(player);
}

beforeEach(() => {
  resolve4Mock.mockReset();
  resolve6Mock.mockReset();
  resolve4Mock.mockResolvedValue(["142.250.185.78"]);
  resolve6Mock.mockResolvedValue([]);
  fetchCalls = [];
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("happy path — manual caption track (fixture-driven)", () => {
  beforeEach(() =>
    installRouter({
      player: PLAYER_OK,
      next: nextWithChapters(CHAPTERS),
      caption: srv1Xml(CUES),
    }),
  );

  it("ingests a watch-form URL into a youtube-sourced article through the shared pipeline", async () => {
    const response = await ingest({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(response.ok).toBe(true);
    if (!response.ok || !("article" in response)) return;
    const article = response.article;
    expect(article.ingestionMeta?.source).toBe("youtube");
    expect(article.id).toMatch(/^yt-[0-9a-f]{12}$/);
    expect(article.provenance.sourceUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(article.provenance.title).toContain("Never Gonna Give You Up");
    expect(article.provenance.author).toBe("Rick Astley");
    // Decision #26 — article.lang is the track languageCode's BASE language.
    expect(article.lang).toBe("en");
    // Blocks exist, chapters became h2 boundaries, and only
    // paragraph/heading kinds ever reach the reading surface.
    expect(article.blocks.length).toBeGreaterThan(10);
    expect(article.blocks.some((b) => b.kind === "heading" && b.level === 2)).toBe(true);
    expect(article.blocks.every((b) => b.kind === "paragraph" || b.kind === "heading")).toBe(true);
  });

  it("stores the block-keyed transcript metadata at the boundary (decision #26 shape)", async () => {
    const response = await ingest({ url: "https://youtu.be/dQw4w9WgXcQ" });
    expect(response.ok).toBe(true);
    if (!response.ok || !("article" in response)) return;
    const meta = response.article.ingestionMeta;
    const transcript = meta?.transcript;
    expect(transcript).toBeDefined();
    expect(transcript!.videoId).toBe("dQw4w9WgXcQ");
    expect(transcript!.durationSeconds).toBe(213);
    expect(transcript!.captionSource).toBe("manual");
    expect(transcript!.captionLanguage).toBe("en");
    // Every timestamped block — paragraphs AND chapter h2s — has an anchor.
    expect(transcript!.segments).toHaveLength(response.article.blocks.length);
    for (let i = 0; i < transcript!.segments.length; i += 1) {
      expect(transcript!.segments[i]!.blockIndex).toBe(i);
      expect(transcript!.segments[i]!.startMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("derives the same yt-<hash> id from every URL form (watch / shorts / youtu.be)", async () => {
    const watch = await ingest({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    const youtuBe = await ingest({ url: "https://youtu.be/dQw4w9WgXcQ?t=42" });
    const shorts = await ingest({ url: "https://www.youtube.com/shorts/dQw4w9WgXcQ" });
    if (!watch.ok || !("article" in watch)) return expect.unreachable();
    if (!youtuBe.ok || !("article" in youtuBe)) return expect.unreachable();
    if (!shorts.ok || !("article" in shorts)) return expect.unreachable();
    expect(youtuBe.article.id).toBe(watch.article.id);
    expect(shorts.article.id).toBe(watch.article.id);
  });

  it("round-trips TextQuoteSelectors over the transcript text (the SC#1 gate passed)", async () => {
    const response = await ingest({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(response.ok).toBe(true);
    if (!response.ok || !("article" in response)) return;
    // assertRoundTripAnchor already gated ingest admission; here we assert
    // the timestamps never entered the normalized text at all (nothing
    // timestamp-bearing reaches the reading surface — decision #26).
    const text = normalizeText(response.article);
    expect(text).not.toContain("startMs");
    expect(text).not.toContain("blockIndex");
  });

  it("carries no asset envelopes (the transcript branch is text-only)", async () => {
    const response = await ingest({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(response.ok).toBe(true);
    if (!response.ok || !("article" in response)) return;
    expect(response.assets).toEqual([]);
  });
});

describe("ASR-only track — extractionConfidence stays low (decision #26)", () => {
  beforeEach(() =>
    installRouter({
      player: playerWithTracks((t) => t.kind === "asr"),
      next: nextWithChapters(CHAPTERS),
      caption: srv1Xml(CUES),
    }),
  );

  it("stamps asr captionSource + low confidence — never a silent upgrade to trusted", async () => {
    const response = await ingest({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(response.ok).toBe(true);
    if (!response.ok || !("article" in response)) return;
    expect(response.article.ingestionMeta?.transcript?.captionSource).toBe("asr");
    // The rickroll transcript is long/dense enough to read "confident" on the
    // ING-06 formula — the ASR floor must override exactly that case.
    expect(response.article.ingestionMeta?.extractionConfidence).toBe("low");
    expect(response.confidence).toEqual({ state: "low" });
  });
});

describe("the four YouTube-state refusals map to cataloged reasons", () => {
  it.each([
    ["player.ok.no-captions.json", "youtube-no-captions"],
    ["player.error.unavailable.json", "youtube-unavailable-private"],
    ["player.login-required.age.json", "youtube-age-gated"],
    ["player.login-required.bot.json", "youtube-bot-check"],
  ])("%s → %s (terminal, no chapters call, no retry)", async (playerFixture, reason) => {
    installRouter({ player: fixture(playerFixture) });
    const response = await ingest({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(response).toEqual({ ok: false, reason });
    // One player POST total — the refusal is terminal (no caption GET, no
    // next call, no retry).
    expect(fetchCalls).toHaveLength(1);
  });
});

describe("dispatch — only real YouTube URLs take the transcript branch", () => {
  it("routes a non-YouTube URL to the HTML pipeline (no InnerTube traffic)", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      return fakeResponse({ status: 500 });
    });
    const response = await ingest({ url: "https://example.com/article" });
    expect(response.ok).toBe(false);
    expect(fetchCalls.every((c) => c.url === "https://example.com/article")).toBe(true);
    expect(
      fetchCalls.some((c) => c.url.startsWith("https://www.youtube.com/youtubei")),
    ).toBe(false);
  });

  it("routes a youtube-host URL WITHOUT a valid id to the HTML pipeline (embed form)", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      return fakeResponse({ status: 500 });
    });
    await ingest({ url: "https://www.youtube.com/embed/dQw4w9WgXcQ" });
    expect(
      fetchCalls.some((c) => c.url.startsWith("https://www.youtube.com/youtubei")),
    ).toBe(false);
  });
});
