import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isUsernameAvailable, signInWithUsername } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/AppShell";

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => z.object({ mode: z.enum(["login", "signup"]).optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Sign In or Get Started — Math & Finance Pro" },
      { name: "description", content: "Sign in with your username or create a free account." },
      { property: "og:title", content: "Sign In — Math & Finance Pro" },
      { property: "og:description", content: "Sign in or create your account." },
    ],
  }),
  component: AuthPage,
});

const signupSchema = z.object({
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(30).regex(/^[A-Za-z0-9_.]+$/, "Letters, numbers, _ and . only"),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
});

function AuthPage() {
  const { mode = "login" } = Route.useSearch();
  const navigate = useNavigate();
  const login = useServerFn(signInWithUsername);
  const checkName = useServerFn(isUsernameAvailable);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [f, setF] = useState({ username: "", email: "", password: "", confirm: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await login({ data: { username: f.username, password: f.password } }).catch(() => ({ ok: false as const, error: "Sign in failed" }));
    if (!res.ok) { setBusy(false); toast.error(res.error); return; }
    await supabase.auth.setSession({ access_token: res.access_token, refresh_token: res.refresh_token });
    setBusy(false);
    toast.success("Welcome back!");
    navigate({ to: "/" });
  }

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    const p = signupSchema.safeParse(f);
    if (!p.success) return void toast.error(p.error.issues[0]?.message ?? "Invalid input");
    if (f.password !== f.confirm) return void toast.error("Passwords do not match");
    setBusy(true);
    const { available } = await checkName({ data: { username: p.data.username } });
    if (!available) { setBusy(false); return void toast.error("That username is taken"); }
    const { error } = await supabase.auth.signUp({
      email: p.data.email,
      password: p.data.password,
      options: { emailRedirectTo: window.location.origin, data: { username: p.data.username } },
    });
    setBusy(false);
    if (error) return void toast.error(error.message.includes("reserved") ? "That username is reserved" : error.message);
    setSent(true);
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-elegant)]">
        <Logo />
        <div className="mt-6 grid grid-cols-2 rounded-lg bg-muted p-1 text-sm">
          <Link to="/auth" search={{ mode: "login" }} className={`rounded-md py-2 text-center ${mode === "login" ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>Sign In</Link>
          <Link to="/auth" search={{ mode: "signup" }} className={`rounded-md py-2 text-center ${mode === "signup" ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>Get Started</Link>
        </div>

        {sent ? (
          <div className="mt-8 text-center">
            <h1 className="text-3xl font-semibold">Check your email</h1>
            <p className="mt-3 text-sm text-muted-foreground">We sent a confirmation link to <b>{f.email}</b>. Click it, then sign in with your username.</p>
          </div>
        ) : mode === "login" ? (
          <form onSubmit={onLogin} className="mt-6 space-y-4">
            <h1 className="text-3xl font-semibold">Welcome back</h1>
            <div><Label>Username or email</Label><Input className="mt-1" autoComplete="username" required value={f.username} onChange={set("username")} /></div>
            <div><Label>Password</Label><Input className="mt-1" type="password" autoComplete="current-password" required value={f.password} onChange={set("password")} /></div>
            <div className="text-right"><Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link></div>
            <Button className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign In"}</Button>
          </form>
        ) : (
          <form onSubmit={onSignup} className="mt-6 space-y-4">
            <h1 className="text-3xl font-semibold">Create your account</h1>
            <div><Label>Username</Label><Input className="mt-1" autoComplete="username" required value={f.username} onChange={set("username")} /></div>
            <div><Label>Email</Label><Input className="mt-1" type="email" autoComplete="email" required value={f.email} onChange={set("email")} /></div>
            <div><Label>Password</Label><Input className="mt-1" type="password" autoComplete="new-password" required value={f.password} onChange={set("password")} /></div>
            <div><Label>Confirm password</Label><Input className="mt-1" type="password" autoComplete="new-password" required value={f.confirm} onChange={set("confirm")} /></div>
            <Button className="w-full" disabled={busy}>{busy ? "Creating…" : "Get Started"}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
