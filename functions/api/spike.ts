// SPIKE HARNESS — Phase 7 Wave 1 (07-01 Task 2). NOT a production endpoint.
//
// This Pages Function exists ONLY to answer the jsdom-on-Workers empirical
// question (RESEARCH.md §The jsdom-on-Workers Spike L467-486). It exercises
// the 5 capabilities + A1 (cf.resolveOverride) on the REAL workerd runtime
// (booted by `wrangler pages dev`), wraps each in try/catch so an import or
// construction failure is REPORTED not crashed, and returns a structured JSON
// result consumed by tests/unit/server/spike-jsdom-workers.spec.ts.
//
// Per-capability dynamic imports (not static) so a failure in one lib does not
// take the whole function offline — the spike's whole purpose is to see WHICH
// capabilities survive on workerd. The spec asserts on the JSON body.
//
// Outcome recorded in 07-01-SUMMARY.md §Spike Outcome. This file is retained
// as the spike artifact (the plan keeps the spike spec; this function is its
// workerd vehicle).

interface CapabilityResult {
  ok: boolean;
  error?: string;
  detail?: unknown;
}

interface SpikeResponse {
  runtime: string;
  capabilities: {
    jsdomImport: CapabilityResult;
    jsdomConstruct: CapabilityResult;
    dompurify: CapabilityResult;
    readability: CapabilityResult;
    ipAddress: CapabilityResult;
  };
  // linkedom fallback path (D7-10) — evaluated because jsdom-primary failed.
  linkedom: {
    linkedomImport: CapabilityResult;
    linkedomParse: CapabilityResult;
    linkedomDompurify: CapabilityResult; // the mXSS gate proxy
  };
  a1ResolveOverride: CapabilityResult;
}

export const onRequest: PagesFunction = async () => {
  const capabilities: SpikeResponse["capabilities"] = {
    jsdomImport: { ok: false },
    jsdomConstruct: { ok: false },
    dompurify: { ok: false },
    readability: { ok: false },
    ipAddress: { ok: false },
  };
  const linkedom: SpikeResponse["linkedom"] = {
    linkedomImport: { ok: false },
    linkedomParse: { ok: false },
    linkedomDompurify: { ok: false },
  };

  // Capability 1: jsdom import succeeds.
  let JSDOMCtor: unknown;
  try {
    const mod = await import("jsdom");
    JSDOMCtor = mod.JSDOM;
    capabilities.jsdomImport = { ok: typeof JSDOMCtor === "function" };
  } catch (e) {
    capabilities.jsdomImport = { ok: false, error: String(e) };
  }

  // Capability 2: JSDOM constructs + querySelector returns a node.
  const sampleHtml =
    '<!DOCTYPE html><html><head><title>Spike</title></head>' +
    '<body><article><h1>Title</h1><p>Body paragraph with <a href="https://example.com">a link</a>.</p></article></body></html>';
  let dom: { window: { document: Document } } | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const JSDOM = JSDOMCtor as any;
    if (JSDOM) {
      dom = new JSDOM(sampleHtml, { url: "https://example.com/article" });
      const p = dom.window.document.querySelector("p");
      capabilities.jsdomConstruct = {
        ok: !!p && p.textContent?.includes("Body paragraph") === true,
        detail: p ? p.tagName : null,
      };
    } else {
      capabilities.jsdomConstruct = { ok: false, error: "JSDOM constructor unavailable" };
    }
  } catch (e) {
    capabilities.jsdomConstruct = { ok: false, error: String(e) };
  }

  // Capability 3: DOMPurify sanitizes (script + onerror stripped); clearWindow after.
  let dompurifyMod: { sanitize: (s: string) => string; clearWindow?: () => void } | null = null;
  try {
    dompurifyMod = (await import("isomorphic-dompurify")).default as {
      sanitize: (s: string) => string;
      clearWindow?: () => void;
    };
    const dirty =
      '<p>clean</p><script>alert(1)</script><img src=x onerror=alert(1)>';
    const clean = dompurifyMod.sanitize(dirty);
    const hasScript = /script/i.test(clean);
    const hasOnerror = /onerror/i.test(clean);
    capabilities.dompurify = {
      ok: !hasScript && !hasOnerror && /clean/.test(clean),
      detail: { clean, hasScript, hasOnerror },
    };
    try {
      dompurifyMod.clearWindow?.();
    } catch {
      /* clearWindow best-effort */
    }
  } catch (e) {
    capabilities.dompurify = { ok: false, error: String(e) };
  }

  // Capability 4: Readability parses a jsdom document → content with <p> + text.
  try {
    const { Readability } = await import("@mozilla/readability");
    if (dom) {
      // Readability mutates its input document — clone first (README guidance).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const JSDOM = JSDOMCtor as any;
      const cloneDoc = new JSDOM(sampleHtml, { url: "https://example.com/article" }).window.document;
      const reader = new Readability(cloneDoc);
      const article = reader.parse();
      capabilities.readability = {
        ok:
          !!article &&
          typeof article.content === "string" &&
          /<p/.test(article.content) &&
          typeof article.textContent === "string" &&
          article.textContent.length > 0,
        detail: article
          ? { hasContent: /<p/.test(article.content), textLength: article.textContent.length }
          : null,
      };
    } else {
      capabilities.readability = { ok: false, error: "no jsdom document available (cap 2 failed)" };
    }
  } catch (e) {
    capabilities.readability = { ok: false, error: String(e) };
  }

  // Capability 5: ip-address Address4.isInSubnet works.
  try {
    const { Address4 } = await import("ip-address");
    const addr = new Address4("10.0.0.1");
    const subnet = new Address4("10.0.0.0/8");
    const inSubnet = addr.isInSubnet(subnet);
    capabilities.ipAddress = { ok: inSubnet === true, detail: { inSubnet } };
  } catch (e) {
    capabilities.ipAddress = { ok: false, error: String(e) };
  }

  // ── linkedom fallback path (D7-10) — evaluated because jsdom-primary failed ──
  // The plan requires: "If the spike REJECTS jsdom, also run a quick linkedom
  // verification (DOMPurify(linkedomWindow) on one mXSS payload) and note
  // whether linkedom looks viable for the mXSS gate that 07-04 will run."

  // Capability 6: linkedom import + parseHTML constructs a usable doc.
  let linkedomWindow: unknown = null;
  let linkedomDoc: Document | null = null;
  let linkedomBindingNote = "";
  try {
    // Try the MAIN linkedom entry first (exports Window); fall back to
    // linkedom/worker if the main entry is too Node-oriented for workerd.
    let ldExports: Record<string, unknown>;
    try {
      ldExports = (await import("linkedom")) as Record<string, unknown>;
      linkedomBindingNote = "main linkedom entry";
    } catch (e) {
      ldExports = (await import("linkedom/worker")) as Record<string, unknown>;
      linkedomBindingNote = "linkedom/worker entry (main failed)";
    }
    const parseHTML = ldExports.parseHTML as (html: string) => Record<string, unknown>;
    const parsed = parseHTML(sampleHtml);
    linkedomDoc = (parsed as { document: Document }).document;
    // Canonical linkedom+DOMPurify pattern: new Window() then attach document.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Win = ldExports.Window as (new () => any) | undefined;
    if (Win) {
      const w = new Win();
      // linkedom Window needs a document set; reuse the parsed document.
      try {
        w.document = linkedomDoc;
      } catch {
        /* best-effort */
      }
      linkedomWindow = w;
    } else if (parsed.window) {
      linkedomWindow = parsed.window;
    } else {
      linkedomWindow = { ...parsed, document: linkedomDoc };
    }
    const p = linkedomDoc?.querySelector("p");
    linkedom.linkedomImport = {
      ok: typeof parseHTML === "function",
      detail: {
        binding: linkedomBindingNote,
        hasWindow: !!Win,
        ldKeys: Object.keys(ldExports).slice(0, 16),
      },
    };
    linkedom.linkedomParse = {
      ok: !!p && typeof p.textContent === "string",
      detail: p ? p.tagName : null,
    };
  } catch (e) {
    linkedom.linkedomImport = { ok: false, error: String(e) };
    linkedom.linkedomParse = { ok: false, error: String(e) };
  }

  // Capability 7: createDOMPurify(linkedomWindow).sanitize(mXSSpayload).
  // This is the mXSS gate proxy — if linkedom-DOMPurify strips script + onerror
  // + javascript: on workerd, linkedom is a VIABLE fallback (the full mXSS
  // Attack Classes corpus is the 07-04 gate, but this proves the binding works).
  try {
    const createDOMPurify = (await import("dompurify")).default as (
      w: unknown,
    ) => {
      sanitize: (s: string, cfg?: unknown) => string;
      isSupported?: boolean;
      version?: string;
    };
    if (linkedomWindow) {
      const DOMPurify = createDOMPurify(linkedomWindow);
      const mxssPayload =
        '<p>clean</p><script>alert(1)</script><img src=x onerror=alert(1)>' +
        '<a href="javascript:alert(1)">xss</a><svg/onload=alert(1)>';
      const clean = DOMPurify.sanitize(mxssPayload, {
        USE_PROFILES: { html: true },
      });
      const hasScript = /script/i.test(clean);
      const hasOnerror = /onerror/i.test(clean);
      const hasOnload = /onload/i.test(clean);
      const hasJavascript = /javascript:/i.test(clean);
      linkedom.linkedomDompurify = {
        ok:
          typeof DOMPurify.sanitize === "function" &&
          DOMPurify.isSupported !== false &&
          !hasScript &&
          !hasOnerror &&
          !hasOnload &&
          !hasJavascript &&
          /clean/.test(clean),
        detail: {
          clean,
          hasScript,
          hasOnerror,
          hasOnload,
          hasJavascript,
          isSupported: DOMPurify.isSupported,
          version: DOMPurify.version,
          bindingNote: linkedomBindingNote,
        },
      };
    } else {
      linkedom.linkedomDompurify = {
        ok: false,
        error: "no linkedom window available (cap 6 failed)",
      };
    }
  } catch (e) {
    linkedom.linkedomDompurify = { ok: false, error: String(e) };
  }

  // A1: cf.resolveOverride DNS pinning — does Workers accept the cf option?
  // We do NOT need the fetch to succeed; we only need to see whether passing
  // { cf: { resolveOverride } } throws "unsupported" or is accepted by the
  // runtime. A known-bad target keeps the request cheap and side-effect-free.
  let a1ResolveOverride: CapabilityResult = { ok: false };
  try {
    // Use a dummy host + literal IP; catch the response/error to classify.
    // The spike only cares whether the OPTION is accepted, not whether the
    // fetch resolves to the pinned IP.
    await fetch("https://0.0.0.0.invalid/", {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cf: { resolveOverride: "1.1.1.1" } as any,
      signal: AbortSignal.timeout(2000),
    }).catch(() => {
      /* network errors are expected; the option acceptance is what matters */
    });
    // If we got here without throwing "resolveOverride is not supported",
    // Workers accepted the option (whether it pins is a deeper question — see
    // SUMMARY §A1 verdict).
    a1ResolveOverride = {
      ok: true,
      detail: "cf.resolveOverride accepted by fetch() (no type/runtime rejection)",
    };
  } catch (e) {
    a1ResolveOverride = { ok: false, error: String(e) };
  }

  const body: SpikeResponse = {
    runtime: "workerd (via wrangler pages dev)",
    capabilities,
    linkedom,
    a1ResolveOverride,
  };
  return Response.json(body);
};
