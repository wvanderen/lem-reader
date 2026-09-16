// server/youtubeTranscript.ts
// Issue #35 — the minimal, hand-rolled server-side InnerTube transcript
// client. No new dependency (ADR 0002, decision source issue #27): two POSTs
// to the fixed InnerTube endpoints (`player` for metadata + caption tracks,
// WEB `next` for creator chapters) and one signed caption GET that flows
// through the FULL safeFetchCore pipeline (the D20-12 one-pipeline discipline)
// under a host-pinned caption profile.
//
// Shape of the client (modeled on the ~150-line `youtube-transcript`
// ANDROID-client approach recorded in docs/spikes/0008 §3, all shapes
// live-captured 2026-09-16 into tests/unit/server/youtube/fixtures/):
//   1. videoId regex-validated (YOUTUBE_VIDEO_ID_REGEX) BEFORE any request —
//      an unvalidated id never reaches a request body or URL.
//   2. POST player (ANDROID context) → playabilityStatus gates everything:
//      non-OK maps to one of the FOUR structured reader-facing refusal kinds
//      (no-captions / unavailable-private / age-gated / bot-check —
//      TranscriptRefusalReasonEnum in src/ingestion/youtube.ts).
//   3. OK → videoDetails (title, author, lengthSeconds) + captionTracks;
//      manual track preferred over ASR; the track's signed baseUrl is stripped
//      of `&fmt=srv3` (the youtube-transcript-api srv3-stripping move — srv3
//      is word-level XML; without the strip YouTube serves word-level markup)
//      and fetched through safeFetchCore with the caption profile below.
//   4. POST next (WEB context) → creator chapters from the
//      engagement-panel-macro-markers-description-chapters panel; chapters are
//      enrichment — a failed/degraded `next` yields [] and never fails the
//      transcript (no fabricated data, no refusal for missing enrichment).
//
// Security posture:
//   - The InnerTube POSTs target CONSTANT code-owned URLs (the videoId rides
//     the JSON body only), so there is no attacker-controlled URL surface —
//     they are guarded by per-call timeout + size caps instead of the fetch
//     pipeline (safeFetchCore is GET-shaped and takes no request body).
//   - The caption GET's URL comes from YouTube's own player response (a
//     third-party payload), so it is host-pinned to the caption infrastructure
//     (www.youtube.com / youtube.com / m.youtube.com / *.googlevideo.com)
//     BEFORE the full safeFetchCore run — the SSRF guard's DNS/IP/redirect/
//     size measures then apply as for any fetch.
//
// Posture contracts (issue #35): NO automatic retry anywhere (a refusal is
// terminal; a transport failure surfaces honestly) and NO server-side cache
// — the library is the cache (issue #27).
//
// This module is platform-agnostic /server code (D7-05 adapter boundary).
import { IngestionError } from "./errors";
import { TRANSCRIPT_MAX_BYTES, TRANSCRIPT_TIMEOUT_MS } from "./limits";
import { resolveValidatedHost, safeFetchCore, type SafeFetchProfile } from "./safeFetch";
import {
  YOUTUBE_VIDEO_ID_REGEX,
  extractYouTubeVideoId,
  YouTubeTranscriptResultSchema,
  type TranscriptChapter,
  type TranscriptRefusalReason,
  type TranscriptSegment,
  type YouTubeTranscriptResult,
} from "../src/ingestion/youtube";

// ── InnerTube endpoints + client contexts (fixed constants — never input) ────

const INNERTUBE_PLAYER_URL = "https://www.youtube.com/youtubei/v1/player";
const INNERTUBE_NEXT_URL = "https://www.youtube.com/youtubei/v1/next";

// The ANDROID client context — the docs/spikes/0008 §3 `youtube-transcript`
// lineage: player POSTs from ANDROID return full videoDetails + captionTracks
// without session bootstrap (live-verified 2026-09-16; the WEB player variant
// degraded to UNPLAYABLE from this same host on the same day).
const ANDROID_CONTEXT = {
  client: {
    clientName: "ANDROID",
    clientVersion: "20.10.38",
    androidSdkVersion: 30,
    hl: "en",
    gl: "US",
  },
};

// The WEB client context for `next` — creator chapters live in the WEB
// engagement panels; the ANDROID `next` variant returned a 14MB body with NO
// chapter renderers (live-measured 2026-09-16), blowing the 5MB cap for
// nothing. WEB next measured ~1-2MB.
const WEB_CONTEXT = {
  client: {
    clientName: "WEB",
    clientVersion: "2.20260901.00.00",
    hl: "en",
    gl: "US",
  },
};

/** Caption profile — the googlevideo.com-pinned SafeFetchProfile for the
 * signed caption GET (host pin applied by isCaptionHost BEFORE the pipeline;
 * safeFetchCore itself is never forked — D20-12). timedtext serves
 * text/xml (live-captured content-type); application/xml + text/plain cover
 * documented format variants. An HTML bot-challenge page (text/html) fails
 * the gate and refuses — calm, before any body read. */
const CAPTION_PROFILE: SafeFetchProfile = {
  allowedContentTypes: ["text/xml", "application/xml", "text/plain"],
  timeoutMs: TRANSCRIPT_TIMEOUT_MS,
  maxBytes: TRANSCRIPT_MAX_BYTES,
  bodyKind: "text",
};

/** The caption-infrastructure host pin. The caption URL is a third-party
 * payload (from the player response); anything outside YouTube's caption
 * infrastructure is refused before safeFetchCore sees it. */
function isCaptionHost(hostname: string): boolean {
  return (
    hostname === "www.youtube.com" ||
    hostname === "youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname.endsWith(".googlevideo.com")
  );
}

// ── Guarded InnerTube POST plumbing ──────────────────────────────────────────

/** asObject — the one unknown-narrowing helper for walking InnerTube's
 * untyped JSON. Every field read below goes through this (the review pass
 * collapsed ~10 hand-rolled `typeof === "object" && !== null` cascades into
 * it); undefined for anything that isn't a plain object. */
function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

/**
 * postInnerTube — one guarded POST to a CONSTANT InnerTube endpoint. Guards
 * follow the limits conventions (issue #35: ~30s per call, ~5MB cap):
 * the SAME pre-fetch host validation as the pipeline (resolveValidatedHost —
 * metadata blocklist, DNS resolve, private-IP deny-list; the AC's
 * "private/internal endpoints refused" holds for ALL outbound requests),
 * AbortSignal.timeout(TRANSCRIPT_TIMEOUT_MS), redirect refusal ("error" —
 * the InnerTube API never legitimately redirects a POST, so redirects cap
 * at zero instead of fetch's default follow), content-length pre-check
 * (Measure 7 discipline — refuse before reading the body) and a post-read
 * byte re-check (the 12-04 header-lie discipline — content-length can lie,
 * be absent, or arrive chunked). No retry: any failure throws once.
 */
async function postInnerTube(endpointUrl: string, body: unknown): Promise<unknown> {
  let hostname: string;
  try {
    hostname = new URL(endpointUrl).hostname;
  } catch {
    throw new IngestionError("fetch-failed", "innertube-url-invalid");
  }
  await resolveValidatedHost(hostname);
  let res: Response;
  try {
    res = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TRANSCRIPT_TIMEOUT_MS),
      redirect: "error",
    });
  } catch {
    // Network error, timeout, or redirect refusal — one honest transport
    // failure, never retried.
    throw new IngestionError("fetch-failed", "innertube-request-failed");
  }
  if (!res.ok) {
    throw new IngestionError("fetch-failed", `innertube-http-${res.status}`);
  }
  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > TRANSCRIPT_MAX_BYTES) {
    throw new IngestionError("response-too-large");
  }
  const text = await res.text();
  if (Buffer.byteLength(text, "utf8") > TRANSCRIPT_MAX_BYTES) {
    throw new IngestionError("response-too-large");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new IngestionError("fetch-failed", "innertube-invalid-json");
  }
}

// ── playabilityStatus → refusal-kind mapping ─────────────────────────────────

/**
 * refusalFromPlayability — map the InnerTube playabilityStatus to one of the
 * FOUR structured refusal kinds (the mapping table of docs/spikes/0008 §3):
 *   LOGIN_REQUIRED + /bot/i on the reason → "bot-check"
 *   LOGIN_REQUIRED otherwise              → "age-gated"
 *   everything else non-OK (ERROR /
 *     UNPLAYABLE / unknown / missing)     → "unavailable-private"
 *     (a removed video and a private one are indistinguishable from the
 *     reader's side; YouTube returns both shapes)
 * `status: "OK"` never reaches here. The /bot/i discriminator is the
 * reference implementation's documented behavior (youtube-transcript-api);
 * the captured fixtures + the opt-in live spec make reason-string drift
 * visible instead of silently flipping the kind.
 */
function refusalFromPlayability(playabilityStatus: unknown): TranscriptRefusalReason {
  const ps = asObject(playabilityStatus);
  if (ps?.status === "LOGIN_REQUIRED") {
    return /bot/i.test(String(ps.reason ?? "")) ? "bot-check" : "age-gated";
  }
  return "unavailable-private";
}

// ── caption XML parsing (srv1 primary, srv3 defensive) ──────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/**
 * decodeEntities — entity decoding for timedtext bodies. Applied ONCE it
 * handles both observed encoding depths correctly: srv3 bodies are
 * single-encoded ("&#39;") and decode once to "'"; srv1 bodies are
 * double-encoded server-side ("&amp;#39;" for "'") and the named→numeric
 * pass chain reproduces exactly the reference implementation's
 * xml-unescape-then-html-unescape behavior (youtube-transcript-api
 * _transcripts.py). The accepted lossy quirk (a caption whose true text
 * literally looks like an entity) is inherited from that reference.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|apos);/g, (m, name: string) => NAMED_ENTITIES[name] ?? m)
    .replace(/&#(\d+);/g, (m, dec: string) => {
      const code = Number(dec);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex: string) => {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    });
}

/** Strip residual inline markup from a segment body BEFORE entity decoding
 * (srv3 word-level `<s>` wrappers and any other machine tags — "srv3 markup
 * is stripped", issue #35). Stripping before decoding keeps genuinely
 * literal "&lt;b&gt;" text intact after decode. */
function stripInlineMarkup(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

/**
 * parseCaptionXml — timedtext XML → segments. Two machine-generated shapes
 * are handled (both live-captured 2026-09-16 into the fixture set):
 *   srv1 (primary — what the &fmt=srv3-stripped URL serves):
 *     `<transcript><text start="1.36" dur="1.68">body</text>…` (seconds)
 *   srv3 (defensive — if YouTube serves the word-level form anyway):
 *     `<timedtext format="3"><p t="1360" d="1680">body</p>…` (ms)
 * Returns [] when neither shape matches (the caller refuses — no silent
 * garbage). Parsing is deliberately regex-based over the tightly-formed
 * machine output, exactly like the reference implementations recorded in
 * docs/spikes/0008 §3; a generic XML parser adds nothing here but
 * mixed-content fragility.
 */
export function parseCaptionXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const srv1 = /<text start="(\d+(?:\.\d+)?)"(?:\s+dur="(\d+(?:\.\d+)?)")?>([\s\S]*?)<\/text>/g;
  let matched = false;
  for (const m of xml.matchAll(srv1)) {
    matched = true;
    const text = decodeEntities(stripInlineMarkup(m[3] ?? ""));
    if (text.length === 0) continue;
    segments.push({
      text,
      startMs: Math.round(Number(m[1]) * 1000),
      durationMs: Math.round(Number(m[2] ?? "0") * 1000),
    });
  }
  if (matched) return segments;
  const srv3 = /<p t="(\d+)"(?:\s+d="(\d+)")?>([\s\S]*?)<\/p>/g;
  for (const m of xml.matchAll(srv3)) {
    const text = decodeEntities(stripInlineMarkup(m[3] ?? ""));
    if (text.length === 0) continue;
    segments.push({
      text,
      startMs: Number(m[1]),
      durationMs: Number(m[2] ?? "0"),
    });
  }
  return segments;
}

// ── chapters (WEB `next` engagement panel) ───────────────────────────────────

/**
 * parseClockToMs — "0:00" / "1:07" / "1:02:03" → milliseconds; null for
 * anything else (honest absence beats a fabricated timestamp).
 */
function parseClockToMs(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const parts = raw.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;
  const [h, m, s] =
    nums.length === 3
      ? [nums[0]!, nums[1]!, nums[2]!]
      : [0, nums[0]!, nums[1]!];
  return ((h * 60 + m) * 60 + s) * 1000;
}

/**
 * parseChaptersFromNext — extract creator chapters from the WEB `next`
 * response. ONLY the description-chapters panel
 * (`engagement-panel-macro-markers-description-chapters`) counts: YouTube's
 * auto-chapters are the platform's guess, not the creator's, and honesty
 * means carrying the creator's own segmentation. Absence → [].
 */
export function parseChaptersFromNext(next: unknown): TranscriptChapter[] {
  const panels = asObject(next)?.engagementPanels;
  if (!Array.isArray(panels)) return [];
  for (const panel of panels) {
    const renderer = asObject(asObject(panel)?.engagementPanelSectionListRenderer);
    if (renderer?.panelIdentifier !== "engagement-panel-macro-markers-description-chapters") {
      continue;
    }
    const contents = asObject(asObject(renderer.content)?.macroMarkersListRenderer)?.contents;
    if (!Array.isArray(contents)) continue;
    const chapters: TranscriptChapter[] = [];
    for (const entry of contents) {
      const item = asObject(asObject(entry)?.macroMarkersListItemRenderer);
      const titleText = asObject(item?.title)?.simpleText;
      const startMs = parseClockToMs(asObject(item?.timeDescription)?.simpleText);
      if (typeof titleText === "string" && titleText.length > 0 && startMs !== null) {
        chapters.push({ title: titleText, startMs });
      }
    }
    if (chapters.length > 0) return chapters;
  }
  return [];
}

/**
 * fetchChapters — the optional WEB `next` call. Chapters are enrichment: a
 * failed or degraded call yields [] (honest absence — no fabricated data,
 * no refusal for missing enrichment). Never retried.
 */
async function fetchChapters(videoId: string): Promise<TranscriptChapter[]> {
  try {
    const next = await postInnerTube(INNERTUBE_NEXT_URL, {
      context: WEB_CONTEXT,
      videoId,
    });
    return parseChaptersFromNext(next);
  } catch {
    return [];
  }
}

// ── the client surface ───────────────────────────────────────────────────────

/**
 * fetchYouTubeTranscript — the entry point over an already-extracted videoId.
 * The id MUST be regex-valid (extractYouTubeVideoId produced it); a raw
 * non-YouTube URL is a caller dispatch error and throws server-error BEFORE
 * any request (issue #35: the videoId is regex-validated before any request).
 *
 * Returns the discriminated YouTubeTranscriptResult — ok:true with
 * transcript + metadata + chapters, or ok:false with one of the FOUR
 * structured refusal kinds. Transport failures throw IngestionError with the
 * existing honest catalog reasons (fetch-failed / response-too-large / …);
 * they are distinct from the four YouTube-state refusals. No retry, no cache.
 */
export async function fetchYouTubeTranscript(videoId: string): Promise<YouTubeTranscriptResult> {
  if (!YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
    // Caller contract violation — refuse before ANY request leaves.
    throw new IngestionError("server-error", "invalid-video-id");
  }

  // 1. player — metadata, playability gate, caption tracks.
  const player = await postInnerTube(INNERTUBE_PLAYER_URL, {
    context: ANDROID_CONTEXT,
    videoId,
  });
  const playerRecord = asObject(player);
  const playabilityStatus = playerRecord?.playabilityStatus;
  if (asObject(playabilityStatus)?.status !== "OK") {
    // Non-OK (or missing) playability is a YouTube-state refusal — terminal,
    // reader-facing, never retried and never cached.
    return { ok: false, refusal: refusalFromPlayability(playabilityStatus) };
  }

  const details = asObject(playerRecord?.videoDetails);
  const title = details?.title;
  const channel = details?.author;
  if (typeof title !== "string" || title.length === 0 || typeof channel !== "string" || channel.length === 0) {
    // An OK status without usable details is protocol garbage — honest
    // transport failure, never silently degraded.
    throw new IngestionError("fetch-failed", "player-missing-video-details");
  }
  // lengthSeconds arrives as a numeric string ("213"). A missing/non-numeric
  // duration refuses like the rest of the details (review pass: fabricating
  // a 0 would be silent garbage — honesty over tolerance).
  const durationSeconds = Number(details?.lengthSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new IngestionError("fetch-failed", "player-missing-video-details");
  }
  const safeDurationSeconds = Math.floor(durationSeconds);

  // 2. caption track selection — manual preferred over ASR (the spike §2
  // discipline), first track otherwise; deterministic.
  const captionTracks = asObject(
    asObject(playerRecord?.captions)?.playerCaptionsTracklistRenderer,
  )?.captionTracks;
  if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
    return { ok: false, refusal: "no-captions" };
  }
  const trackRecords = captionTracks
    .map(asObject)
    .filter((t): t is Record<string, unknown> => t !== undefined);
  const track = trackRecords.find((t) => t.kind !== "asr") ?? trackRecords[0];
  if (!track || typeof track.baseUrl !== "string" || !track.baseUrl.startsWith("https://")) {
    throw new IngestionError("fetch-failed", "caption-track-unusable");
  }

  // 3. srv3 strip + host pin + FULL safeFetchCore pipeline.
  // The srv3 strip is the youtube-transcript-api move (spike §2): remove the
  // word-level format flag so timedtext serves line-level srv1 XML.
  const captionUrl = track.baseUrl.replace("&fmt=srv3", "");
  let captionHostname: string;
  try {
    captionHostname = new URL(captionUrl).hostname;
  } catch {
    throw new IngestionError("fetch-failed", "caption-url-invalid");
  }
  if (!isCaptionHost(captionHostname)) {
    // The player response tried to aim the caption GET off the caption
    // infrastructure — refuse before the pipeline, like a scheme refusal.
    throw new IngestionError("fetch-failed", "caption-host-unexpected");
  }
  const captionResult = await safeFetchCore(captionUrl, CAPTION_PROFILE);
  const xml = captionResult.body as string; // "text" profile invariant
  // 12-04 header-lie discipline: the "text" profile has no post-read re-check
  // inside safeFetchCore (the document profile's observable behavior is pinned
  // byte-identical), so the profile consumer enforces it here — an unannounced
  // oversized body refuses exactly like a lying content-length would.
  if (Buffer.byteLength(xml, "utf8") > TRANSCRIPT_MAX_BYTES) {
    throw new IngestionError("response-too-large");
  }
  const segments = parseCaptionXml(xml);
  if (segments.length === 0) {
    // Empty body (expired/attestation-gated signature) or an unrecognized
    // shape — honest transport failure, never empty-but-ok garbage.
    throw new IngestionError("fetch-failed", "caption-body-unparseable");
  }

  // 4. chapters — optional enrichment, calm degradation to [].
  const chapters = await fetchChapters(videoId);

  const languageCode =
    typeof track.languageCode === "string" && track.languageCode.length > 0
      ? track.languageCode
      : "und";
  // Zod-at-boundary: the result is validated before it leaves the server
  // (the STATE-04 convention; a shape drift throws instead of shipping).
  return YouTubeTranscriptResultSchema.parse({
    ok: true,
    videoId,
    title,
    channel,
    durationSeconds: safeDurationSeconds,
    languageCode,
    isAutoGenerated: track.kind === "asr",
    segments,
    chapters,
  });
}

/**
 * fetchYouTubeTranscriptFromUrl — the URL-form entry point (issue #35 AC:
 * watch / shorts / youtu.be forms). Extracts + validates the videoId BEFORE
 * any request; a non-YouTube URL is a caller dispatch error (server-error).
 */
export async function fetchYouTubeTranscriptFromUrl(rawUrl: string): Promise<YouTubeTranscriptResult> {
  const videoId = extractYouTubeVideoId(rawUrl);
  if (videoId === null) {
    throw new IngestionError("server-error", "not-a-youtube-url");
  }
  return fetchYouTubeTranscript(videoId);
}
