import "server-only";

/**
 * Google Gemini (REST). Server only: the key comes from GEMINI_API_KEY (Vercel env) and is
 * never sent to the browser. GEMINI_MODEL picks the model; the default is a fast, low-cost one.
 * Every caller must check isGeminiConfigured() and keep a non-AI fallback.
 */

export const isGeminiConfigured = () => Boolean(process.env.GEMINI_API_KEY);
// "-latest" follows Google's current fast model (about 2 s per reply on the free tier).
// Override with GEMINI_MODEL in Vercel (e.g. a larger model) if needed.
const model = () => process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

export type GeminiMessage = { role: "user" | "model"; text: string };
export type GeminiSource = { title: string; url: string };
export type GeminiResult = { ok: true; text: string; sources: GeminiSource[] } | { ok: false; error: "not_configured" | "limit" | "failed" };

export async function geminiGenerate(opts: {
  system: string;
  messages: GeminiMessage[];
  /** Let the model search Google and return the pages it used. */
  search?: boolean;
  maxTokens?: number;
  temperature?: number;
}): Promise<GeminiResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model())}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: opts.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
        ...(opts.search ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: { temperature: opts.temperature ?? 0.2, maxOutputTokens: opts.maxTokens ?? 2048 },
      }),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    if (res.status === 429) return { ok: false, error: "limit" };
    if (!res.ok) return { ok: false, error: "failed" };
    const json = (await res.json()) as {
      candidates?: {
        content?: { parts?: { text?: string }[] };
        groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
      }[];
    };
    const c = json.candidates?.[0];
    const text = (c?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    const seen = new Set<string>();
    const sources: GeminiSource[] = [];
    for (const g of c?.groundingMetadata?.groundingChunks ?? []) {
      const url = g.web?.uri;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      sources.push({ url, title: (g.web?.title || new URL(url).hostname).slice(0, 120) });
    }
    return text ? { ok: true, text, sources } : { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** Pulls the first JSON object out of a model reply (it may wrap it in ```json fences). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}
