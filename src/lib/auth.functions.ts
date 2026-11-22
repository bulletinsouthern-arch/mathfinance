import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

function getSupabaseKey(): string {
  return (
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.["VITE_SUPABASE_PUBLISHABLE_KEY"]) ||
    ""
  );
}

function getSupabaseUrl(): string {
  return (
    process.env["SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"] ||
    (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.["VITE_SUPABASE_URL"]) ||
    ""
  );
}

// Resolve account identifiers only on the server. Existing passwords and roles are unchanged.
export const signInWithUsername = createServerFn({ method: "POST" })
  .inputValidator(d => z.object({username:z.string().trim().min(1).max(255),password:z.string().min(1).max(200)}).parse(d))
  .handler(async ({data}) => {
    const fail = {ok:false as const,error:"Invalid username, email or password"};
    let email=data.username.toLowerCase();
    const key = getSupabaseKey();
    const url = getSupabaseUrl();
    if (!key || !url) {
      return { ok: false as const, error: "Authentication service not configured" };
    }

    const pub = createClient(url, key, {
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

    try {
      if (!email.includes("@")) {
        const { getOptionalSupabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = getOptionalSupabaseAdmin();
        if (!admin) return { ok: false as const, error: "Sign-in is temporarily unavailable. Please try again later." };
        // Escape LIKE metacharacters so an underscore or percent is matched literally.
        const pattern = data.username.replace(/[\\%_]/g, "\\$&");
        const { data: profile, error: profileError } = await admin.from("profiles")
          .select("id").ilike("username", pattern).maybeSingle();
        if (profileError) return { ok: false as const, error: "Sign-in is temporarily unavailable. Please try again later." };
        if (!profile) return fail;
        const { data: account, error: accountError } = await admin.auth.admin.getUserById(profile.id);
        if (accountError) return { ok: false as const, error: "Sign-in is temporarily unavailable. Please try again later." };
        if (!account.user?.email) return fail;
        email = account.user.email;
      }
      const { data: s, error } = await pub.auth.signInWithPassword({ email, password: data.password });
      if (error || !s?.session) {
        if (error?.message?.toLowerCase().includes("confirm")) {
          return { ok: false as const, error: "Please confirm your email first — check your inbox." };
        }
        if (error && error.status !== 400 && error.status !== 401 && error.status !== 422) {
          return { ok: false as const, error: "Sign-in is temporarily unavailable. Please try again later." };
        }
        return fail;
      }
      return { ok: true as const, access_token: s.session.access_token, refresh_token: s.session.refresh_token };
    } catch {
      return { ok: false as const, error: "Sign-in is temporarily unavailable. Please try again later." };
    }
  });
