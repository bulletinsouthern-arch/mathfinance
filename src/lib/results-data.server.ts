import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getOptionalSupabaseAdmin } from "@/integrations/supabase/client.server";

type Client = SupabaseClient<Database>;
export type ResultPerson = { username: string; email: string };

// Email enrichment is optional. Names and result rows use the administrator's
// verified session and existing RLS, so missing service credentials cannot hide them.
async function resultPeople(client: Client, ids: string[]) {
  const unique = [...new Set(ids)];
  const people: Record<string, ResultPerson> = {};
  if (!unique.length) return { people, contactsUnavailable: false };
  for (const id of unique) people[id] = { username: "", email: "" };
  const { data: profiles, error: profileError } = await client.from("profiles")
    .select("id,username").in("id", unique).abortSignal(AbortSignal.timeout(10000));
  for (const profile of profiles ?? []) {
    people[profile.id] = { username: profile.username, email: "" };
  }

  const signal = AbortSignal.timeout(5000);
  let admin: ReturnType<typeof getOptionalSupabaseAdmin>;
  try {
    admin = getOptionalSupabaseAdmin(signal);
  } catch {
    return { people, contactsUnavailable: true };
  }
  if (!admin) return { people, contactsUnavailable: true };
  let contactsUnavailable = Boolean(profileError);
  let cursor = 0;
  // A shared deadline and a small worker pool bound contact lookup latency and
  // avoid hundreds of serial administrator requests on larger result lists.
  await Promise.all(Array.from({ length: Math.min(8, unique.length) }, async () => {
    while (cursor < unique.length && !signal.aborted) {
      const id = unique[cursor++];
      if (!id) continue;
      try {
        const { data, error } = await admin.auth.admin.getUserById(id);
        const email = data.user?.email;
        if (error || !email) contactsUnavailable = true;
        else people[id] = { username: people[id]?.username ?? "", email };
      } catch {
        contactsUnavailable = true;
      }
    }
  }));
  return { people, contactsUnavailable: contactsUnavailable || signal.aborted };
}

export async function loadAdminResults(context: { supabase: Client; userId: string }) {
  const client = context.supabase;
  const { data: allowed, error: roleError } = await client.rpc("has_role", {
    _user_id: context.userId, _role: "admin",
  }).abortSignal(AbortSignal.timeout(10000));
  if (roleError) throw new Error("Could not verify administrator access. Please try again.");
  if (!allowed) throw new Error("Administrator access is required to view results.");

  const [attemptResult, requestResult] = await Promise.all([
    client.from("quiz_attempts")
      .select("id,user_id,quiz_id,percent,score,total,passed,created_at,quizzes(title,kind)")
      .order("created_at", { ascending: false }).limit(300).abortSignal(AbortSignal.timeout(10000)),
    client.from("retake_requests")
      .select("id,user_id,quiz_id,message,status,created_at,quizzes(title)")
      .order("created_at", { ascending: false }).limit(200).abortSignal(AbortSignal.timeout(10000)),
  ]);
  // A query failure is not an empty result set. Keep the failure visible and retryable.
  if (attemptResult.error || requestResult.error) {
    throw new Error("Results could not be loaded. Please try again.");
  }
  const {getDatabase} = await import('@netlify/database');
  const db=getDatabase();
  const [nativeAttempts,nativeRequests,quizResult] = await Promise.all([
    db.sql`SELECT id,user_id,quiz_id,email,result,started_at FROM assessment_sessions WHERE result IS NOT NULL ORDER BY started_at DESC LIMIT 300`,
    db.sql`SELECT id,user_id,quiz_id,message,status,created_at,email FROM assessment_retakes ORDER BY created_at DESC LIMIT 200`,
    client.from('quizzes').select('id,title,kind,course_id,courses(title,code)'),
  ]);
  if (quizResult.error) throw new Error('Could not load assessment categories. Retry.');
  const quizzes = Object.fromEntries((quizResult.data ?? []).map(q=>[q.id,q]));
  const attempts: any[] = [...(attemptResult.data ?? []), ...nativeAttempts.map(r=>({...r,...r['result'],created_at:r['started_at']}))].map(r=>({...r,quizzes:quizzes[r.quiz_id] ?? r.quizzes}));
  const requests: any[] = [...(requestResult.data ?? []),...nativeRequests].map(r=>({...r,quizzes:quizzes[r.quiz_id] ?? r.quizzes}));
  attempts.sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
  requests.sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
  const contacts = await resultPeople(client, [...attempts, ...requests].map(row => row.user_id));
  for (const row of [...nativeAttempts,...nativeRequests]) {
    const id=String(row['user_id']);
    if (row['email']) contacts.people[id]={username:contacts.people[id]?.username ?? '',email:String(row['email'])};
  }
  return { attempts, requests, ...contacts };
}
