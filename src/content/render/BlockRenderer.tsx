// src/content/render/BlockRenderer.tsx
// Recursive semantic renderer (DOC-02 reading order, DOC-06 unsupported
// disclosure). BlockView is an exhaustive switch over the 9 locked block kinds;
// TypeScript narrowing flags any missing case at compile time (no default
// fallthrough that swallows exhaustiveness). ArticleBody renders all blocks in
// array order (DOM reading order == array order == document order, by
// construction) followed by an optional footnotes region.
//
// Security (Pitfall 6): the renderer emits ONLY React text children / JSX
// elements — code-block source renders as an auto-escaped text child of
// <pre><code>. The React raw-HTML injection prop is FORBIDDEN anywhere in this
// file; ESLint react/no-danger (enabled in Plan 01) enforces statically.
//
// DOM clobbering (Pitfall 4): footnote ids are schema-locked to /^fn-\d+$/.
// The reference anchor derives its own "fn-ref-N" id and links to the body's
// "fn-N" id — the two ids never collide, and source HTML id attributes are
// never carried through.
import type { Block, CanonicalArticle } from "../types";
import { InlineList } from "./InlineRenderer";

export function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading": {
      const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag>
          <InlineList runs={block.content} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p>
          <InlineList runs={block.content} />
        </p>
      );
    case "blockquote":
      return (
        <blockquote>
          {block.children.map((child, i) => (
            <BlockView key={i} block={child} />
          ))}
        </blockquote>
      );
    case "bulleted-list":
      return (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>
              {item.content.map((c, j) => (
                <BlockView key={j} block={c} />
              ))}
            </li>
          ))}
        </ul>
      );
    case "numbered-list":
      return (
        <ol start={block.start}>
          {block.items.map((item, i) => (
            <li key={i}>
              {item.content.map((c, j) => (
                <BlockView key={j} block={c} />
              ))}
            </li>
          ))}
        </ol>
      );
    case "figure":
      return (
        <figure>
          <img src={block.src} alt={block.alt} />
          {block.caption.length > 0 && (
            <figcaption>
              <InlineList runs={block.caption} />
            </figcaption>
          )}
        </figure>
      );
    case "code-block":
      // NEVER inject raw HTML (Pitfall 6); React escapes source text.
      return (
        <pre>
          <code>{block.source}</code>
        </pre>
      );
    case "footnote-reference": {
      // footnoteId matches /^fn-\d+$/ (Plan 01 Task 2). Extract N and derive
      // distinct ids: anchor gets "fn-ref-N", body <li> keeps "fn-N"
      // (Pitfall 4 fix — DO NOT set the anchor id to block.footnoteId).
      const n = block.footnoteId.replace(/^fn-/, "");
      return (
        <sup>
          <a id={`fn-ref-${n}`} href={`#fn-${n}`}>
            {block.marker}
          </a>
        </sup>
      );
    }
    case "unsupported":
      // DOC-06: inline <details> at canonical position (UI-SPEC §Interaction 3).
      // Native <details> is keyboard-accessible + screen-reader-compatible by
      // default. Summary microcopy is verbatim from UI-SPEC §Copywriting.
      return (
        <details className="disclosure">
          <summary>Some content from the original article isn't supported yet.</summary>
          <ul>
            <li>{block.plainDescription}</li>
          </ul>
        </details>
      );
  }
}

export function ArticleBody({ article }: { article: CanonicalArticle }) {
  return (
    <>
      {article.blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
      {article.footnotes.length > 0 && (
        <section aria-label="Footnotes">
          <ol>
            {article.footnotes.map((fn) => {
              // fn.id is schema-locked to /^fn-\d+$/ (Plan 01 Task 2,
              // Pitfall 4 — DOM-clobbering guard), so the derived suffix `n`
              // is digits-only and safe in both the href fragment and the
              // aria-label. React escapes text/attribute children; the
              // react/no-danger rule forbids raw-HTML injection here.
              const n = fn.id.replace(/^fn-/, "");
              return (
                <li key={fn.id} id={fn.id}>
                  <InlineList runs={fn.content} />
                  {" "}
                  <a href={`#fn-ref-${n}`} aria-label={`Return to reference ${n}`}>
                    {"\u21A9"}
                  </a>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </>
  );
}
