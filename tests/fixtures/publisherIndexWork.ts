/**
 * Synthetic, sanitized publisher-index work (issue #237). Models the
 * reference source's index/heading disagreement — a publisher "Index" card
 * listing 14 chapter entries whose in-document heading hierarchy conflicts:
 *
 *   - the work-title entry ("The Clockmaker's Archive") names the work, not
 *     a chapter, and links to the work root;
 *   - a self-referential "All Pages" entry links back to the imported
 *     document itself (never a chapter destination, never fetched);
 *   - one chapter title repeats three times ("Letters to the Guild") and the
 *     index disambiguates its own entries with "(2)" / "(3)" ordinals while
 *     the body headings stay bare;
 *   - one index entry carries index-typography punctuation the heading does
 *     not ("APPENDIX: The Final Repair Log" vs the heading's
 *     "APPENDIX<br>The Final Repair Log");
 *   - deeper heading levels (h3 subsections, h4 speech headers) and two
 *     same-level h2 "Session" headings live INSIDE chapters the index
 *     treats as single chapters — the heading heuristic alone would
 *     over-split them.
 *
 * All text and titles are synthetic; nothing copyrighted ships, and the
 * markup carries no network dependency (chapter-page hrefs are never
 * fetched — evidence capture reads entry text only).
 */

export const PUBLISHER_WORK_TITLE = "The Clockmaker's Archive";

/** The fourteen chapter entries the publisher's index lists, in order —
 * verbatim index typography (ordinals, the APPENDIX colon, the en dash). */
export const PUBLISHER_CHAPTER_TITLES: readonly string[] = [
  "Introduction",
  "Foreword for the New Edition",
  "The Early Benches",
  "Letters to the Guild",
  "Letters to the Guild (2)",
  "Letters to the Guild (3)",
  "Some Papers Relating to the Escapement Dispute",
  "The Lost Ledger",
  "Two Speeches at the Guild Assembly",
  "The Winter Danger – The Defense of the Workshop",
  "A Contribution to the Biography of the Founder",
  "How the Great Flood Actually Happened",
  "APPENDIX: The Final Repair Log",
  "The Long Silence",
];

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Index list items: the work-title entry, the fourteen chapters, and (by
 * default) the self-referential "All Pages" entry — the reference card's
 * 16-item shape. `selfLink: false` drops the self entry for paste-path
 * flows, which carry no base URL against which a self-reference could be
 * resolved and excluded (the URL-path exclusion is covered by unit tests
 * that drive the capture with a based document). */
function indexListHtml(variant: "reliable" | "ambiguous-bare-repeats", selfLink: boolean): string {
  const entries: string[] = [];
  entries.push(
    `<li class="py-1"><a href="/the-clockmakers-archive/the-clockmakers-archive.htm">${PUBLISHER_WORK_TITLE}</a></li>`,
  );
  const slugCounts = new Map<string, number>();
  for (const title of PUBLISHER_CHAPTER_TITLES) {
    const listed =
      variant === "ambiguous-bare-repeats" && /\(\d\)$/.test(title)
        ? title.replace(/\s*\(\d\)$/, "")
        : title;
    const slug = slugify(listed);
    const occurrence = (slugCounts.get(slug) ?? 0) + 1;
    slugCounts.set(slug, occurrence);
    const suffix = occurrence > 1 ? `-${occurrence}` : "";
    entries.push(
      `<li class="py-1"><a href="/the-clockmakers-archive/${slug}${suffix}.htm">${listed}</a></li>`,
    );
  }
  if (selfLink) {
    entries.push(
      `<li class="py-1"><a href="/the-clockmakers-archive/all-pages.htm">All Pages</a></li>`,
    );
  }
  return entries.join("\n      ");
}

/** One body paragraph for a chapter: synthetic prose long enough to clear
 * the readerability/confidence gates, with a per-chapter sentinel so
 * text-intactness assertions can quote exact sentences. */
function chapterParagraph(chapter: string, index: number): string {
  return (
    `The ${chapter} account opens with its own record. ` +
    "The archivist copied each bench entry into the workshop ledger before the lamps were trimmed. " +
    `Passage ${index} of the ${chapter} continues with the same steady hand, and the sentinels of ` +
    "this synthetic corpus stay unique enough for quote resolution without borrowing any real text."
  );
}

/** The body headings in document order — deliberately NOT the index's
 * hierarchy (the motivating disagreement). `(2)`-style suffixes never
 * appear in the body; the APPENDIX heading's <br> becomes a space in the
 * canonical text where the index entry carries a colon. */
const BODY_SECTIONS: Array<{ heading: string; level: number; paragraphs: number }> = [
  { heading: "Introduction", level: 2, paragraphs: 2 },
  { heading: "Foreword for the New Edition", level: 2, paragraphs: 2 },
  { heading: "The Early Benches", level: 2, paragraphs: 2 },
  { heading: "Letters to the Guild", level: 2, paragraphs: 2 },
  { heading: "Letters to the Guild", level: 2, paragraphs: 2 },
  { heading: "Letters to the Guild", level: 2, paragraphs: 2 },
  { heading: "Some Papers Relating to the Escapement Dispute", level: 2, paragraphs: 1 },
  { heading: "The First Claim", level: 4, paragraphs: 1 },
  { heading: "The Second Claim", level: 4, paragraphs: 1 },
  { heading: "The Lost Ledger", level: 2, paragraphs: 2 },
  { heading: "Two Speeches at the Guild Assembly", level: 2, paragraphs: 1 },
  { heading: "The First Speech", level: 4, paragraphs: 1 },
  { heading: "The Second Speech", level: 4, paragraphs: 1 },
  { heading: "The Winter Danger – The Defense of the Workshop", level: 2, paragraphs: 2 },
  { heading: "A Contribution to the Biography of the Founder", level: 2, paragraphs: 2 },
  { heading: "How the Great Flood Actually Happened", level: 2, paragraphs: 2 },
  { heading: "APPENDIX<br>The Final Repair Log", level: 2, paragraphs: 2 },
  { heading: "The Long Silence", level: 2, paragraphs: 2 },
  // The reference disagreement's sharpest edge: same-level h2 sessions the
  // index treats as INTERNAL to "The Long Silence".
  { heading: "Session of March 29", level: 2, paragraphs: 2 },
  { heading: "Session of March 30", level: 2, paragraphs: 2 },
  { heading: "Notes", level: 3, paragraphs: 1 },
];

export type PublisherIndexVariant = "reliable" | "ambiguous-bare-repeats";

/**
 * The full paste-shaped document. `reliable` models the reference source's
 * exact disagreement (the fourteen-entry outline resolves to publisher
 * chapters); `ambiguous-bare-repeats` poisons the repeated-label group (the
 * index lists bare repeats with no ordinals) so the whole evidence set must
 * honestly fall back to heading-derived structure.
 */
export function publisherIndexWorkHtml(
  opts: { variant?: PublisherIndexVariant; selfLink?: boolean } = {},
): string {
  const variant = opts.variant ?? "reliable";
  const selfLink = opts.selfLink ?? true;
  const body: string[] = [];
  body.push(
    "<p>Front matter introduces the collection and explains the workshop's habits before the first chapter begins. " +
      "This leading text belongs to the work's opening destination, never to an invented zeroth chapter.</p>",
  );
  let paragraph = 0;
  for (const section of BODY_SECTIONS) {
    body.push(`<h${section.level}>${section.heading}</h${section.level}>`);
    const plainHeading = section.heading.replace("<br>", " ");
    for (let i = 0; i < section.paragraphs; i++) {
      paragraph += 1;
      const sentinel =
        i === 0 && section.level === 2
          ? ` The opening page of ${plainHeading} names itself in prose.`
          : "";
      body.push(`<p>${chapterParagraph(plainHeading, paragraph)}${sentinel}</p>`);
    }
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
<title>${PUBLISHER_WORK_TITLE}</title>
<meta property="og:title" content="${PUBLISHER_WORK_TITLE}">
<meta name="author" content="Synthetic Bench Archive">
</head>
<body>
<article>
<h1>${PUBLISHER_WORK_TITLE}</h1>
<div class="card article-index"><div class="card-body">
<h3>Index</h3>
<ul class="nav flex-column">
      ${indexListHtml(variant, selfLink)}
</ul>
</div></div>
${body.join("\n")}
</article>
</body>
</html>`;
}
