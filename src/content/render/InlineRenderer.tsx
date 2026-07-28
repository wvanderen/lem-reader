// src/content/render/InlineRenderer.tsx
// Inline mark renderer (D-04 locked set: link, code, strong, em). Mark-
// application order: iterate run.marks and wrap the text node in array order
// (strong, em, code, link). The link mark uses the schema-validated href
// directly — the scheme allow-list already ran at Zod parse time (Pitfall 5
// defense in depth at the boundary). Inline <code> is rendered as <code>
// (styling lives in app.css). NEVER use the React raw-HTML injection prop
// anywhere in this file (Pitfall 6 — react/no-danger enforces statically).
import type { InlineRun } from "../types";

function Inline({ run }: { run: InlineRun }) {
  let node: React.ReactNode = run.text;
  for (const mark of run.marks) {
    switch (mark.type) {
      case "strong":
        node = <strong>{node}</strong>;
        break;
      case "em":
        node = <em>{node}</em>;
        break;
      case "code":
        node = <code>{node}</code>;
        break;
      case "link":
        // href was scheme-validated at Zod parse time (Pitfall 5)
        node = (
          <a href={mark.href} title={mark.title}>
            {node}
          </a>
        );
        break;
    }
  }
  return <>{node}</>;
}

export function InlineList({ runs }: { runs: InlineRun[] }) {
  return (
    <>
      {runs.map((r, i) => (
        <Inline key={i} run={r} />
      ))}
    </>
  );
}

export { Inline };
