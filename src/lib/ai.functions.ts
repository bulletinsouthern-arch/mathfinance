import { getOllamaApiKey } from "@/lib/ai-env.server";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
  .inputValidator((d) => z.object({ messages: z.array(Msg).min(1).max(30) }).parse(d))
  .handler(async ({ data }) => {
    try {
      return await runChat(data.messages);
    } catch {
      console.error("MFP AI request failed");
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

    const envKey = getOllamaApiKey();
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
      candidate || getOllamaApiKey() || cfg["ai_key"] || cfg["ollama_api_key"];

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
          error: `AI endpoint returned HTTP ${res.status}.`,
        };
      }

      return { ok: true as const, model };
    } catch (e: unknown) {
      return { ok: false as const, error: (e as Error)?.message || "Connection timed out" };
    }
  });

async function runChat(
  messages: z.infer<typeof Msg>[],
): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  const { createClient } = await import("@supabase/supabase-js");
  const pk =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    (typeof import.meta !== "undefined" &&
      (import.meta as { env?: Record<string, string> }).env?.["VITE_SUPABASE_PUBLISHABLE_KEY"]) ||
    "";
  const sbUrl =
    process.env["SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"] ||
    (typeof import.meta !== "undefined" &&
      (import.meta as { env?: Record<string, string> }).env?.["VITE_SUPABASE_URL"]) ||
    "";
  const sb = createClient(sbUrl, pk, {
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
  const { data: rows } = await sb
    .from("site_settings")
    .select("key,value")
    .in("key", ["ai_url", "ai_model", "ai_key", "ollama_api_key"]);
  const cfg: Record<string, string> = {};
  for (const r of rows ?? []) cfg[r.key] = r.value;
  const key = getOllamaApiKey() || cfg["ai_key"] || cfg["ollama_api_key"];
  if (!key) {
    console.warn(
      "[MFP AI] AI key is not configured. Please set OLLAMA_API_KEY in Netlify or enter your AI key in Admin Dashboard.",
    );
    return {
      ok: false as const,
      error: "The MFP assistant is currently unavailable. Please try again shortly.",
    };
  }
  const url = resolveAiEndpoint(cfg["ai_url"]);
  const model = resolveAiModel(cfg["ai_model"]);

  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(55000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You are MFP, the friendly Math & Finance Pro assistant. Talk naturally in plain, simple English like a helpful professional. NEVER use LaTeX, TeX, backslashes, \\frac, \\text, \\[ \\], $ math, or markdown tables. Write formulas in normal text, e.g. 'EVA = NOPAT - (Invested Capital x WACC)', then explain step by step with real numbers. Keep answers short and clear. When the user sends a photo (financial statement, receipt, chart, homework), read it carefully and explain the numbers.",
        },
        ...messages,
      ],
    }),
  });
  if (!res.ok) {
    console.error("MFP AI error", res.status);
    return {
      ok: false as const,
      error: "The MFP assistant is currently unavailable. Please try again shortly.",
    };
  }
  const j = (await res.json().catch(() => ({}))) as {
    message?: { content?: string };
    choices?: { message?: { content?: string } }[];
  };
  const reply = j.message?.content ?? j.choices?.[0]?.message?.content ?? "";
  return { ok: true as const, reply: String(reply).slice(0, 19000) || "(no reply)" };
}
