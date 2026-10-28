import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveAiEndpoint, resolveAiModel } from "@/lib/settings";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

async function emailMap(ids: string[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const out: Record<string, { email: string; username: string }> = {};
  const uniq = [...new Set(ids)];
  const { data: profs } = await supabaseAdmin.from("profiles").select("id,username").in("id", uniq.length ? uniq : ["00000000-0000-0000-0000-000000000000"]);
  for (const id of uniq) {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
    out[id] = { email: u.user?.email ?? "", username: profs?.find((p) => p.id === id)?.username ?? "" };
  }
  return out;
}

// Admin-only: every exam/quiz attempt with the student's email for personal follow-up.
export const listResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data: attempts } = await context.supabase
      .from("quiz_attempts").select("id,user_id,quiz_id,percent,score,total,passed,created_at,quizzes(title,kind)")
      .order("created_at", { ascending: false }).limit(300);
    const { data: reqs } = await context.supabase
      .from("retake_requests").select("id,user_id,quiz_id,message,status,created_at,quizzes(title)")
      .order("created_at", { ascending: false }).limit(200);
    const people = await emailMap([...(attempts ?? []), ...(reqs ?? [])].map((a: any) => a.user_id));
    return { attempts: attempts ?? [], requests: reqs ?? [], people };
  });

export const decideRetake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), status: z.enum(["accepted", "rejected"]), note: z.string().max(500).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("retake_requests")
      .update({ status: data.status, admin_note: data.note, decided_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin-only: remove a student's result or retake request from the dashboard.
export const deleteResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), table: z.enum(["quiz_attempts", "retake_requests"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from(data.table).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin-only: ask the AI (Ollama) to write questions and insert them into a quiz/exam.
export const aiGenerateQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ quizId: z.string().uuid(), command: z.string().min(3).max(2000), start: z.number().int().min(0) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows } = await context.supabase.from("site_settings").select("key,value").in("key", ["ai_url", "ai_model", "ai_key", "ollama_api_key"]);
    const cfg: Record<string, string> = {};
    for (const r of rows ?? []) cfg[r.key] = r.value;
    const key = process.env["OLLAMA_API_KEY"] || cfg["ai_key"] || cfg["ollama_api_key"];
    if (!key) throw new Error("AI key is not configured. Please set OLLAMA_API_KEY in your Netlify site environment variables, or enter your AI key in the Admin Dashboard under Site text & numbers.");
    const url = resolveAiEndpoint(cfg["ai_url"]);
    const model = resolveAiModel(cfg["ai_model"]);
    const res = await fetch(url, {
      method: "POST", signal: AbortSignal.timeout(120000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model, stream: false, format: "json",
        messages: [
          { role: "system", content: 'You write exam questions. Reply ONLY with JSON: {"questions":[{"qtype":"mcq"|"open","question":"...","a":"...","b":"...","c":"...","d":"...","correct":"a"|"b"|"c"|"d","answer":"model answer for open questions"}]}. Follow the requested count and types exactly. No LaTeX.' },
          { role: "user", content: data.command },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI service error (${res.status})`);
    const j: any = await res.json().catch(() => ({}));
    const txt = String(j.message?.content ?? j.choices?.[0]?.message?.content ?? "");
    let parsed: any;
    try { parsed = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)); } catch { throw new Error("AI reply was not readable, try again."); }
    const qs = (parsed.questions ?? []).slice(0, 100).map((q: any, i: number) => {
      const open = q.qtype === "open";
      return {
        quiz_id: data.quizId, question: String(q.question ?? "").slice(0, 4000), qtype: open ? "open" : "mcq",
        option_a: open ? "" : String(q.a ?? ""), option_b: open ? "" : String(q.b ?? ""),
        option_c: open ? "" : String(q.c ?? ""), option_d: open ? "" : String(q.d ?? ""),
        correct_option: ["a", "b", "c", "d"].includes(q.correct) ? q.correct : "a",
        answer_key: open ? String(q.answer ?? "") : "", sort_order: data.start + i,
      };
    }).filter((q: any) => q.question);
    if (!qs.length) throw new Error("AI returned no questions.");
    const { error } = await context.supabase.from("quiz_questions").insert(qs);
    if (error) throw new Error(error.message);
    return { count: qs.length };
  });
