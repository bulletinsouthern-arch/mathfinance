import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getServerEnv } from "./server-env.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveAiEndpoint, resolveAiModel } from "@/lib/settings";

const Msg = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(20000),
  images: z.array(z.string().max(6_000_000)).max(1).optional(),
});

// MFP assistant chat. The Ollama key stays on the server; the AI URL and
// model are admin-editable in site_settings (ai_url, ai_model).
export const mfpChat = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ messages: z.array(Msg).min(1).max(30), timezone: z.string().max(100).optional() }).parse(d))
  .handler(async ({ data }) => {
    try {
      return await runChat(data.messages, undefined, { timezone: data.timezone ?? "UTC" });
    } catch (e) {
      console.error("MFP AI failure");
      return {
        ok: false as const,
        error: "The assistant took too long or is unavailable. Please try again.",
      };
    }
  });

// Admin-only: check whether an AI key is configured (without leaking the secret).
export const getAiKeyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: rows } = await context.supabase
      .from("site_settings")
      .select("key,value")
      .in("key", ["ai_url", "ai_model", "ai_key", "ollama_api_key"]);

    const cfg: Record<string, string> = {};
    for (const r of rows ?? []) cfg[r.key] = r.value;

    const envKey = getServerEnv("OLLAMA_API_KEY");
    const dbKey = cfg["ai_key"] || cfg["ollama_api_key"];
    const activeKey = envKey || dbKey || "";

    return {
      configured: Boolean(activeKey),
      source: envKey
        ? "Netlify environment variable"
        : dbKey
          ? "Admin database setting"
          : "Not configured",
      masked: activeKey ? "••••••••" : "",
      endpoint: resolveAiEndpoint(cfg["ai_url"]),
      model: resolveAiModel(cfg["ai_model"]),
    };
  });

// Admin-only: test the AI connection with candidate or configured key.
export const testAiConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ candidateKey: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: rows } = await context.supabase
      .from("site_settings")
      .select("key,value")
      .in("key", ["ai_url", "ai_model", "ai_key", "ollama_api_key"]);

    const cfg: Record<string, string> = {};
    for (const r of rows ?? []) cfg[r.key] = r.value;

    const candidate = (data.candidateKey ?? "").trim();
    const key =
      candidate || getServerEnv("OLLAMA_API_KEY") || cfg["ai_key"] || cfg["ollama_api_key"];

    if (!key) {
      return { ok: false as const, error: "No AI key provided or configured yet." };
    }

    const url = resolveAiEndpoint(cfg["ai_url"]);
    const model = resolveAiModel(cfg["ai_model"]);

    try {
      const res = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [{ role: "user", content: "ping" }],
        }),
      });

      if (!res.ok) {
        return {
          ok: false as const,
          error: aiHttpError(res.status),
        };
      }

      return { ok: true as const, model };
    } catch {
      return { ok: false as const, error: "AI connection timed out or could not be reached." };
    }
  });

export async function runChat(
  messages: z.infer<typeof Msg>[],
  instruction?: string,
  options?: {
    timeoutMs?: number;
    timezone?: string;
    json?: boolean;
    settingsClient?: { from: (table: string) => any };
  },
): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  const { createClient } = await import("@supabase/supabase-js");
  const pk =
    getServerEnv("SUPABASE_PUBLISHABLE_KEY") ||
    getServerEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    (typeof import.meta !== "undefined" &&
      (import.meta as { env?: Record<string, string> }).env?.["VITE_SUPABASE_PUBLISHABLE_KEY"]) ||
    "";
  const sbUrl =
    getServerEnv("SUPABASE_URL") ||
    getServerEnv("VITE_SUPABASE_URL") ||
    (typeof import.meta !== "undefined" &&
      (import.meta as { env?: Record<string, string> }).env?.["VITE_SUPABASE_URL"]) ||
    "";
  const sb =
    options?.settingsClient ??
    createClient(sbUrl, pk, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (pk.startsWith("sb_") && h.get("Authorization") === `Bearer ${pk}`)
            h.delete("Authorization");
          h.set("apikey", pk);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
  const { data: rows, error: settingsError } = await sb
    .from("site_settings")
    .select("key,value")
    .in("key", ["ai_url", "ai_model", "ai_key", "ollama_api_key"]);
  if (settingsError)
    return {
      ok: false,
      error: "Could not load AI settings. Retry when the connection is restored.",
    };
  const cfg: Record<string, string> = {};
  for (const r of rows ?? []) cfg[r.key] = r.value;
  const key = getServerEnv("OLLAMA_API_KEY") || cfg["ai_key"] || cfg["ollama_api_key"];
  if (!key) {
    console.warn(
      "[MFP AI] AI key is not configured. Please set OLLAMA_API_KEY in Netlify or enter your AI key in Admin Dashboard.",
    );
    return {
      ok: false as const,
      error:
        "No Ollama key is configured. Save the AI key in Admin Settings and test the connection.",
    };
  }
  const url = resolveAiEndpoint(cfg["ai_url"]);
  const model = resolveAiModel(cfg["ai_model"]);

  // Only conversational chat uses live search; structured publishing and
  // visual assessment callers retain their task-specific instructions.
  const freshness = instruction
    ? null
    : await (await import("./ai-freshness.server")).getFreshContext(messages, key, new Date(), options?.timezone);

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(options?.timeoutMs ?? (freshness ? 45000 : 55000)),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        stream: false,
        ...(options?.json
          ? new URL(url).pathname.includes("/api/chat")
            ? { format: "json", options: { num_predict: 16000 } }
            : { response_format: { type: "json_object" } }
          : {}),
        messages: [
          {
            role: "system",
            content:
              instruction ??
              "You can read and explain mathematics in any subject, including algebra, calculus, geometry, science and business. You are MFP, the friendly Math & Finance Pro assistant. Understand Tagalog, Filipino, mixed-language commands, and other languages supported by your model. Respond in the language requested by the user, otherwise use English as your main and default language. Follow instructions using the supplied conversation and images. Be clear about information you cannot access and actions you cannot perform. Speak like a knowledgeable, approachable tutor: lead with the answer, use complete natural sentences, and explain calculations clearly with units and a final result. Format longer answers with short Markdown headings (##), bold key results, spaced paragraphs, and numbered steps or bullet lists when useful. Keep a professional, respectful tone. Use occasional relevant emojis or icon-like symbols such as 💡 for a helpful tip or ✅ for a final result when they improve clarity; keep them restrained, with at most one per heading or key takeaway, and do not decorate every paragraph or list item. Avoid slang, filler, emoji chains, and unnecessary formatting. Avoid unnecessary brackets or parentheses around ordinary prose. Never output numeric citation markers such as [1] or [2], raw reference tokens, stray backslashes, or unexplained symbols in prose. Preserve brackets and parentheses whenever they carry meaning, including mathematical grouping, intervals, matrices, function notation, code, and requested Markdown links; never simplify them in a way that changes a calculation. Preserve meaningful mathematical notation. Preserve currency symbols exactly ($, ₱, €, etc.). Use × and ÷ for multiplication and division in readable formulas instead of ambiguous asterisks. For complex equations use LaTeX inside explicit inline delimiters \\( ... \\) or display delimiters \\[ ... \\]; never use single-dollar math delimiters because dollar signs are currency. Only provide URLs or Markdown links when the latest user message explicitly asks for links, URLs, sources, references, or a website. Otherwise explain the answer without links or a sources section; name a source naturally in prose if needed. When links are requested, prefer retrieved source URLs; never invent URLs or claim a link was verified unless supporting evidence is available. Match the depth to the question and avoid repetitive filler. When the user sends a photo (financial statement, receipt, chart, homework), read it carefully and explain the numbers.",
          },
          ...messages,
          ...(freshness ? [{ role: "system", content: freshness.instruction }] : []),
        ],
      }),
    });
    if (!res.ok) {
      console.error("MFP AI error", res.status);
      return {
        ok: false as const,
        error: aiHttpError(res.status),
      };
    }
    const j = (await res.json().catch(() => ({}))) as {
      message?: { content?: string };
      choices?: { message?: { content?: string } }[];
    };
    const reply = j.message?.content ?? j.choices?.[0]?.message?.content ?? "";
    if (!reply.trim())
      return {
        ok: false,
        error: "AI returned no content. Retry or choose a different model in AI Settings.",
      };
    return {
      ok: true as const,
      reply: String(reply).slice(0, instruction ? 120000 : 19000) + (freshness?.footer ?? ""),
    };
  } catch {
    return {
      ok: false,
      error:
        "The AI service timed out or could not be reached. Retry this request; saved publishing progress is preserved. If this continues, test the model in AI Settings.",
    };
  }
}

function aiHttpError(status: number): string {
  if (status === 401 || status === 403)
    return "AI rejected the configured key. Update the key in AI Settings and test the connection.";
  if (status === 404)
    return "AI endpoint or model was not found. Check the URL and model in AI Settings.";
  if (status === 429) return "AI is rate limited. Wait briefly before retrying.";
  return `AI service returned HTTP ${status}. Test the connection in AI Settings before retrying.`;
}
