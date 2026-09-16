// tests/unit/server/youtube-transcript.spec.ts
// Issue #35 — the fixture-driven InnerTube transcript client suite. Every
// JSON/XML fixture under youtube/fixtures/ was captured from (or synthesized
// in the exact documented shape of) the live InnerTube endpoints on
// 2026-09-16 — see youtube/fixtures/README.md for per-file provenance.
//
// Mocking mirrors the safe-fetch.spec.ts discipline: node:dns is controlled
// via vi.mock, fetch via vi.stubGlobal, and ONE recording router routes by
// URL so each test can assert the exact request surface (player/next POST
// bodies, the &fmt=srv3-stripped caption GET, and — per the no-retry
// contract — exact call counts).
//
// Posture coverage: regex-gate-before-any-request, the four structured
// refusal kinds (each distinct, terminal), srv3 stripping, srv1/srv3 parsing
// (double-escape quirk included), size/timeout guards, host pin, and calm
// chapter degradation.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { IngestionError } from "../../../server/errors";

vi.mock("node:dns", () => ({
  default: {
    promises: {
      resolve4: vi.fn(),
      resolve6: vi.fn(),
    },
  },
}));

import dns from "node:dns";
import {
  extractYouTubeVideoId,
  YouTubeTranscriptResultSchema,
} from "../../../src/ingestion/youtube";
import {
  fetchYouTubeTranscript,
  fetchYouTubeTranscriptFromUrl,
  parseCaptionXml,
  parseChaptersFromNext,
} from "../../../server/youtubeTranscript";

const resolve4Mock = dns.promises.resolve4 as unknown as ReturnType<typeof vi.fn>;
const resolve6Mock = dns.promises.resolve6 as unknown as ReturnType<typeof vi.fn>;

const FIXTURES = path.join(__dirname, "youtube", "fixtures");
const fixture = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), "utf8");

const PLAYER_OK = fixture("player.ok.dQw4w9WgXcQ.json");
const NEXT_CHAPTERS = fixture("next.chapters.aircAruvnKk.json");
const CAPTIONS_SRV1 = fixture("captions.dQw4w9WgXcQ.en.srv1.xml");
const CAPTIONS_SRV3 = fixture("captions.dQw4w9WgXcQ.en.srv3.xml");

type FetchCall = { url: string; init?: RequestInit };
type Router = (url: string, init?: RequestInit) => Promise<Response>;

let fetchCalls: FetchCall[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

/** A fake Response satisfying postInnerTube's + safeFetchCore's read surface. */
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

/** Install a router behind the recording wrapper so every test can assert
 * exact call counts (the no-retry contract) and request shapes. */
function installRouter(handler: Router): void {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    return handler(url, init);
  });
}

function jsonRouter(fixtures: { player?: string; next?: string; caption?: string }): Router {
  return async (url) => {
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
  };
}

/** The full happy-path routing: OK player, chapters next, srv1 captions. */
function routeHappyPath(): void {
  installRouter(
    jsonRouter({ player: PLAYER_OK, next: NEXT_CHAPTERS, caption: CAPTIONS_SRV1 }),
  );
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

describe("extractYouTubeVideoId (regex gate — before any request)", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=42", "dQw4w9WgXcQ"],
    ["http://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("extracts the id from %s", (url, id) => {
    expect(extractYouTubeVideoId(url)).toBe(id);
  });

  it.each([
    ["not a url at all"],
    ["ftp://youtu.be/dQw4w9WgXcQ"],
    ["https://evil.example/watch?v=dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch"],
    ["https://www.youtube.com/watch?v=short"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXc!"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ"],
    ["https://youtu.be/"],
    ["https://www.youtube.com/shorts/"],
  ])("returns null for %s", (url) => {
    expect(extractYouTubeVideoId(url)).toBeNull();
  });

  it("refuses a non-YouTube URL with server-error BEFORE any request", async () => {
    await expect(
      fetchYouTubeTranscriptFromUrl("https://example.com/article"),
    ).rejects.toMatchObject({ reason: "server-error" });
    expect(fetchCalls).toHaveLength(0);
  });

  it("refuses an invalid 11-char id with server-error BEFORE any request", async () => {
    await expect(fetchYouTubeTranscript("short")).rejects.toBeInstanceOf(IngestionError);
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("happy path — transcript + metadata + chapters (fixture-driven)", () => {
  beforeEach(routeHappyPath);

  it("fetches a captioned video end-to-end from the watch form", async () => {
    const result = await fetchYouTubeTranscriptFromUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.videoId).toBe("dQw4w9WgXcQ");
    expect(result.title).toContain("Never Gonna Give You Up");
    expect(result.channel).toBe("Rick Astley");
    expect(result.durationSeconds).toBe(213);
    expect(result.languageCode).toBe("en");
    expect(result.isAutoGenerated).toBe(false); // manual en track preferred over asr
    expect(result.segments.length).toBeGreaterThan(40);
    expect(result.chapters).toHaveLength(12);
    // Zod-at-boundary: the returned value validates against the schema.
    expect(() => YouTubeTranscriptResultSchema.parse(result)).not.toThrow();
  });

  it("parses srv1 segments with the double-escape quirk decoded", async () => {
    const result = await fetchYouTubeTranscriptFromUrl("https://youtu.be/dQw4w9WgXcQ");
    if (!result.ok) throw new Error("expected ok");
    expect(result.segments[0]).toEqual({ text: "[♪♪♪]", startMs: 1360, durationMs: 1680 });
    // srv1 double-escape: raw bytes carry &amp;#39; → one decodeEntities pass → "'".
    const apostrophe = result.segments.find((s) => s.text.includes("strangers to love"))!;
    expect(apostrophe.text).toBe("♪ We're no strangers to love ♪");
    expect(apostrophe.startMs).toBe(18_640);
  });

  it("parses the creator chapters panel with clock-to-ms starts", async () => {
    const result = await fetchYouTubeTranscript("dQw4w9WgXcQ");
    if (!result.ok) throw new Error("expected ok");
    expect(result.chapters[0]).toEqual({ title: "Introduction example", startMs: 0 });
    expect(result.chapters[1]).toEqual({ title: "Series preview", startMs: 67_000 });
    expect(result.chapters[11]).toEqual({ title: "ReLU vs Sigmoid", startMs: 1_023_000 });
  });

  it("POSTs the regex-validated videoId to the fixed InnerTube endpoints with full guards", async () => {
    await fetchYouTubeTranscriptFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    const playerCall = fetchCalls.find(
      (c) => c.url === "https://www.youtube.com/youtubei/v1/player",
    )!;
    expect(playerCall).toBeDefined();
    expect(playerCall.init?.method).toBe("POST");
    // ~30s-per-call + capped-redirects guards on the POST path too.
    expect(playerCall.init?.signal).toBeInstanceOf(AbortSignal);
    expect(playerCall.init?.redirect).toBe("error");
    const playerBody = JSON.parse(String(playerCall.init?.body));
    expect(playerBody.videoId).toBe("dQw4w9WgXcQ");
    expect(playerBody.context.client.clientName).toBe("ANDROID");
    const nextCall = fetchCalls.find(
      (c) => c.url === "https://www.youtube.com/youtubei/v1/next",
    )!;
    expect(nextCall).toBeDefined();
    const nextBody = JSON.parse(String(nextCall.init?.body));
    expect(nextBody.videoId).toBe("dQw4w9WgXcQ");
    expect(nextBody.context.client.clientName).toBe("WEB");
  });

  it("strips &fmt=srv3 from the signed caption GET and runs the full safeFetch pipeline", async () => {
    await fetchYouTubeTranscript("dQw4w9WgXcQ");
    const captionCalls = fetchCalls.filter((c) =>
      c.url.startsWith("https://www.youtube.com/api/timedtext"),
    );
    expect(captionCalls).toHaveLength(1);
    // The expected GET URL is the fixture's signed baseUrl with the srv3
    // flag removed (the youtube-transcript-api strip).
    const issuedBaseUrl = JSON.parse(PLAYER_OK).captions.playerCaptionsTracklistRenderer
      .captionTracks[0].baseUrl as string;
    expect(issuedBaseUrl).toContain("&fmt=srv3");
    expect(captionCalls[0]!.url).toBe(issuedBaseUrl.replace("&fmt=srv3", ""));
    expect(captionCalls[0]!.url).not.toContain("fmt=srv3");
    // The full pipeline ran: DNS was resolved for the caption host.
    expect(resolve4Mock).toHaveBeenCalledWith("www.youtube.com");
  });

  it("never retries — exactly one player + one next + one caption call on success", async () => {
    await fetchYouTubeTranscript("dQw4w9WgXcQ");
    expect(fetchCalls).toHaveLength(3);
  });
});

describe("the four structured refusal kinds (distinct, terminal, request-minimal)", () => {
  it.each([
    ["player.ok.no-captions.json", "no-captions"],
    ["player.error.unavailable.json", "unavailable-private"],
    ["player.login-required.age.json", "age-gated"],
    ["player.login-required.bot.json", "bot-check"],
  ])("%s → refusal %s", async (fixtureName, refusal) => {
    installRouter(jsonRouter({ player: fixture(fixtureName) }));
    const result = await fetchYouTubeTranscript("dQw4w9WgXcQ");
    expect(result).toEqual({ ok: false, refusal });
    // Terminal: no caption GET, no chapters call, no retry — one request total.
    expect(fetchCalls).toHaveLength(1);
  });

  it("maps a missing/unknown playabilityStatus to unavailable-private (never throws)", async () => {
    installRouter(jsonRouter({ player: "{}" }));
    const result = await fetchYouTubeTranscript("dQw4w9WgXcQ");
    expect(result).toEqual({ ok: false, refusal: "unavailable-private" });
  });
});

describe("guards (limits conventions: ~30s per call, ~5MB cap)", () => {
  it("refuses an oversized caption content-length BEFORE reading the body", async () => {
    installRouter(async (url) => {
      if (url === "https://www.youtube.com/youtubei/v1/player") {
        return fakeResponse({ headers: { "content-type": "application/json" }, body: PLAYER_OK });
      }
      return fakeResponse({
        url,
        headers: { "content-type": "text/xml", "content-length": String(5 * 1024 * 1024 + 1) },
        body: "",
      });
    });
    await expect(fetchYouTubeTranscript("dQw4w9WgXcQ")).rejects.toMatchObject({
      reason: "response-too-large",
    });
  });

  it("refuses an oversized unannounced caption body after read (header-lie discipline)", async () => {
    installRouter(async (url) => {
      if (url === "https://www.youtube.com/youtubei/v1/player") {
        return fakeResponse({ headers: { "content-type": "application/json" }, body: PLAYER_OK });
      }
      return fakeResponse({
        url,
        headers: { "content-type": "text/xml" },
        body: "x".repeat(5 * 1024 * 1024 + 1),
      });
    });
    await expect(fetchYouTubeTranscript("dQw4w9WgXcQ")).rejects.toMatchObject({
      reason: "response-too-large",
    });
  });

  it("refuses an oversized player response", async () => {
    installRouter(async () =>
      fakeResponse({
        headers: { "content-type": "application/json", "content-length": String(6 * 1024 * 1024) },
        body: "{}",
      }),
    );
    await expect(fetchYouTubeTranscript("dQw4w9WgXcQ")).rejects.toMatchObject({
      reason: "response-too-large",
    });
  });

  it("refuses an empty/unparseable caption body as fetch-failed (no silent garbage)", async () => {
    installRouter(async (url) => {
      if (url === "https://www.youtube.com/youtubei/v1/player") {
        return fakeResponse({ headers: { "content-type": "application/json" }, body: PLAYER_OK });
      }
      return fakeResponse({ url, headers: { "content-type": "text/xml" }, body: "" });
    });
    await expect(fetchYouTubeTranscript("dQw4w9WgXcQ")).rejects.toMatchObject({
      reason: "fetch-failed",
    });
  });

  it("refuses a caption URL aimed off the caption infrastructure (host pin)", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      if (url === "https://www.youtube.com/youtubei/v1/player") {
        const hijacked = PLAYER_OK.replace(
          /https:\/\/www\.youtube\.com\/api\/timedtext\?[^"]*/,
          "https://evil.example/steal?sig=1",
        );
        return fakeResponse({ headers: { "content-type": "application/json" }, body: hijacked });
      }
      return fakeResponse({ status: 404 });
    });
    await expect(fetchYouTubeTranscript("dQw4w9WgXcQ")).rejects.toMatchObject({
      reason: "fetch-failed",
      message: "caption-host-unexpected",
    });
    // Nothing ever touched the hijacked host: DNS resolved ONLY the constant
    // player endpoint's host (the POST guard), never evil.example, and no
    // caption GET was issued.
    expect(resolve4Mock).toHaveBeenCalledTimes(1);
    expect(resolve4Mock).toHaveBeenCalledWith("www.youtube.com");
    expect(fetchCalls).toHaveLength(1);
  });

  it("refuses a non-OK InnerTube transport failure as fetch-failed — once, no retry", async () => {
    installRouter(async () => fakeResponse({ status: 503 }));
    await expect(fetchYouTubeTranscript("dQw4w9WgXcQ")).rejects.toMatchObject({
      reason: "fetch-failed",
    });
    expect(fetchCalls).toHaveLength(1);
  });

  it("refuses a network-level failure as fetch-failed — once, no retry", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    await expect(fetchYouTubeTranscript("dQw4w9WgXcQ")).rejects.toMatchObject({
      reason: "fetch-failed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses invalid InnerTube JSON as fetch-failed", async () => {
    installRouter(async () =>
      fakeResponse({ headers: { "content-type": "text/html" }, body: "<html>bot challenge</html>" }),
    );
    await expect(fetchYouTubeTranscript("dQw4w9WgXcQ")).rejects.toMatchObject({
      reason: "fetch-failed",
    });
  });

  it("refuses an OK player response without usable videoDetails (no silent degradation)", async () => {
    installRouter(
      jsonRouter({
        player: JSON.stringify({ playabilityStatus: { status: "OK" } }),
      }),
    );
    await expect(fetchYouTubeTranscript("dQw4w9WgXcQ")).rejects.toMatchObject({
      reason: "fetch-failed",
    });
  });

  it("refuses an OK player response with a missing duration (never fabricates 0)", async () => {
    installRouter(
      jsonRouter({
        player: JSON.stringify({
          playabilityStatus: { status: "OK" },
          videoDetails: { title: "T", author: "C", lengthSeconds: "not-a-number" },
          captions: { playerCaptionsTracklistRenderer: { captionTracks: [] } },
        }),
      }),
    );
    await expect(fetchYouTubeTranscript("dQw4w9WgXcQ")).rejects.toMatchObject({
      reason: "fetch-failed",
    });
  });
});

describe("chapters are enrichment — calm degradation, never a refusal", () => {
  it("returns chapters: [] when the next call fails", async () => {
    installRouter(jsonRouter({ player: PLAYER_OK, caption: CAPTIONS_SRV1 }));
    const result = await fetchYouTubeTranscript("dQw4w9WgXcQ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.chapters).toEqual([]);
  });

  it("returns chapters: [] when the next response has no chapters panel", () => {
    expect(parseChaptersFromNext({ engagementPanels: [] })).toEqual([]);
    expect(parseChaptersFromNext({})).toEqual([]);
    expect(parseChaptersFromNext(null)).toEqual([]);
  });

  it("ignores malformed chapter items instead of fabricating entries", () => {
    const next = {
      engagementPanels: [
        {
          engagementPanelSectionListRenderer: {
            panelIdentifier: "engagement-panel-macro-markers-description-chapters",
            content: {
              macroMarkersListRenderer: {
                contents: [
                  { macroMarkersListItemRenderer: { title: { simpleText: "No clock" } } },
                  {
                    macroMarkersListItemRenderer: {
                      title: { simpleText: "Bad clock" },
                      timeDescription: { simpleText: "soon" },
                    },
                  },
                  {
                    macroMarkersListItemRenderer: {
                      title: { simpleText: "OK" },
                      timeDescription: { simpleText: "2:03:04" },
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    };
    expect(parseChaptersFromNext(next)).toEqual([{ title: "OK", startMs: 7_384_000 }]);
  });
});

describe("parseCaptionXml — both captured shapes", () => {
  it("parses the srv3 shape defensively (p elements, ms timing, markup stripped)", () => {
    const segments = parseCaptionXml(CAPTIONS_SRV3);
    expect(segments[0]).toEqual({ text: "[♪♪♪]", startMs: 1360, durationMs: 1680 });
    expect(segments.find((s) => s.text.includes("rules"))!.text).toContain("You know the rules");
    expect(segments.every((s) => !/<[^>]*>/.test(s.text))).toBe(true);
  });

  it("returns [] for an unrecognized shape (caller refuses — no garbage)", () => {
    expect(parseCaptionXml("<html>challenge</html>")).toEqual([]);
    expect(parseCaptionXml("")).toEqual([]);
  });
});
