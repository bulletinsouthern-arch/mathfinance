import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Msg = z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(20000), images: z.array(z.string().max(6_000_000)).max(1).optional() });

// MFP assistant chat. The Ollama key stays on the server; the AI URL and
// model are admin-editable in site_settings (ai_url, ai_model).
export const mfpChat = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ messages: z.array(Msg).min(1).max(30) }).parse(d))
  .handler(async ({ data }) => {
    try {
      return await runChat(data.messages);
    } catch (e) {
      console.error("MFP AI failure", e);
      return { ok: false as const, error: "The assistant took too long or is unavailable. Please try again." };
    }
  });

async function runChat(messages: z.infer<typeof Msg>[]): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
    const key = process.env["OLLAMA_API_KEY"];
    if (!key) return { ok: false as const, error: "AI key is not configured." };
    const { createClient } = await import("@supabase/supabase-js");
    const pk = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const sb = createClient(process.env["SUPABASE_URL"]!, pk, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (pk.startsWith("sb_") && h.get("Authorization") === `Bearer ${pk}`) h.delete("Authorization");
          h.set("apikey", pk);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: rows } = await sb.from("site_settings").select("key,value").in("key", ["ai_url", "ai_model"]);
    const cfg: Record<string, string> = {};
    for (const r of rows ?? []) cfg[r.key] = r.value;
    const url = cfg["ai_url"] || "https://ollama.com/api/chat";
    const model = cfg["ai_model"] || "gpt-oss:120b";

    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(55000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: "You are MFP, the friendly Math & Finance Pro assistant. Talk naturally in plain, simple English like a helpful professional. NEVER use LaTeX, TeX, backslashes, \\frac, \\text, \\[ \\], $ math, or markdown tables. Write formulas in normal text, e.g. 'EVA = NOPAT - (Invested Capital x WACC)', then explain step by step with real numbers. Keep answers short and clear. When the user sends a photo (financial statement, receipt, chart, homework), read it carefully and explain the numbers." },
          ...messages,
        ],
      }),
    });
    if (!res.ok) {
      console.error("MFP AI error", res.status, await res.text().catch(() => ""));
      return { ok: false as const, error: `The AI service returned an error (${res.status}).` };
    }
    const j = (await res.json().catch(() => ({}))) as { message?: { content?: string }; choices?: { message?: { content?: string } }[] };
    const reply = j.message?.content ?? j.choices?.[0]?.message?.content ?? "";
    return { ok: true as const, reply: String(reply).slice(0, 19000) || "(no reply)" };
}
