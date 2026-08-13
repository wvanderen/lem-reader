// src/ingestion/library/SourceBadge.tsx
// Plan 08-03 Task 2 — SourceBadge (D8-02 + LIB-05). A small `.meta`-style
// `<p>` rendering ONE of five text variants based on
// `article.ingestionMeta?.source ?? "fixture"`. Reads as quiet provenance
// metadata — no border, no fill, no icon (UI-SPEC §SourceBadge).
//
// LIB-05 "reach the original source" is satisfied at the row level for the
// `url` + `paste` variants by wrapping the badge text in
// `<a href={sourceUrl} rel="noreferrer noopener" target="_blank">`. Markdown
// + html-upload + fixture variants render plain text (no source URL —
// D8-17 markdown has no canonical URL; html-upload is a paste of arbitrary
// HTML; fixtures are bundled). Mirrors the existing ArticleView "Originally
// published at {domain}" pattern.
//
// The five variants are EXHAUSTIVE over `ArticleSourceSchema`
// (fixture|url|paste|markdown|html-upload — Plan 01 widened the enum).
// Threat T-8-12 (SourceBadge link href injection): the sourceUrl comes from
// `article.provenance.sourceUrl` which is `httpUrl`-refined at ArticleSchema
// parse time — only http(s) URLs survive (Pitfall 5). The
// `rel="noreferrer noopener"` + `target="_blank"` attributes prevent reverse-
// tabnabbing. No `javascript:`/`data:` URI can reach this code path.
import type { CanonicalArticle } from "../../content/types";

interface SourceBadgeProps {
  /** The article whose source the badge describes. */
  article: CanonicalArticle;
}

/**
 * Maps an `ArticleSource` to its display label. Exhaustive over the closed
 * enum (UI-SPEC §SourceBadge table). The switch has NO default — if the enum
 * widens additively in a later phase (e.g. "pdf" Phase 11), TypeScript will
 * flag the unhandled case here.
 */
function badgeLabel(source: NonNullable<CanonicalArticle["ingestionMeta"]>["source"]): string {
  switch (source) {
    case "fixture":
      return "Sample";
    case "url":
      return "Web";
    case "paste":
      return "Pasted";
    case "markdown":
      return "Markdown";
    case "html-upload":
      return "HTML file";
  }
}

export function SourceBadge({ article }: SourceBadgeProps) {
  const source = article.ingestionMeta?.source ?? "fixture";
  const label = badgeLabel(source);
  const sourceUrl = article.provenance.sourceUrl;
  // The link variant renders ONLY when a sourceUrl is present. Per the schema
  // discipline this is true for `url`-sourced articles and SOME paste-HTML
  // articles; it is false for markdown / html-upload / fixtures. The check
  // is on the sourceUrl itself (not on the source kind) so a paste-HTML
  // article whose sourceUrl was preserved still links (mirrors ArticleView).
  if (sourceUrl) {
    return (
      <p className="meta source-badge">
        <a href={sourceUrl} rel="noreferrer noopener" target="_blank">
          {label}
        </a>
      </p>
    );
  }
  return <p className="meta source-badge">{label}</p>;
}
