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

// Sign in with username + password. The email is resolved on the server
// and never returned to the browser.
export const signInWithUsername = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const fail = { ok: false as const, error: "Invalid username/email or password" };
    let email: string | undefined;
    const identifier = data.username.trim();

    if (identifier.includes("@")) {
      // Signed in with an email address directly.
      email = identifier.toLowerCase();
    } else if (identifier.toLowerCase() === "jcoins_net") {
      email = "jcoins.net@gmail.com";
    } else if (process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .ilike("username", identifier.replace(/[%_]/g, "\\$&"))
          .maybeSingle();
        if (prof?.id) {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(prof.id);
          email = u?.user?.email;
        }
      } catch (err) {
        console.warn("Could not query supabaseAdmin for username resolution:", err);
      }
    }

    if (!email) {
      return {
        ok: false as const,
        error: "Could not find an account with that username. Please sign in with your email address.",
      };
    }

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

// Check whether a username is free before signing up.
export const isUsernameAvailable = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ username: z.string().trim().min(3).max(30) }).parse(d))
  .handler(async ({ data }) => {
    const name = data.username.trim().toLowerCase();
    if (name === "jcoins_net") {
      return { available: false };
    }
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
      // Without service role key, allow proceeding; Supabase DB unique index on profiles enforces uniqueness
      return { available: true };
    }
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("username", data.username.replace(/[%_]/g, "\\$&"))
        .maybeSingle();
      return { available: !prof };
    } catch (err) {
      console.warn("Could not check username availability via supabaseAdmin:", err);
      return { available: true };
    }
  });
