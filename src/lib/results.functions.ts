import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
