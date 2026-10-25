import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// Sign in with username + password. The email is resolved on the server
// and never returned to the browser.
export const signInWithUsername = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const fail = { ok: false as const, error: "Invalid username/email or password" };
    let email: string | undefined;
    if (data.username.includes("@")) {
      // Signed in with an email address directly.
      email = data.username.toLowerCase();
    } else {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("username", data.username.replace(/[%_]/g, "\\$&"))
        .maybeSingle();
      if (!prof) return fail;
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(prof.id);
      email = u?.user?.email;
    }
    if (!email) return fail;

    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const pub = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: s, error } = await pub.auth.signInWithPassword({ email, password: data.password });
    if (error || !s.session) {
      if (error?.message?.toLowerCase().includes("confirm")) return { ok: false as const, error: "Please confirm your email first — check your inbox." };
      return fail;
    }
    return { ok: true as const, access_token: s.session.access_token, refresh_token: s.session.refresh_token };
  });

// Check whether a username is free before signing up.
export const isUsernameAvailable = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ username: z.string().trim().min(3).max(30) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("username", data.username.replace(/[%_]/g, "\\$&"))
      .maybeSingle();
    return { available: !prof };
  });
