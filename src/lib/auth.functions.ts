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

// Email-only sign-in. Existing accounts keep their passwords and roles.
export const signInWithEmail = createServerFn({ method: "POST" })
  .inputValidator(d => z.object({email:z.string().trim().email().max(255),password:z.string().min(1).max(200)}).parse(d))
  .handler(async ({data}) => {
    const fail = {ok:false as const,error:"Invalid email or password"};
    const email=data.email.toLowerCase();
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
      const { data: s, error } = await pub.auth.signInWithPassword({ email, password: data.password });
      if (error || !s?.session) {
        if (error?.message?.toLowerCase().includes("confirm")) {
          return { ok: false as const, error: "Please confirm your email first — check your inbox." };
        }
        return fail;
      }
      return { ok: true as const, access_token: s.session.access_token, refresh_token: s.session.refresh_token };
    } catch {
      return fail;
    }
  });
