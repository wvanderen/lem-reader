// server/parseFeed.ts
// Issue #121 — the RSS/Atom feed parser for the Discover subscription
// candidate. The sixth intake shape of the ingestion pipeline: it does NOT
// produce articles — it produces the bounded FeedPreview (feed name +
// recent-item previews) the Discover surface shows and the subscription
// persists as its local cache.
//
// Decision lineage (mirroring the established intake disciplines):
//   - fast-xml-parser, ONE hardened factory (the createEpubXmlParser
//     precedent — D12-14): processEntities:false + maxNestedTags + the
//     parser's dangerous-property guard + a DTD-with-ENTITY refusal + the
//     whole-parse try envelope → calm `feed-unreadable`.
//   - Bounded output by construction: items are sliced to MAX_FEED_ITEMS,
//     every text field truncated to MAX_FEED_TEXT_CHARS (the record schemas
//     in src/content/schema enforce the same bounds at every later read —
//     the server truncates, the schema refuses, defense-in-depth).
//   - Honesty: `datePublished` rides ONLY when the feed's date actually
//     parses; link/image ride ONLY when they validate as http(s) URLs (the
//     httpUrl refinement — a `javascript:` href can never reach a rendered
//     anchor); an item with no title is skipped (a preview needs a title);
//     an untitled channel falls back to the hostname (the article title
//     chain's hostname fallback); a non-feed XML (or HTML) payload refuses
//     `feed-unreadable` rather than fabricating a feed.
//
// Threat register (T-12-04/T-12-06/T-12-08 applied to feeds):
//   - Billion-laughs / entity expansion → declaresEntities refusal BEFORE
//     the parse + processEntities:false (entities stay literal through the
//     parse; the bounded decode step after it handles the common named +
//     numeric references on already-extracted, length-bounded strings).
//   - Prototype pollution → fast-xml-parser's dangerous-property guard
//     throws on __proto__-shaped keys; the try envelope lands it on
//     feed-unreadable.
//   - Hostile nesting → maxNestedTags caps the parse depth.
//
// Server-only: fast-xml-parser stays behind /server imports (the
// epubToBooks discipline — the client bundle does not grow).
import { XMLParser } from "fast-xml-parser";
import type { FeedItemPreview } from "../src/content/schema";
import { IngestionError } from "./errors";
import { MAX_FEED_ITEMS, MAX_FEED_TEXT_CHARS } from "./limits";

/** The bounded, display-ready feed shape parseFeedXml returns. */
export interface ParsedFeed {
  title: string;
  description?: string;
  items: FeedItemPreview[];
}

/** Repeatable elements forced to arrays (the ARRAY_ELEMENTS discipline — a
 * single <item> otherwise parses as a bare object and every consumer would
 * need per-callshape handling). */
const ARRAY_ELEMENTS = new Set(["item", "entry"]);

/** The ONE hardened parser configuration for feed XML (the
 * createEpubXmlParser twin — same knobs, feed-shaped isArray). */
function createFeedXmlParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    processEntities: false,
    maxNestedTags: 40,
    isArray: (name) => ARRAY_ELEMENTS.has(name),
  });
}

const feedXmlParser = createFeedXmlParser();

/** Entity-declaring DTD detection — the strong form of the entity-expansion
 * guard, byte-identical to the epubToBooks precedent (T-12-04: the threat
 * is the ENTITY declaration itself; bare and external-only DOCTYPEs declare
 * nothing to expand and stay inert under processEntities:false). */
function declaresEntities(text: string): boolean {
  const m = /<!DOCTYPE[^>]*\[([\s\S]*?)\]>/i.exec(text);
  return m !== null && /<!ENTITY/i.test(m[1]!);
}

/** The bounded named-entity table for the post-parse decode step. Entities
 * outside this table stay literal — never guessed. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
};

/** decodeEntities — decode the bounded named set + numeric character
 * references on EXTRACTED strings (length-bounded by the truncation that
 * follows). Unknown named entities stay literal (honesty — never guess). */
function decodeEntities(text: string): string {
  return text.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.charAt(0) === "#") {
      const hex = body.charAt(1) === "x" || body.charAt(1) === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff) {
        return String.fromCodePoint(code);
      }
      return "";
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/** Collapse a candidate text value to a plain bounded string. Feed values
 * arrive as string, {@_attrs, "#text"}, or exotic objects; anything without
 * usable text content is undefined. */
function textOf(value: unknown): string | undefined {
  let raw: string | undefined;
  if (typeof value === "string") {
    raw = value;
  } else if (typeof value === "number" || typeof value === "boolean") {
    raw = String(value);
  } else if (isRecord(value) && typeof value["#text"] === "string") {
    raw = value["#text"];
  }
  if (raw === undefined) return undefined;
  const collapsed = decodeEntities(raw).replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return undefined;
  return collapsed.slice(0, MAX_FEED_TEXT_CHARS);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

/** isHttpUrl — http/https only (the httpUrl refinement, checked before an
 * item URL is ever attached; the schema re-refines at every read). */
function isHttpUrl(candidate: string): boolean {
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** firstHttpUrl — the first http(s) URL among candidate strings. */
function firstHttpUrl(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && isHttpUrl(candidate.trim())) {
      return candidate.trim();
    }
  }
  return undefined;
}

/** stripToExcerpt — turn a feed description/summary/content value (often
 * full HTML) into a bounded plain-text excerpt: tags dropped, entities
 * decoded, whitespace collapsed. Never rendered as HTML downstream
 * (React text children — the T-16-06 discipline). */
function stripToExcerpt(value: unknown): string | undefined {
  const raw = textOf(value);
  if (raw === undefined) return undefined;
  const stripped = decodeEntities(raw.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length === 0) return undefined;
  return stripped.slice(0, MAX_FEED_TEXT_CHARS);
}

/** toDateIso — the feed's date ONLY when it actually parses (honesty:
 * "date when supplied"); RFC-822 pubDates and ISO-8601 Atom stamps both
 * land here, garbage yields undefined. */
function toDateIso(value: unknown): string | undefined {
  const raw = textOf(value);
  if (raw === undefined) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

/** resolveRssLink — an RSS item's link: the plain <link> text, or (when the
 * feed embeds an atom:link) the @_href attribute. */
function resolveRssLink(item: Record<string, unknown>): string | undefined {
  const link = item["link"];
  if (typeof link === "string") {
    return firstHttpUrl(link);
  }
  if (isRecord(link)) {
    return firstHttpUrl(link["@_href"], link["#text"]);
  }
  return undefined;
}

/** resolveAtomLink — an Atom entry's link: prefer rel="alternate" (or
 * rel-less), then the first link at all. */
function resolveAtomLink(entry: Record<string, unknown>): string | undefined {
  const links = asArray(entry["link"]);
  const hrefs: string[] = [];
  let fallback: string | undefined;
  for (const link of links) {
    if (!isRecord(link)) continue;
    const href = typeof link["@_href"] === "string" ? link["@_href"] : undefined;
    if (href === undefined || !isHttpUrl(href.trim())) continue;
    const rel = typeof link["@_rel"] === "string" ? link["@_rel"] : undefined;
    if (rel === undefined || rel === "alternate") {
      hrefs.push(href.trim());
    } else if (fallback === undefined) {
      fallback = href.trim();
    }
  }
  return hrefs[0] ?? fallback;
}

/** resolveItemImage — the optional preview image: an image-typed enclosure,
 * then a media:thumbnail URL (removeNSPrefix collapses media: → the local
 * name). Non-http(s) or non-image candidates never attach. */
function resolveItemImage(item: Record<string, unknown>): string | undefined {
  const enclosure = item["enclosure"];
  for (const candidate of asArray(enclosure)) {
    if (!isRecord(candidate)) continue;
    const url = typeof candidate["@_url"] === "string" ? candidate["@_url"] : undefined;
    const type = typeof candidate["@_type"] === "string" ? candidate["@_type"] : undefined;
    if (url !== undefined && (type === undefined || type.startsWith("image/"))) {
      const resolved = firstHttpUrl(url);
      if (resolved !== undefined) return resolved;
    }
  }
  const thumbnail = item["thumbnail"];
  for (const candidate of asArray(thumbnail)) {
    if (!isRecord(candidate)) continue;
    const url = typeof candidate["@_url"] === "string" ? candidate["@_url"] : undefined;
    if (url !== undefined) {
      const resolved = firstHttpUrl(url);
      if (resolved !== undefined) return resolved;
    }
  }
  return undefined;
}

/** toPreview — one admitted item → the bounded FeedItemPreview, or null when
 * the item has no title (a preview without a title is not previewable —
 * skipped, never fabricated). `excerptKeys` is the feed-shape's ordered
 * excerpt sources (RSS description → content:encoded; Atom summary →
 * content), derived ONCE per feed by the caller. */
function toPreview(
  item: Record<string, unknown>,
  excerptKeys: string[],
  isAtom: boolean,
): FeedItemPreview | null {
  const title = textOf(item["title"]);
  if (title === undefined) return null;
  const link = isAtom ? resolveAtomLink(item) : resolveRssLink(item);
  const dateRaw = isAtom
    ? (item["published"] ?? item["updated"])
    : (item["pubDate"] ?? item["date"]);
  const datePublished = toDateIso(dateRaw);
  let excerpt: string | undefined;
  for (const key of excerptKeys) {
    excerpt = stripToExcerpt(item[key]);
    if (excerpt !== undefined) break;
  }
  const image = resolveItemImage(item);
  return {
    title,
    ...(link !== undefined ? { link } : {}),
    ...(datePublished !== undefined ? { datePublished } : {}),
    ...(excerpt !== undefined ? { excerpt } : {}),
    ...(image !== undefined ? { image } : {}),
  };
}

/**
 * parseFeedXml — parse fetched feed XML into the bounded ParsedFeed.
 * Recognizes RSS 2.0 (rss.channel.item) and Atom (feed.entry); anything
 * else — malformed XML, hostile DTDs, non-feed XML (including an HTML
 * challenge page that slipped a text/xml header) — refuses
 * `feed-unreadable`. A STRUCTURALLY VALID feed with zero items is accepted
 * with an empty items array (the Discover surface renders its honest
 * no-recent-items line) — the refusal is for payloads with no recognizable
 * feed shape, not for quiet feeds. `fallbackTitle` is the hostname the
 * caller derived from the final URL (the article title chain's hostname
 * fallback) for channels that ship no title.
 */
export function parseFeedXml(text: string, fallbackTitle: string): ParsedFeed {
  if (declaresEntities(text)) {
    throw new IngestionError(
      "feed-unreadable",
      "This feed contains a document-type declaration that the reader does not accept.",
    );
  }
  let root: unknown;
  try {
    root = feedXmlParser.parse(text, true);
  } catch {
    throw new IngestionError(
      "feed-unreadable",
      "This feed contains XML that could not be read — it may be corrupt.",
    );
  }
  if (!isRecord(root)) {
    throw new IngestionError("feed-unreadable", "This feed is not an RSS or Atom document.");
  }

  // Recognize the feed structure. RSS 2.0: rss → channel. Atom: feed.
  const channel =
    isRecord(root["rss"]) && isRecord(root["rss"]["channel"]) ? root["rss"]["channel"] : undefined;
  const atomFeed = isRecord(root["feed"]) ? root["feed"] : undefined;
  if (channel === undefined && atomFeed === undefined) {
    throw new IngestionError("feed-unreadable", "This address is not an RSS or Atom feed.");
  }

  const isAtom = atomFeed !== undefined;
  const source = isAtom ? atomFeed! : channel!;
  const rawItems = asArray(source["item"]).concat(isAtom ? asArray(source["entry"]) : []);
  // The channel/feed name, falling back to the caller's hostname fallback
  // (the article title chain's hostname step).
  const title = textOf(source["title"]) ?? fallbackTitle.trim().slice(0, MAX_FEED_TEXT_CHARS);
  if (title.length === 0) {
    throw new IngestionError("feed-unreadable", "This feed has no name.");
  }
  const description = stripToExcerpt(source["description"] ?? source["subtitle"]);

  const items: FeedItemPreview[] = [];
  // RSS excerpt order: description → content:encoded (removeNSPrefix
  // collapses the namespace). Atom: summary → content. Derived ONCE per
  // feed, not per item.
  const excerptKeys = isAtom ? ["summary", "content"] : ["description", "encoded"];
  for (const raw of rawItems) {
    if (!isRecord(raw)) continue;
    const preview = toPreview(raw, excerptKeys, isAtom);
    if (preview !== null) {
      items.push(preview);
    }
    if (items.length >= MAX_FEED_ITEMS) break;
  }

  return {
    title,
    ...(description !== undefined ? { description } : {}),
    items,
  };
}
