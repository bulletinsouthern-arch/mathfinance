import { getDatabase } from "@netlify/database";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireProctor } from "./proctor.server";

type Context = Parameters<typeof requireProctor>[0];

async function administratorIds() {
  const { data, error } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  if (error) throw new Error("Could not load administrators");
  return [...new Set((data ?? []).map((r) => r.user_id))];
}

async function accountByEmail(email: string) {
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error("Account lookup unavailable");
    const account = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (account) return account.id;
    if (data.users.length < 100) break;
  }
  throw new Error("No registered account matches that email. Ask them to register first.");
}

export async function listAdministrators(context: Context) {
  await requireProctor(context);
  const ids = await administratorIds();
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin.from("profiles").select("id,username").in("id", ids);
  if (error) throw new Error("Could not load administrator names");
  // Account emails stay server-side. Usernames identify accounts in the dashboard.
  return ids.map((id) => ({ id, username: data?.find((p) => p.id === id)?.username || id, current: id === context.userId }));
}

export async function changeAdministrator(context: Context, input: { action: "add" | "remove" | "replace"; userId?: string; email?: string }) {
  await requireProctor(context);
  // Serialize changes across server instances, including concurrent last-admin removal.
  const client = await getDatabase().pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(68104291)");
    await requireProctor(context);
    const ids = await administratorIds();
    if (input.action !== "add" && (!input.userId || !ids.includes(input.userId)))
      throw new Error("Administrator no longer exists. Refresh the list.");
    if (input.action === "remove" && ids.length <= 1)
      throw new Error("Add or replace an administrator before removing the last one.");
    if (input.action !== "remove") {
      if (!input.email) throw new Error("Enter the replacement account email");
      const id = await accountByEmail(input.email);
      if (input.action === "replace" && id === input.userId)
        throw new Error("Choose a different registered account for the replacement.");
      const { error } = await supabaseAdmin.from("user_roles").upsert({ user_id: id, role: "admin" }, { onConflict: "user_id,role" });
      if (error) throw new Error("Could not grant administrator access");
    }
    if (input.action !== "add") {
      const { error } = await supabaseAdmin.from("user_roles").delete().eq("user_id", input.userId!).eq("role", "admin");
      if (error) throw new Error("Could not remove administrator access. Any replacement keeps its granted access; retry removal.");
    }
    await client.query("COMMIT");
    return { ok: true, selfRemoved: input.action !== "add" && input.userId === context.userId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
