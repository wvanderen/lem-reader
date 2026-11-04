import type { CanonicalArticle } from "../content/types";
import { recordTrailEvent } from "./paginationTrail";

type Direction = "next" | "previous";
interface TurnReceipt {
  turnSeq: number;
  turnDirection: Direction | null;
}

const receipts = new WeakMap<CanonicalArticle, TurnReceipt>();
const NO_TURN: TurnReceipt = { turnSeq: 0, turnDirection: null };
let sequence = 0;

/** DEV-only evidence of a manual turn that reached a settled semantic page.
 * Layout publications and programmatic TOC/speech jumps never advance it.
 * Article identity keeps receipts across continuation scopes, not readings. */
export function paginationTurnReceipt(article: CanonicalArticle): TurnReceipt {
  return receipts.get(article) ?? NO_TURN;
}

export function acknowledgePaginationTurn(article: CanonicalArticle, direction: Direction): void {
  if (!import.meta.env.DEV) return;
  const receipt = { turnSeq: ++sequence, turnDirection: direction };
  receipts.set(article, receipt);
  // A boundary turn completes asynchronously AFTER its destination's guard
  // settles. Attach its receipt to that publication without faking a reflow
  // or changing any reader state. Later publications carry the same receipt.
  const dev = (
    window as unknown as {
      __lemPagination?: { articleId: string; turnSeq: number; turnDirection: Direction | null };
    }
  ).__lemPagination;
  if (dev?.articleId === article.id) Object.assign(dev, receipt);
  // Issue #255 — the turn receipt is the event that pairs a manual turn with
  // its settled destination; the trail records it with the publication it
  // completed against (identity + ordering, never content).
  recordTrailEvent({
    kind: "turn-receipt",
    articleId: article.id,
    turnSeq: receipt.turnSeq,
    turnDirection: direction,
  });
}
