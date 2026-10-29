import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
// Uses the application's existing role system; no login or identity migration.
export const addAdministrator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().trim().email().max(254) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireProctor } = await import("./proctor.server");
    await requireProctor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let id: string | undefined;
    for (let page = 1; page <= 100; page++) {
      const { data: accounts, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 100,
      });
      if (error) throw new Error("Account lookup unavailable");
      id = accounts.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase())?.id;
      if (id || accounts.users.length < 100) break;
    }
    if (!id)
      throw new Error("No registered account matches that email. Ask them to register first.");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: id, role: "admin" }, { onConflict: "user_id,role" });
    if (error) throw new Error("Could not grant administrator access");
    return { ok: true };
  });
